import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { caseEditRequest, caseHistory } from "@/db/schema";
import { c, db, reset } from "./helpers";

beforeEach(reset);
afterEach(() => vi.useRealTimers());
async function setup() {
  const psych = await c.staff.create({}, { name: "Asha", email: "asha@firm.test", designation: "Psychologist" });
  const other = await c.staff.create({}, { name: "Dev", email: "dev@firm.test", designation: "Psychologist" });
  const manager = await c.staff.create({}, { name: "Mona", email: "manager@firm.test", role: "manager" });
  const admin = await c.staff.create({}, { name: "Admin", email: "admin@firm.test", role: "admin" });
  const ccd = await c.staff.create({}, { name: "CCD", email: "ccd@firm.test", designation: "Consultation Coordinator" });
  const client = await c.clients.create({}, { name: "Synthetic client", phone: "9876543210" });
  await c.clients.assignTherapist({}, client.id, { staffId: psych.id });
  await c.caseHistory.saveIntake(psych, client.id, 2, { presentingComplaints: "Original synthetic complaint" });
  await c.caseHistory.saveIntake(psych, client.id, 6, { diagnosisLabel: "Synthetic diagnosis" });
  await c.caseHistory.completeIntake(psych, client.id);
  const request = () => c.caseHistory.requestIntakeEdit(psych, client.id, { step: 2, reason: "Correct a transcription error" });
  const approve = (id: string) => c.caseHistory.reviewIntakeEdit(manager, id, { decision: "approve", reason: "Correction approved" });
  const save = () => c.caseHistory.saveIntake(psych, client.id, 2, { presentingComplaints: "Corrected synthetic complaint" });
  return { psych, other, manager, admin, ccd, client, request, approve, save };
}

describe("completed intake correction approval", () => {
  it("blocks direct writes, preserves initial completion, grants only one section and consumes one save", async () => {
    const { psych, client, request, approve, save } = await setup();
    const original = await c.caseHistory.open(psych, client.id);
    expect(await c.caseHistory.intakeEditSteps(psych, client.id)).toEqual([]);
    await expect(save()).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.completeIntake(psych, client.id)).rejects.toMatchObject({ code: "forbidden" });
    const id = await request();
    await expect(save()).rejects.toMatchObject({ code: "forbidden" });
    await approve(id);
    expect(await c.caseHistory.intakeEditSteps(psych, client.id)).toEqual([2]);
    await expect(c.caseHistory.saveIntake(psych, client.id, 6, { diagnosisLabel: "Denied" })).rejects.toMatchObject({ code: "forbidden" });
    await save();
    await expect(save()).rejects.toMatchObject({ code: "forbidden" });
    const record = await c.caseHistory.open(psych, client.id);
    expect(record.presentingComplaints).toBe("Corrected synthetic complaint");
    expect(record.intakeCompletedAt).toEqual(original.intakeCompletedAt);
    const [grant] = await db.select().from(caseEditRequest).where(eq(caseEditRequest.id, id));
    expect(grant.status).toBe("used");
    expect(grant.previousValues).toMatchObject({ presentingComplaints: "Original synthetic complaint" });
    const audits = await db.execute(sql`select details from audit_log where entity_id = ${record.id} or entity_id = ${id}`);
    expect(JSON.stringify(audits)).not.toContain("synthetic complaint");
  });

  it("shows managers/admins administrative metadata only and enforces role and own-request scope", async () => {
    const { psych, other, manager, admin, ccd, client, request } = await setup();
    const id = await request();
    for (const viewer of [psych, manager, admin]) {
      const rows = await c.caseHistory.editRequests(viewer);
      expect(rows.map(r => r.id)).toContain(id);
      expect(JSON.stringify(rows)).not.toContain("synthetic complaint");
      expect(rows[0]).not.toHaveProperty("previousValues");
    }
    expect(await c.caseHistory.editRequests(other)).toEqual([]);
    await expect(c.caseHistory.editRequests(ccd)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.open(manager, client.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.reviewIntakeEdit(psych, id, { decision: "approve", reason: "Denied" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.reviewIntakeEdit(ccd, id, { decision: "approve", reason: "Denied" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(c.caseHistory.reviewIntakeEdit({ ...manager, id: psych.id }, id, { decision: "approve", reason: "Self approval" })).rejects.toMatchObject({ code: "conflict" });
    await expect(c.caseHistory.requestIntakeEdit(other, client.id, { step: 2, reason: "Wrong therapist request" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("keeps rejection locked and allows a fresh request; admins see the decision", async () => {
    const { psych, manager, admin, request, save } = await setup();
    const id = await request();
    await c.caseHistory.reviewIntakeEdit(manager, id, { decision: "reject", reason: "Please clarify" });
    await expect(save()).rejects.toMatchObject({ code: "forbidden" });
    expect((await c.caseHistory.editRequests(admin)).find(r => r.id === id)).toMatchObject({ status: "rejected", reviewerName: "Mona", decisionReason: "Please clarify" });
    expect(await request()).not.toBe(id);
    expect((await c.caseHistory.editRequests(psych))).toHaveLength(2);
  });

  it("expires unused approval after 24 hours and rejects approvals stale after another edit", async () => {
    const { psych, admin, client, request, approve, save } = await setup();
    const id = await request(); await approve(id);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now()+25*3600000);
    await expect(save()).rejects.toMatchObject({ code: "forbidden" });
    expect(await c.caseHistory.intakeEditSteps(psych, client.id)).toEqual([]);
    expect((await c.caseHistory.editRequests(psych))[0].status).toBe("expired");
    vi.useRealTimers();
    await c.caseHistory.saveIntake(admin, client.id, 3, { medicalHistory: "Synthetic correction" });
    await expect(save()).rejects.toMatchObject({ code: "forbidden" });
    const fresh = await request(); expect(fresh).not.toBe(id);
  });

  it("invalidates the former therapist's approved edit on reassignment", async () => {
    const { psych, other, client, request, approve, save } = await setup();
    const id = await request(); await approve(id);
    await c.clients.assignTherapist({}, client.id, { staffId: other.id, reason: "Synthetic reassignment" });
    await expect(save()).rejects.toMatchObject({ code: "forbidden" });
    expect(await c.caseHistory.intakeEditSteps(psych, client.id)).toEqual([]);
    expect(await c.caseHistory.intakeEditSteps(other, client.id)).toEqual([]);
    await c.clients.assignTherapist({}, client.id, { staffId: psych.id, reason: "Synthetic return" });
    await expect(save()).rejects.toMatchObject({ code: "forbidden" });
  });

  it("serialises concurrent requests, decisions and saves so each has exactly one winner", async () => {
    const { request, approve, save } = await setup();
    const requested = await Promise.allSettled([request(), request()]);
    expect(requested.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const id = (requested.find(r => r.status === "fulfilled") as PromiseFulfilledResult<string>).value;
    const reviewed = await Promise.allSettled([approve(id), approve(id)]);
    expect(reviewed.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const saved = await Promise.allSettled([save(), save()]);
    expect(saved.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });

  it("rolls back consumption and previous values when the clinical write fails", async () => {
    const { request, approve, save } = await setup();
    const id = await request(); await approve(id);
    await db.execute(sql`create function test_reject_intake() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$`);
    await db.execute(sql`create trigger test_reject_intake before update on case_history for each row execute function test_reject_intake()`);
    try {
      await expect(save()).rejects.toThrow();
      const [row] = await db.select().from(caseEditRequest).where(eq(caseEditRequest.id, id));
      expect(row).toMatchObject({ status: "approved", usedAt: null, previousValues: null });
      const [record] = await db.select().from(caseHistory);
      expect(record.presentingComplaints).toBe("Original synthetic complaint");
    } finally {
      await db.execute(sql`drop trigger test_reject_intake on case_history`);
      await db.execute(sql`drop function test_reject_intake()`);
    }
    await expect(save()).resolves.toBeUndefined();
  });
});
