import { beforeEach, describe, expect, it } from "vitest";
import { c, db, reset } from "./helpers";
import { auditLog } from "@/db/schema";
import { DomainError } from "@/features/shared/errors";

beforeEach(reset);

describe("api keys", () => {
  it("verifies a fresh key and stores only its hash", async () => {
    const { key, record } = await c.apiKeys.create({ name: "Website", scopes: ["website"] });
    expect(record).not.toHaveProperty("keyHash");
    expect((await c.apiKeys.verify(key))?.id).toBe(record.id);
    expect(await c.apiKeys.verify(key + "x")).toBeNull();
    expect(await c.apiKeys.verify(null)).toBeNull();
  });

  it("rejects a revoked key", async () => {
    const { key, record } = await c.apiKeys.create({ name: "Old", scopes: ["website"] });
    await c.apiKeys.revoke(record.id);
    expect(await c.apiKeys.verify(key)).toBeNull();
  });

  it("needs a name", async () => {
    await expect(c.apiKeys.create({ name: "  ", scopes: ["website"] })).rejects.toMatchObject({ code: "invalid" });
  });

  it("lists only live keys, without the secret", async () => {
    const live = await c.apiKeys.create({ name: "Live", scopes: ["website"] });
    const old = await c.apiKeys.create({ name: "Old", scopes: ["website"] });
    await c.apiKeys.revoke(old.record.id);
    const list = await c.apiKeys.list();
    expect(list.map((k) => k.name)).toEqual(["Live"]);
    expect(JSON.stringify(list)).not.toContain(live.key);
  });
});

describe("staff", () => {
  it("creates bootstrap admins on first login, case-insensitively", async () => {
    const member = await c.staff.resolveLogin({ email: "Boss@Firm.test", name: "Boss" }, ["boss@firm.test"]);
    expect(member).toMatchObject({ role: "admin", email: "boss@firm.test" });
    const again = await c.staff.resolveLogin({ email: "boss@firm.test" }, ["boss@firm.test"]);
    expect(again?.id).toBe(member?.id);
  });

  it("refuses unknown and inactive accounts", async () => {
    expect(await c.staff.resolveLogin({ email: "stranger@x.test" }, [])).toBeNull();
    await c.staff.create({}, { name: "Gone", email: "gone@firm.test", active: false });
    expect(await c.staff.resolveLogin({ email: "gone@firm.test" }, [])).toBeNull();
  });

  it("rejects duplicate emails", async () => {
    await c.staff.create({}, { name: "A", email: "a@firm.test" });
    await expect(c.staff.create({}, { name: "A2", email: "A@firm.test" })).rejects.toBeInstanceOf(DomainError);
  });

  it("treats a malformed id as not found", async () => {
    await expect(c.staff.get("not-a-uuid")).rejects.toMatchObject({ code: "not_found" });
  });

  it("writes an audit row with the change", async () => {
    const admin = await c.staff.create({}, { name: "Admin", email: "admin@firm.test", role: "admin" });
    const s = await c.staff.create({ staffId: admin.id }, { name: "Asha", email: "asha@firm.test" });
    await c.staff.update({ staffId: admin.id }, s.id, { role: "manager" });
    const rows = await db.select().from(auditLog);
    expect(rows.find((r) => r.action === "update")).toMatchObject({
      actorStaffId: admin.id,
      entity: "staff",
      entityId: s.id,
      details: { role: "manager" },
    });
  });
});

describe("catalog and schedules", () => {
  it("lists only active staff offering a service", async () => {
    const svc = await c.catalog.create({}, { name: "Consult", durationMin: 30 });
    const a = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    const b = await c.staff.create({}, { name: "Ben", email: "ben@firm.test", active: false });
    await c.staff.setServices({}, a.id, [svc.id]);
    await c.staff.setServices({}, b.id, [svc.id]);
    expect((await c.staff.listBookableForService(svc.id)).map((s) => s.name)).toEqual(["Asha"]);
  });

  it("stores per-service booking rules, null meaning business default", async () => {
    const svc = await c.catalog.create({}, { name: "Consult", durationMin: 30, minNoticeMin: 120 });
    expect(svc).toMatchObject({ minNoticeMin: 120, slotIntervalMin: null, maxNoticeDays: null });
  });

  it("saves several ranges per day and rejects overlaps", async () => {
    const a = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await c.schedules.setWeeklyHours({}, a.id, [
      { weekday: 1, startTime: "14:00", endTime: "18:00" },
      { weekday: 1, startTime: "09:00", endTime: "13:00" },
    ]);
    expect(await c.schedules.weeklyHours(a.id)).toEqual([
      { weekday: 1, startTime: "09:00", endTime: "13:00" },
      { weekday: 1, startTime: "14:00", endTime: "18:00" },
    ]);
    await expect(
      c.schedules.setWeeklyHours({}, a.id, [
        { weekday: 2, startTime: "09:00", endTime: "13:00" },
        { weekday: 2, startTime: "12:00", endTime: "15:00" },
      ]),
    ).rejects.toThrow(/overlap/);
  });

  it("validates service input", async () => {
    await expect(c.catalog.create({}, { name: "", durationMin: 0 })).rejects.toThrow();
  });
});

describe("settings", () => {
  it("accepts a booking ID prefix of letters, numbers, dash and underscore only", async () => {
    const base = { name: "Firm", timezone: "Asia/Kolkata", currency: "INR", slotIntervalMin: 15, minNoticeMin: 60, maxNoticeDays: 60, clientCutoffMin: 1440 };
    try {
      expect((await c.settings.update({}, { ...base, bookingPrefix: "CLINIC-" })).bookingPrefix).toBe("CLINIC-");
      expect(() => c.settings.update({}, { ...base, bookingPrefix: "BK #" })).toThrow(/prefix/);
      expect(() => c.settings.update({}, { ...base, bookingPrefix: "TOOLONGPREFIX" })).toThrow();
    } finally {
      // Settings aren't cleared between tests, and other tests expect the default.
      await c.settings.update({}, { ...base, bookingPrefix: "BK-" });
    }
  });
});
