import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { zonedToUtc } from "@/lib/time";
import { c, db, reset } from "./helpers";

beforeEach(reset);

const at = (local: string) => zonedToUtc(local, "Asia/Kolkata");
const desk: BookingActor = { mode: "staff" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));

async function setup() {
  const therapy = await c.catalog.create({}, { name: "Therapy", durationMin: 60 });
  const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test", designation: "Psychologist" });
  const dev = await c.staff.create({}, { name: "Dev", email: "dev@firm.test", designation: "Psychologist" });
  const manager = await c.staff.create({}, { name: "Mona", email: "mona@firm.test", role: "manager" });
  const lead = await c.staff.create({}, { name: "Lead", email: "lead@firm.test", clinicalAdmin: true });
  for (const s of [asha, dev]) {
    await c.staff.setServices({}, s.id, [therapy.id]);
    await c.schedules.setWeeklyHours({}, s.id, everyDay);
  }
  const book = (staffId: string, start: string, phone = "98765 43210") =>
    c.bookings.create(desk, { serviceId: therapy.id, staffId, start: at(start), client: { name: "Ravi", phone }, useCredits: false }, { now: at("2026-09-01T08:00") }).then((r) => r.booking);
  const first = await book(asha.id, "2026-09-03T10:00");
  // The first booking makes Asha the client's psychologist.
  const clientId = first.clientId;
  return { asha, dev, manager, lead, book, clientId, first };
}

const noteFor = (bookingId: string) => ({ bookingId, summary: "Rapport building and history.", risk: "low", response: "engaged", progress: "same", durationText: "50 mins", therapistSignature: "Asha, MSc" });

describe("who can open a case history", () => {
  it("lets the current therapist and a clinical admin in, refuses anyone else", async () => {
    const { asha, dev, manager, lead, clientId } = await setup();
    expect((await c.caseHistory.open(asha, clientId)).status).toBe("intake_pending");
    expect((await c.caseHistory.open(lead, clientId)).clientId).toBe(clientId);
    await expect(c.caseHistory.open(dev, clientId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.open(manager, clientId)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("revokes direct record and note access when the assigned therapist loses clinical permission", async () => {
    const { asha, clientId, first } = await setup();
    const id = await c.caseHistory.addNote(asha, clientId, noteFor(first.id));
    const revoked = { ...asha, permissions: new Set<never>() };
    expect(await c.caseHistory.canRead(revoked, clientId)).toBe(false);
    await expect(c.caseHistory.open(revoked, clientId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.list(revoked)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.saveIntake(revoked, clientId, 2, { presentingComplaints: "Denied" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.completeIntake(revoked, clientId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.addNote(revoked, clientId, noteFor(first.id))).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.updateDraft(revoked, id, { summary: "Denied" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.signNote(revoked, id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.deleteDraft(revoked, id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.sendFollowUp(revoked, clientId, { suggestedOn: "2027-01-01", whatsapp: true, email: false })).rejects.toMatchObject({ code: "forbidden" });
    expect((await c.caseHistory.open(asha, clientId)).notes[0].summary).toBe(noteFor(first.id).summary);
  });

  it("keeps read-all clinical access read-only, including an author's old drafts", async () => {
    const { asha, clientId, first } = await setup();
    const id = await c.caseHistory.addNote(asha, clientId, noteFor(first.id));
    const reader = { ...asha, permissions: new Set<"casenotes.read_all">(["casenotes.read_all"]) };
    expect((await c.caseHistory.open(reader, clientId)).notes).toHaveLength(1);
    expect(await c.caseHistory.canWrite(reader, clientId)).toBe(false);
    await expect(c.caseHistory.saveIntake(reader, clientId, 2, { presentingComplaints: "Denied" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.addNote(reader, clientId, noteFor(first.id))).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.updateDraft(reader, id, { summary: "Denied" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.signNote(reader, id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.deleteDraft(reader, id)).rejects.toMatchObject({ code: "forbidden" });
    await c.caseHistory.signNote(asha, id);
    await expect(c.caseHistory.addAddendum(reader, id, { text: "Denied" })).rejects.toMatchObject({ code: "forbidden" });
    expect((await c.caseHistory.open(reader, clientId)).notes[0].addenda).toHaveLength(0);
  });

  it("follows a reassignment: the new therapist gets in, the old one is shut out", async () => {
    const { asha, dev, clientId } = await setup();
    await c.caseHistory.open(asha, clientId);
    await c.clients.assignTherapist({}, clientId, { staffId: dev.id, reason: "Asha on leave" });
    expect((await c.caseHistory.open(dev, clientId)).clientId).toBe(clientId);
    await expect(c.caseHistory.open(asha, clientId)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("intake", () => {
  it("saves each MCH step on its own, rejects risk levels off the list, and picks up an ICD-11 code from the diagnosis", async () => {
    const { asha, clientId } = await setup();
    await c.caseHistory.saveIntake(asha, clientId, 2, { presentingComplaints: "Worry and poor sleep", historyPresent: "Six months, worse at exams" });
    await c.caseHistory.saveIntake(asha, clientId, 4, { educationalHistory: "BCom", socialHistory: "Lives with parents" });
    await c.caseHistory.saveIntake(asha, clientId, 5, { mseBehaviour: "Cooperative", mseMoodAffect: "Anxious, congruent", clinicalObservation: "Fidgety" });
    await c.caseHistory.saveIntake(asha, clientId, 6, { riskSuicide: "low", riskSelfHarm: "none", riskOthers: "severe", riskNotes: "No intent", diagnosisLabel: "6B00 Generalised anxiety disorder", planNotes: "Weekly CBT" });
    const r = await c.caseHistory.open(asha, clientId);
    expect(r).toMatchObject({
      presentingComplaints: "Worry and poor sleep", educationalHistory: "BCom", mseBehaviour: "Cooperative", clinicalObservation: "Fidgety",
      riskOthers: "severe", riskNotes: "No intent", diagnosisCode: "6B00", diagnosisLabel: "6B00 Generalised anxiety disorder", planNotes: "Weekly CBT", risk: "severe",
    });

    await expect(c.caseHistory.saveIntake(asha, clientId, 6, { riskSuicide: "extreme" })).rejects.toThrow();
    await expect(c.caseHistory.saveIntake(asha, clientId, 1, { presentingComplaints: "x" })).rejects.toThrow(/does not exist/);
    await c.caseHistory.saveIntake(asha, clientId, 6, { diagnosisLabel: "Exam stress" });
    expect(await c.caseHistory.open(asha, clientId)).toMatchObject({ diagnosisCode: null, diagnosisLabel: "Exam stress" });
  });

  it("is complete only with presenting complaints and a primary diagnosis, and then the client is in treatment", async () => {
    const { asha, clientId } = await setup();
    await expect(c.caseHistory.completeIntake(asha, clientId)).rejects.toThrow(/presenting complaints/);
    await c.caseHistory.saveIntake(asha, clientId, 2, { presentingComplaints: "Low mood" });
    await expect(c.caseHistory.completeIntake(asha, clientId)).rejects.toThrow(/primary diagnosis/);
    await c.caseHistory.saveIntake(asha, clientId, 6, { diagnosisLabel: "Adjustment disorder" });
    await c.caseHistory.completeIntake(asha, clientId);
    expect(await c.caseHistory.open(asha, clientId)).toMatchObject({ status: "in_treatment", intakeCompletedByName: "Asha" });
  });

  it("never writes clinical text into the audit log", async () => {
    const { asha, clientId } = await setup();
    await c.caseHistory.saveIntake(asha, clientId, 2, { presentingComplaints: "Panic at work" });
    const rows = (await db.execute(sql`select details::text as d from audit_log where entity = 'case_history'`)).rows as { d: string }[];
    expect(rows[0].d).toContain("presentingComplaints");
    expect(rows[0].d).not.toContain("Panic");
  });
});

describe("session notes", () => {
  it("numbers notes in order, stamps author and session time, and lists newest first", async () => {
    const { asha, book, clientId, first } = await setup();
    const second = await book(asha.id, "2026-09-10T10:00");
    await c.caseHistory.addNote(asha, clientId, noteFor(first.id));
    await c.caseHistory.addNote(asha, clientId, noteFor(second.id));
    const notes = (await c.caseHistory.open(asha, clientId)).notes;
    expect(notes.map((n) => n.number)).toEqual([2, 1]);
    expect(notes[1]).toMatchObject({ authorName: "Asha", bookingId: first.id, signedAt: null });
    expect(notes[1].sessionAt.getTime()).toBe(first.startsAt.getTime());
  });

  it("gives two notes saved at the same moment different numbers", async () => {
    const { asha, clientId } = await setup();
    await Promise.all([
      c.caseHistory.addNote(asha, clientId, { sessionOn: "2026-08-01", summary: "A" }),
      c.caseHistory.addNote(asha, clientId, { sessionOn: "2026-08-08", summary: "B" }),
    ]);
    expect((await c.caseHistory.open(asha, clientId)).notes.map((n) => n.number).sort()).toEqual([1, 2]);
  });

  it("refuses another client's booking, and a second note for one booking", async () => {
    const { asha, book, clientId, first } = await setup();
    const other = await book(asha.id, "2026-09-04T10:00", "98765 00001");
    await expect(c.caseHistory.addNote(asha, clientId, noteFor(other.id))).rejects.toMatchObject({ code: "invalid" });
    await c.caseHistory.addNote(asha, clientId, noteFor(first.id));
    await expect(c.caseHistory.addNote(asha, clientId, noteFor(first.id))).rejects.toMatchObject({ code: "conflict" });
  });

  it("lets only the author edit or delete a draft, locks it once signed, and takes addenda after", async () => {
    const { asha, lead, clientId, first } = await setup();
    const id = await c.caseHistory.addNote(asha, clientId, noteFor(first.id));
    await expect(c.caseHistory.updateDraft(lead, id, { summary: "changed" })).rejects.toMatchObject({ code: "forbidden" });
    await c.caseHistory.updateDraft(asha, id, { summary: "Edited summary" });
    await expect(c.caseHistory.addAddendum(asha, id, { text: "too early" })).rejects.toMatchObject({ code: "invalid" });
    await c.caseHistory.signNote(asha, id);
    await expect(c.caseHistory.updateDraft(asha, id, { summary: "after signing" })).rejects.toMatchObject({ code: "conflict" });
    await expect(c.caseHistory.deleteDraft(asha, id)).rejects.toMatchObject({ code: "conflict" });
    await c.caseHistory.addAddendum(lead, id, { text: "Correction: risk reviewed, low." });
    const [n] = (await c.caseHistory.open(asha, clientId)).notes;
    expect(n.summary).toBe("Edited summary");
    expect(n.signedAt).not.toBeNull();
    expect(n.addenda).toEqual([expect.objectContaining({ authorName: "Lead", text: "Correction: risk reviewed, low." })]);
  });

  it("offers only the client's past, uncancelled sessions without a note", async () => {
    const { asha, book, clientId, first } = await setup();
    await book(asha.id, "2027-01-05T10:00");
    await c.caseHistory.addNote(asha, clientId, noteFor(first.id));
    const second = await book(asha.id, "2026-09-12T10:00");
    expect((await c.caseHistory.noteableBookings(asha, clientId, at("2026-10-01T00:00"))).map((b) => b.id)).toEqual([second.id]);
  });
});

describe("the list", () => {
  it("lists only people in treatment, not unpaid website attempts, leads or untouched clients", async () => {
    const { lead, book, clientId, asha } = await setup();
    // A lead who only messaged, and a client added by hand with nothing else.
    await c.leads.receive({ phone: "98000 00001", name: "Lead only", source: "whatsapp" });
    await c.clients.create({}, { name: "Walk in", phone: "98000 00002" });
    // A website booking still waiting for online payment.
    await db.execute(sql`update business set online_payment = true`);
    const unpaid = await book(asha.id, "2026-09-04T10:00", "98000 00003");
    await db.execute(sql`update booking set payment_due_at = now() + interval '10 minutes', payment_status = 'pending' where id = ${unpaid.id}`);
    // A real unpaid checkout never gets a psychologist; this one was made confirmed, so take that back.
    await db.execute(sql`delete from client_therapist where client_id = ${unpaid.clientId}`);
    // A booking the coordinator made (no online payment window): this person is in treatment.
    const desk = await book(asha.id, "2026-09-05T10:00", "98000 00004");
    expect((await c.caseHistory.list(lead)).map((r) => r.clientId).sort()).toEqual([clientId, desk.clientId].sort());
    // Once the website booking is paid, they appear too.
    await db.execute(sql`update booking set payment_status = 'paid' where id = ${unpaid.id}`);
    expect((await c.caseHistory.list(lead)).map((r) => r.clientId)).toContain(unpaid.clientId);
  });

  it("hides diagnosis from readers without access and shows a therapist only their own clients", async () => {
    const { asha, dev, manager, lead, clientId } = await setup();
    await c.caseHistory.saveIntake(asha, clientId, 6, { riskSuicide: "high", diagnosisLabel: "6A70 Single episode depressive disorder" });
    // Managers see only which notes are pending (a separate page), never the case history list.
    await expect(c.caseHistory.list(manager)).rejects.toMatchObject({ code: "forbidden" });
    expect((await c.caseHistory.list(lead))[0]).toMatchObject({ restricted: false, diagnosisLabel: "6A70 Single episode depressive disorder" });
    expect(await c.caseHistory.list(dev)).toEqual([]);
    expect((await c.caseHistory.list(asha)).map((r) => r.clientId)).toEqual([clientId]);
    expect((await c.caseHistory.list(lead, { status: "high_risk" })).length).toBe(1);
    expect((await c.caseHistory.list(lead, { therapist: "unassigned" })).length).toBe(0);
  });
});

describe("the client page overview", () => {
  it("shows the record to the therapist and only status and risk to anyone else, without creating a record", async () => {
    const { asha, manager, clientId } = await setup();
    expect(await c.caseHistory.overview(asha, clientId)).toEqual({ restricted: false, record: null });
    expect(await c.caseHistory.overview(manager, clientId)).toEqual({ restricted: true, status: null, risk: null });
    await c.caseHistory.saveIntake(asha, clientId, 6, { riskSelfHarm: "moderate", diagnosisLabel: "Panic disorder" });
    const mine = await c.caseHistory.overview(asha, clientId);
    expect(mine.restricted === false && mine.record?.diagnosisLabel).toBe("Panic disorder");
    expect(await c.caseHistory.overview(manager, clientId)).toEqual({ restricted: true, status: "intake_pending", risk: "moderate" });
  });
});

describe("case list date filter", () => {
  it("keeps clients whose last session note falls in the range, and drops those with no notes", async () => {
    const { asha, lead, clientId } = await setup();
    await c.caseHistory.addNote(asha, clientId, { sessionOn: "2026-10-05", summary: "x" });
    expect((await c.caseHistory.list(lead, { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-08T00:00:00Z") })).length).toBe(1);
    expect((await c.caseHistory.list(lead, { from: new Date("2026-10-06T00:00:00Z") })).length).toBe(0);
  });
});

describe("follow-up suggestions", () => {
  it("sends the suggested date by WhatsApp and email, books nothing, and records who sent it and how each channel went", async () => {
    const { createContainer } = await import("@/features/container");
    const { NotConfigured } = await import("@/features/workflows/workflows.dto");
    const sent: { channel: string; to?: string; params?: string[]; body?: string }[] = [];
    const k = createContainer(db, {
      senders: {
        email: async (m) => { sent.push(m as never); return {}; },
        whatsapp: async () => { throw new NotConfigured("WhatsApp isn't set up yet"); },
        webhook: async () => ({}),
      },
    });
    const { asha, clientId } = await setup();
    await c.clients.updateProfile({}, clientId, { name: "Ravi Kumar", email: "ravi@example.com", whatsappOptIn: true });
    const bookingsBefore = (await k.bookings.list({ view: "all", clientId })).length;

    const result = await k.caseHistory.sendFollowUp({ ...asha, name: "Asha" }, clientId,
      { suggestedOn: "2026-10-30", partOfDay: "afternoon", note: "Bring your thought diary.", whatsapp: true, email: true }, at("2026-10-21T10:00"));
    expect(result).toEqual({ whatsapp: "not_set_up", email: "sent" });
    expect(sent[0]).toMatchObject({ channel: "email", to: "ravi@example.com" });
    expect(sent[0].body).toContain("Asha suggests your next session around Fri, 30 Oct (afternoon).");
    expect(sent[0].body).toContain("Bring your thought diary.");
    expect((await k.bookings.list({ view: "all", clientId })).length).toBe(bookingsBefore);

    const [f] = (await k.caseHistory.open(asha, clientId)).followUps;
    expect(f).toMatchObject({ suggestedOn: "2026-10-30", partOfDay: "afternoon", sentByName: "Asha", whatsapp: "not_set_up", email: "sent" });
  });

  it("refuses a past date, no channel, and readers without access; a client without email is marked so", async () => {
    const { asha, dev, clientId } = await setup();
    const now = at("2026-10-21T10:00");
    await expect(c.caseHistory.sendFollowUp(asha, clientId, { suggestedOn: "2026-10-01", whatsapp: true, email: false }, now)).rejects.toMatchObject({ code: "invalid" });
    await expect(c.caseHistory.sendFollowUp(asha, clientId, { suggestedOn: "2026-10-30", whatsapp: false, email: false }, now)).rejects.toThrow(/WhatsApp, email or both/);
    await expect(c.caseHistory.sendFollowUp(dev, clientId, { suggestedOn: "2026-10-30", whatsapp: true, email: true }, now)).rejects.toMatchObject({ code: "forbidden" });
    expect(await c.caseHistory.sendFollowUp(asha, clientId, { suggestedOn: "2026-10-30", whatsapp: false, email: true }, now)).toEqual({ whatsapp: "not_chosen", email: "no_contact" });
  });
});
