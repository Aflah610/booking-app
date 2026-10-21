import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { clientStatus } from "@/features/clients/client-status";
import { clientReference } from "@/features/clients/clients.dto";
import { zonedToUtc } from "@/lib/time";
import { c, db, reset } from "./helpers";

beforeEach(reset);

const at = (local: string) => zonedToUtc(local, "Asia/Kolkata");
const desk: BookingActor = { mode: "staff" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));

async function setup() {
  const therapy = await c.catalog.create({}, { name: "Therapy", durationMin: 60 });
  const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test", designation: "Psychologist" });
  const dev = await c.staff.create({}, { name: "Dev", email: "dev@firm.test", designation: "Psychiatrist" });
  const shana = await c.staff.create({}, { name: "Shana", email: "shana@firm.test" });
  for (const s of [asha, dev]) {
    await c.staff.setServices({}, s.id, [therapy.id]);
    await c.schedules.setWeeklyHours({}, s.id, everyDay);
  }
  const book = (staffId: string, start: string, now: Date) =>
    c.bookings.create(desk, { serviceId: therapy.id, staffId, start: at(start), client: { name: "Ravi", phone: "98765 43210" }, useCredits: false }, { now }).then((r) => r.booking);
  const first = await book(asha.id, "2026-09-01T10:00", at("2026-08-25T09:00"));
  return { asha, dev, shana, book, clientId: first.clientId };
}

const contact = { name: "Ravi", email: "", whatsappOptIn: true, notes: "" };

describe("client number", () => {
  it("gives each new client the next number, shown as CL- and five digits", async () => {
    const [one] = (await db.execute(sql`insert into client (name, phone_e164) values ('A', '+919000000001'), ('B', '+919000000002') returning number`)).rows as { number: number }[];
    const all = (await db.execute(sql`select number from client order by number`)).rows as { number: number }[];
    expect(all.map((r) => r.number)).toEqual([one.number, one.number + 1]);
    expect(clientReference(142)).toBe("CL-00142");
  });
});

describe("client profile", () => {
  it("saves the full profile and reads it back, and the audit row names fields only", async () => {
    const { clientId } = await setup();
    await c.clients.updateProfile({}, clientId, {
      ...contact,
      dateOfBirth: "1994-03-14",
      gender: "Female",
      maritalStatus: "Married",
      occupation: "Engineer",
      location: "Kochi",
      emergencyName: "Arun",
      emergencyRelation: "Spouse",
      emergencyPhone: "98765 00000",
      referralSource: "Instagram",
      consentSignedAt: "2026-09-03",
    });
    const got = await c.clients.get(clientId);
    expect(got).toMatchObject({ dateOfBirth: "1994-03-14", gender: "Female", occupation: "Engineer", emergencyPhone: "+919876500000", referralSource: "Instagram" });
    expect(got.consentSignedAt?.toISOString().slice(0, 10)).toBe("2026-09-03");
    const audit = (await db.execute(sql`select details::text as d from audit_log where entity = 'client' and action = 'update'`)).rows as { d: string }[];
    expect(audit[0].d).toContain("occupation");
    expect(audit[0].d).not.toContain("Engineer");
  });

  it("turns blank boxes into nothing recorded", async () => {
    const { clientId } = await setup();
    await c.clients.updateProfile({}, clientId, { ...contact, occupation: "Engineer" });
    await c.clients.updateProfile({}, clientId, { ...contact, occupation: "  ", dateOfBirth: "", emergencyPhone: "" });
    expect(await c.clients.get(clientId)).toMatchObject({ occupation: null, dateOfBirth: null, emergencyPhone: null });
  });

  it("rejects a birth date in the future or before 1900, and an emergency phone that isn't one", async () => {
    const { clientId } = await setup();
    await expect(c.clients.updateProfile({}, clientId, { ...contact, dateOfBirth: "2999-01-01" })).rejects.toThrow(/future/);
    await expect(c.clients.updateProfile({}, clientId, { ...contact, dateOfBirth: "1899-12-31" })).rejects.toThrow(/1900/);
    await expect(c.clients.updateProfile({}, clientId, { ...contact, emergencyPhone: "abc" })).rejects.toThrow();
  });
});

describe("therapist assignment", () => {
  it("needs no reason the first time, a reason to replace, and keeps the history newest first", async () => {
    const { asha, dev, shana, clientId } = await setup();
    await c.clients.assignTherapist({ staffId: shana.id }, clientId, { staffId: asha.id }, at("2026-08-25T09:00"));
    await expect(c.clients.assignTherapist({ staffId: shana.id }, clientId, { staffId: dev.id })).rejects.toMatchObject({ code: "invalid" });
    await c.clients.assignTherapist({ staffId: shana.id }, clientId, { staffId: dev.id, reason: "Asha left the firm" }, at("2026-09-10T09:00"));

    const history = await c.clients.therapistHistory(clientId);
    expect(history.map((h) => h.staffName)).toEqual(["Dev", "Asha"]);
    expect(history[0]).toMatchObject({ endsAt: null, reason: "Asha left the firm", assignedByName: "Shana", designation: "Psychiatrist" });
    // Asha's period ended the moment Dev's began; the 1 Sep session was hers.
    expect(history[1].endsAt?.getTime()).toBe(history[0].startsAt.getTime());
    expect(history[1].sessions).toBe(1);
  });

  it("refuses the therapist already assigned, and staff who are not active", async () => {
    const { asha, dev, clientId } = await setup();
    await c.clients.assignTherapist({}, clientId, { staffId: asha.id });
    await expect(c.clients.assignTherapist({}, clientId, { staffId: asha.id, reason: "again" })).rejects.toMatchObject({ code: "conflict" });
    await c.staff.update({}, dev.id, { active: false });
    await expect(c.clients.assignTherapist({}, clientId, { staffId: dev.id, reason: "x" })).rejects.toMatchObject({ code: "invalid", message: `Staff member ${dev.id} is not active` });
  });

  it("keeps a therapist who has since left in the history, marked inactive", async () => {
    const { asha, dev, clientId } = await setup();
    await c.clients.assignTherapist({}, clientId, { staffId: asha.id });
    await c.clients.assignTherapist({}, clientId, { staffId: dev.id, reason: "moved" });
    await c.staff.update({}, asha.id, { active: false });
    const history = await c.clients.therapistHistory(clientId);
    expect(history.find((h) => h.staffName === "Asha")?.staffActive).toBe(false);
  });

  it("allows only one current therapist per client, even outside the service", async () => {
    const { asha, dev, clientId } = await setup();
    await db.execute(sql`insert into client_therapist (client_id, staff_id, starts_at) values (${clientId}, ${asha.id}, now())`);
    await expect(db.execute(sql`insert into client_therapist (client_id, staff_id, starts_at) values (${clientId}, ${dev.id}, now())`)).rejects.toThrow();
  });
});

describe("client status", () => {
  const now = new Date("2026-10-21T00:00:00Z");
  const s = (status: "upcoming" | "completed" | "cancelled" | "no_show", iso: string) => ({ status, startsAt: new Date(iso), endsAt: new Date(new Date(iso).getTime() + 3_600_000) });

  it("is not started with no held session, even after cancellations and no-shows", () => {
    expect(clientStatus([], now)).toBe("not_started");
    expect(clientStatus([s("cancelled", "2026-10-01T10:00:00Z"), s("no_show", "2026-10-02T10:00:00Z")], now)).toBe("not_started");
  });

  it("is in therapy with a session ahead, or one held within the grace period", () => {
    expect(clientStatus([s("upcoming", "2026-10-25T10:00:00Z")], now)).toBe("in_therapy");
    expect(clientStatus([s("completed", "2026-10-10T10:00:00Z")], now)).toBe("in_therapy");
    // Past and never marked counts as held, as in the therapist report.
    expect(clientStatus([s("upcoming", "2026-10-10T10:00:00Z")], now)).toBe("in_therapy");
  });

  it("is concluded when nothing is booked and the last session is older than the grace period", () => {
    expect(clientStatus([s("completed", "2026-08-01T10:00:00Z")], now)).toBe("concluded");
  });
});

describe("adding a client by hand", () => {
  it("creates the client with who added them, and refuses a mobile number already on file", async () => {
    const shana = await c.staff.create({}, { name: "Shana", email: "shana2@firm.test" });
    const added = await c.clients.create({ staffId: shana.id }, { name: "Meera", phone: "98765 11111", email: "", whatsappOptIn: false, notes: "" });
    expect(added).toMatchObject({ name: "Meera", phoneE164: "+919876511111", email: null, notes: null, whatsappOptIn: false, registeredBy: shana.id });
    expect(added.number).toBeGreaterThan(0);
    await expect(c.clients.create({}, { name: "Someone", phone: "+91 98765 11111" })).rejects.toMatchObject({ code: "conflict", message: expect.stringContaining("Meera (CL-") });
  });
});
