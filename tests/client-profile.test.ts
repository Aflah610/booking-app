import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { clientStatus } from "@/features/clients/client-status";
import { clientAge, clientReference } from "@/features/clients/clients.dto";
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
  // These tests assign the psychologist by hand, so undo the one the first booking gave.
  await db.execute(sql`delete from client_therapist`);
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

describe("client list date filter", () => {
  it("keeps clients who signed up inside the range of days, whole days in the firm's time zone", async () => {
    await db.execute(sql`insert into client (name, phone_e164, created_at) values
      ('Early', '+919000000011', '2026-09-30T18:45:00Z'), ('Before', '+919000000014', '2026-09-30T18:00:00Z'), ('Inside', '+919000000012', '2026-10-05T10:00:00Z'), ('Late', '+919000000013', '2026-10-10T19:00:00Z')`);
    const { dayRange } = await import("@/lib/day-range");
    // 30 Sep 18:45 UTC is already 1 Oct in India (18:00 is not); 10 Oct 19:00 UTC is 11 Oct there.
    const names = (await c.clients.list({ ...dayRange("2026-10-01", "2026-10-10", "Asia/Kolkata") })).map((r) => r.name);
    expect(names.sort()).toEqual(["Early", "Inside"]);
  });
});

describe("clients directory (as in the old case history system)", () => {
  it("registers a client with age, address and an earlier registration date", async () => {
    const shana = await c.staff.create({}, { name: "Shana", email: "shana@firm.test" });
    const made = await c.clients.create({ staffId: shana.id }, {
      ...contact, phone: "98765 11111", age: "34", gender: "Male", address: "12 MG Road, Kochi", registeredAt: "2026-05-01T00:00:00Z",
    });
    expect(made).toMatchObject({ age: 34, address: "12 MG Road, Kochi", registeredBy: shana.id });
    expect(made.createdAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(clientAge(made, "2026-10-25")).toBe(34);
    expect(clientAge({ dateOfBirth: "1990-10-26", age: 34 }, "2026-10-25")).toBe(35);
    await expect(c.clients.create({}, { ...contact, phone: "98765 22222", age: "200" })).rejects.toThrow();
    // An empty registration date keeps the time the client was added.
    await c.clients.updateProfile({}, made.id, { ...contact, age: "35", registeredAt: "" });
    expect((await c.clients.get(made.id)).createdAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("lists each client with their psychologist, who assigned them and the case status, and filters by psychologist", async () => {
    const { asha, dev, shana, clientId } = await setup();
    const other = await c.clients.create({ staffId: shana.id }, { ...contact, name: "Meera", phone: "98765 33333" });
    await c.clients.assignTherapist({ staffId: shana.id }, clientId, { staffId: asha.id });

    const all = await c.clients.directory();
    const ravi = all.find((r) => r.id === clientId)!;
    expect(ravi).toMatchObject({ therapistName: "Asha", therapistActive: true, assignedByName: "Shana", bookings: 1, caseStatus: null });
    expect(all.find((r) => r.id === other.id)).toMatchObject({ therapistId: null, registeredByName: "Shana" });

    expect((await c.clients.directory({ therapist: asha.id })).map((r) => r.name)).toEqual(["Ravi"]);
    expect((await c.clients.directory({ therapist: "unassigned" })).map((r) => r.name)).toEqual(["Meera"]);
    expect((await c.clients.directory({ q: clientReference(other.number) })).map((r) => r.name)).toEqual(["Meera"]);
    // A psychologist's own list: clients they treat or have seen, nobody else.
    expect((await c.clients.directory({ treatedBy: asha.id })).map((r) => r.name)).toEqual(["Ravi"]);
    expect(await c.clients.directory({ treatedBy: dev.id })).toEqual([]);
    expect(await c.clients.hasTreated(clientId, asha.id)).toBe(true);
    expect(await c.clients.hasTreated(other.id, asha.id)).toBe(false);
  });
});


describe("registered clients versus failed online attempts", () => {
  it("excludes unpaid attempts and empty case histories from Clients, search, filters and CSV until payment succeeds", async () => {
    const { asha, shana, clientId } = await setup();
    const online = await c.bookings.create({ mode: "client" }, {
      serviceId: (await c.catalog.list())[0].id, staffId: asha.id,
      start: at("2026-09-04T10:00"), client: { name: "Unpaid checkout", phone: "98000 00001" }, useCredits: false,
    }, { now: at("2026-09-01T08:00"), idempotencyKey: "directory-unpaid-checkout" });
    const id = online.booking.clientId;
    // Online payment is off in this test, so the booking was confirmed and gave the client Asha; a real
    // unpaid checkout never gets a psychologist, so take her off before turning it into one below.
    await db.execute(sql`delete from client_therapist where client_id = ${id}`);
    const manual = await c.clients.create({ staffId: shana.id }, { name: "Manual registration", phone: "98000 00002" });
    // Simply opening a clinical page must not promote a failed checkout into the Clients directory.
    await db.execute(sql`insert into case_history (client_id) values (${id})`);
    for (const status of ["pending", "failed"] as const) {
      await db.execute(sql`update booking set payment_status = ${status}, payment_due_at = now() + interval '10 minutes', slot_released = ${status === "failed"} where id = ${online.booking.id}`);
      expect((await c.clients.directory()).map((r) => r.id).sort()).toEqual([clientId, manual.id].sort());
      expect(await c.clients.directory({ q: "Unpaid checkout" })).toEqual([]);
      expect(await c.clients.directory({ therapist: "unassigned", q: "9800000001" })).toEqual([]);
      expect(await c.clients.directory({ treatedBy: asha.id, q: "Unpaid" })).toEqual([]);
      expect(await c.reports.clientsCsv()).not.toContain("Unpaid checkout");
    }
    // Retain the attempt and contact so payment can be retried: no data deletion or payment changes by this filter.
    expect((await c.clients.get(id)).name).toBe("Unpaid checkout");
    expect((await c.bookings.get(online.booking.id)).clientId).toBe(id);
    await db.execute(sql`update booking set payment_status = 'paid', slot_released = false where id = ${online.booking.id}`);
    expect((await c.clients.directory()).map((r) => r.id)).toContain(id);
    expect(await c.reports.clientsCsv()).toContain("Unpaid checkout");
    // A paid client remains registered even if that appointment is later cancelled.
    await db.execute(sql`update booking set status = 'cancelled' where id = ${online.booking.id}`);
    expect((await c.clients.directory()).map((r) => r.id)).toContain(id);
  });

  it("keeps paid credit customers without bookings and imported clients", async () => {
    const credited = await c.packages.topUpFromPayment({}, { client: { name: "Credit customer", phone: "98000 00003", whatsappOptIn: false }, amountPaise: 10000, razorpayPaymentId: "pay_directory_synthetic" });
    const imported = await c.clients.create({}, { name: "Imported client", phone: "98000 00004" });
    await db.execute(sql`update client set mch_code = 'ML-CL-TEST' where id = ${imported.id}`);
    const rows = await c.clients.directory();
    expect(rows.map((r) => r.id)).toContain(imported.id);
    expect(rows.map((r) => r.name)).toContain("Credit customer");
    expect(credited).toBeTruthy();
  });
});
