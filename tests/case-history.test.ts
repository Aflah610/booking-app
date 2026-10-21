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
  const clientId = first.clientId;
  await c.clients.assignTherapist({}, clientId, { staffId: asha.id });
  return { asha, dev, manager, lead, book, clientId, first };
}

const noteFor = (bookingId: string) => ({ bookingId, summary: "Rapport building and history.", risk: "low", response: "engaged", progress: "same" });

describe("who can open a case history", () => {
  it("lets the current therapist and a clinical admin in, refuses anyone else", async () => {
    const { asha, dev, manager, lead, clientId } = await setup();
    expect((await c.caseHistory.open(asha, clientId)).status).toBe("intake_pending");
    expect((await c.caseHistory.open(lead, clientId)).clientId).toBe(clientId);
    await expect(c.caseHistory.open(dev, clientId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.open(manager, clientId)).rejects.toMatchObject({ code: "forbidden" });
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
  it("saves each step on its own, rejects values off the lists, and takes the diagnosis title from ICD-11", async () => {
    const { asha, clientId } = await setup();
    await c.caseHistory.saveIntake(asha, clientId, 1, { presentingComplaints: "Worry and poor sleep", onset: "gradual", duration: "6 months", severity: "moderate" });
    await c.caseHistory.saveIntake(asha, clientId, 4, { mseCooperation: "cooperative", mseAffect: "anxious", mseInsight: "good" });
    await c.caseHistory.saveIntake(asha, clientId, 5, { riskSuicide: "low", riskSelfHarm: "none", riskOthers: "none", diagnosisCode: "6B00" });
    const r = await c.caseHistory.open(asha, clientId);
    expect(r).toMatchObject({ presentingComplaints: "Worry and poor sleep", severity: "moderate", mseCooperation: "cooperative", diagnosisLabel: "Generalised anxiety disorder", risk: "low" });

    await expect(c.caseHistory.saveIntake(asha, clientId, 4, { mseAffect: "happy" })).rejects.toThrow();
    await expect(c.caseHistory.saveIntake(asha, clientId, 5, { diagnosisCode: "9Z99" })).rejects.toThrow(/not on the ICD-11 list/);
    await expect(c.caseHistory.saveIntake(asha, clientId, 5, { diagnosisCode: "other" })).rejects.toThrow(/Write the diagnosis/);
    await c.caseHistory.saveIntake(asha, clientId, 5, { diagnosisCode: "other", diagnosisLabel: "Exam stress" });
    expect(await c.caseHistory.open(asha, clientId)).toMatchObject({ diagnosisCode: null, diagnosisLabel: "Exam stress" });
  });

  it("is complete only with presenting complaints and a risk rating, and then the client is in treatment", async () => {
    const { asha, clientId } = await setup();
    await expect(c.caseHistory.completeIntake(asha, clientId)).rejects.toThrow(/presenting complaints/);
    await c.caseHistory.saveIntake(asha, clientId, 1, { presentingComplaints: "Low mood" });
    await expect(c.caseHistory.completeIntake(asha, clientId)).rejects.toThrow(/risk/);
    await c.caseHistory.saveIntake(asha, clientId, 5, { riskSuicide: "moderate" });
    await c.caseHistory.completeIntake(asha, clientId);
    expect(await c.caseHistory.open(asha, clientId)).toMatchObject({ status: "in_treatment", intakeCompletedByName: "Asha" });
  });

  it("never writes clinical text into the audit log", async () => {
    const { asha, clientId } = await setup();
    await c.caseHistory.saveIntake(asha, clientId, 1, { presentingComplaints: "Panic at work" });
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
  it("hides diagnosis from readers without access and shows a therapist only their own clients", async () => {
    const { asha, dev, manager, lead, clientId } = await setup();
    await c.caseHistory.saveIntake(asha, clientId, 5, { riskSuicide: "high", diagnosisCode: "6A70" });
    const forManager = await c.caseHistory.list(manager);
    expect(forManager[0]).toMatchObject({ clientId, restricted: true, diagnosisLabel: null, risk: "high", therapistName: "Asha" });
    expect((await c.caseHistory.list(lead))[0]).toMatchObject({ restricted: false, diagnosisLabel: "Single episode depressive disorder" });
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
    await c.caseHistory.saveIntake(asha, clientId, 5, { riskSelfHarm: "moderate", diagnosisCode: "6B01" });
    const mine = await c.caseHistory.overview(asha, clientId);
    expect(mine.restricted === false && mine.record?.diagnosisLabel).toBe("Panic disorder");
    expect(await c.caseHistory.overview(manager, clientId)).toEqual({ restricted: true, status: "intake_pending", risk: "moderate" });
  });
});
