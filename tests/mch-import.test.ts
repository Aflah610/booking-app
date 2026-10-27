import { beforeEach, describe, expect, it } from "vitest";
import { importMch, type MchExport } from "@/features/mch-import/mch-import.repository";
import { c, db, reset } from "./helpers";

beforeEach(reset);

const client = (id: number, phone: string, extra: Partial<MchExport["clients"][number]> = {}): MchExport["clients"][number] => ({
  id, client_code: `ML-CL-${String(id).padStart(5, "0")}`, full_name: `Client ${id}`, gender: "Female", age: 30, dob: null, phone, email: null,
  address: "Kochi", current_location: "Kochi", occupation: "Teacher", education: "MA", marital_status: "Single", registration_date: "2026-03-01",
  emergency_contact: "+91 90000 00000", assigned_psychologist_id: 1, created_at: "2026-03-01T05:00:00Z", ...extra,
});

function exportWith(over: Partial<MchExport> = {}): MchExport {
  return {
    users: [{ id: 10, name: "Dr. Asha Menon" }, { id: 11, name: "Someone Gone" }],
    psychologists: [{ id: 1, user_id: 10 }, { id: 2, user_id: 11 }],
    clients: [client(1, "98765 00001", { created_by_id: 10 }), client(2, "98765 00002", { assigned_psychologist_id: 2 })],
    assignments: [
      { id: 1, client_id: 1, psychologist_id: 1, start_date: "2026-03-01", end_date: null, assigned_by_id: null, reason: "Initial" },
    ],
    case_histories: [{
      id: 5, client_id: 1, psychologist_id: 1, presenting_problems: "Worry", history_of_present_illness: "Since January", medical_history: null,
      psychiatric_history: null, family_history: null, personal_history: null, educational_history: "MA", occupational_history: null,
      relationship_history: null, substance_use: null, social_history: null,
      mental_status_examination: { behavior: "Calm", insightAndJudgment: "Good" }, clinical_observation: "Tearful",
      diagnosis: { primaryDiagnosis: "6B00 Generalised anxiety disorder" }, treatment_goals: "Weekly", treatment_plan: { modality: "CBT" },
      risk_assessment: { suicideRisk: "Low", homicideRisk: "Severe", selfHarmRisk: "Moderate", riskNotes: "Watch" },
      therapist_notes: null, remarks: null, created_at: "2026-03-01T06:00:00Z", updated_at: "2026-03-02T06:00:00Z",
    }],
    session_notes: [
      { id: 7, client_id: 1, psychologist_id: 1, session_number: 1, session_date: "2026-03-08", duration: "50 mins", notes: "First", clinical_observation: null, progress: "Better", risk_level: "Low", homework: null, treatment_recommendation: "Continue", follow_up_date: null, therapist_signature: "Asha", created_at: "2026-03-08T09:00:00Z" },
      { id: 8, client_id: 1, psychologist_id: 2, session_number: 2, session_date: "2026-03-15", duration: "50 mins", notes: "", clinical_observation: null, progress: null, risk_level: "High", homework: null, treatment_recommendation: null, follow_up_date: null, therapist_signature: null, created_at: "2026-03-15T09:00:00Z" },
    ],
    ...over,
  };
}

async function staff() {
  const asha = await c.staff.create({}, { name: "Asha Menon", email: "asha@firm.test", designation: "Psychologist" });
  const admin = await c.staff.create({}, { name: "Admin", email: "admin@firm.test", role: "admin", clinicalAdmin: true });
  return { asha, admin };
}

describe("psychologist history from MCH", () => {
  it("keeps the open period as the current psychologist even when a closed one started later", async () => {
    const { asha } = await staff();
    const gone = await c.staff.create({}, { name: "Someone Gone", email: "gone@firm.test", designation: "Psychologist" });
    await importMch(db, exportWith({
      case_histories: [], session_notes: [],
      assignments: [
        { id: 1, client_id: 1, psychologist_id: 1, start_date: "2026-08-13", end_date: null, assigned_by_id: null, reason: null },
        { id: 2, client_id: 1, psychologist_id: 2, start_date: "2026-08-14", end_date: "2026-08-14", assigned_by_id: null, reason: "Covering" },
      ],
    }), { fallbackAuthorId: asha.id });
    const one = (await db.query.client.findMany()).find((r) => r.mchId === 1)!;
    const history = await c.clients.therapistHistory(one.id);
    expect(history.find((h) => h.endsAt === null)?.staffId).toBe(asha.id);
    expect(history.map((h) => h.staffId)).toContain(gone.id);
  });
});

describe("copying from MCH", () => {
  it("brings clients, psychologist, case history and signed notes across, matching staff by name", async () => {
    const { asha, admin } = await staff();
    const report = await importMch(db, exportWith(), { fallbackAuthorId: admin.id });
    expect(report).toMatchObject({ clientsCreated: 2, clientsMatched: 0, periods: 1, caseHistories: 1, notes: 2, notesByFallbackAuthor: 1, unmatchedPsychologists: ["Someone Gone"] });

    const rows = await db.query.client.findMany();
    const one = rows.find((r) => r.mchId === 1)!;
    expect(one).toMatchObject({ mchCode: "ML-CL-00001", phoneE164: "+919876500001", age: 30, location: "Kochi", emergencyPhone: "+919000000000", emergencyName: null });
    expect(one.createdAt.toISOString().slice(0, 10)).toBe("2026-03-01");
    // Who registered the client in MCH carries over when that person has an account here.
    expect(one.registeredBy).toBe(asha.id);
    expect(rows.find((r) => r.mchId === 2)!.registeredBy).toBeNull();

    const r = await c.caseHistory.open(asha, one.id);
    expect(r).toMatchObject({
      status: "in_treatment", presentingComplaints: "Worry", mseBehaviour: "Calm", mseInsightJudgement: "Good", diagnosisCode: "6B00",
      riskOthers: "severe", riskSelfHarm: "moderate", risk: "severe", approach: "CBT", planNotes: "Weekly", educationalHistory: "MA",
    });
    expect(r.notes.map((n) => [n.number, n.authorName, n.summary, n.risk, !!n.signedAt])).toEqual([
      [2, "Admin", "(No notes written in MCH)", "high", true],
      [1, "Asha Menon", "First", "low", true],
    ]);
    expect(r.notes[1]).toMatchObject({ progressNotes: "Better", nextPlan: "Continue", durationText: "50 mins", therapistSignature: "Asha" });
  });

  it("matches a shorter or longer spelling of a name, and can add missing psychologists switched off", async () => {
    const { asha, admin } = await staff();
    const data = exportWith({ users: [{ id: 10, name: "asha" }, { id: 11, name: "Someone Gone" }] });
    const report = await importMch(db, data, { fallbackAuthorId: admin.id, createMissingStaff: true });
    expect(report).toMatchObject({ staffCreated: ["Someone Gone"], unmatchedPsychologists: [], notesByFallbackAuthor: 0, periods: 2 });
    const gone = (await db.query.staff.findMany()).find((s) => s.name === "Someone Gone")!;
    expect(gone).toMatchObject({ active: false, accessRole: "psychologist", passwordHash: null });
    const notes = await db.query.sessionNote.findMany();
    expect(notes.map((n) => n.authorId).sort()).toEqual([asha.id, gone.id].sort());
  });

  it("can run again without copying anything twice, and a dry run saves nothing", async () => {
    const { admin } = await staff();
    expect((await importMch(db, exportWith(), { fallbackAuthorId: admin.id, dryRun: true })).clientsCreated).toBe(2);
    expect(await db.query.client.findMany()).toEqual([]);
    await importMch(db, exportWith(), { fallbackAuthorId: admin.id });
    const again = await importMch(db, exportWith(), { fallbackAuthorId: admin.id });
    expect(again).toMatchObject({ clientsCreated: 0, clientsMatched: 2, periods: 0, caseHistories: 0, notes: 0 });
    expect((await db.query.sessionNote.findMany()).length).toBe(2);
  });

  it("joins a client who already booked here by phone, keeping details already here, and leaves out shared phone numbers", async () => {
    const { admin } = await staff();
    await c.clients.create({}, { name: "Ravi Here", phone: "98765 00001", occupation: "Engineer" });
    const report = await importMch(db, exportWith({ clients: [client(1, "98765 00001"), client(3, "98765 00009"), client(4, "+91 98765 00009")] }), { fallbackAuthorId: admin.id });
    expect(report).toMatchObject({ clientsCreated: 0, clientsMatched: 1 });
    expect(report.clientsSkipped.map((s) => s.code)).toEqual(["ML-CL-00003", "ML-CL-00004"]);
    const [ravi] = await db.query.client.findMany();
    expect(ravi).toMatchObject({ name: "Ravi Here", occupation: "Engineer", education: "MA", mchCode: "ML-CL-00001" });
  });
});
