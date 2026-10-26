import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { c, db, reset } from "./helpers";

const now = new Date("2026-12-01T02:30:00Z");
const later = new Date(now.getTime() + 60_000);
const start = new Date("2026-12-03T04:30:00Z");
const person = { name: "Synthetic client", phone: "98000 00901" };
let seq = 0;
const onlinePayment = async (on: boolean) => c.settings.update({}, { ...(await c.settings.get()), onlinePayment: on });
beforeEach(async () => { await reset(); await onlinePayment(true); });
afterEach(() => onlinePayment(false));

async function setup(priceDisplay = "1000") {
  const svc = await c.catalog.create({}, { name: "Therapy", durationMin: 60, priceDisplay });
  const jasmin = await c.staff.create({}, { name: "Synthetic Jasmin", email: "jasmin@firm.test", designation: "Psychologist" });
  const other = await c.staff.create({}, { name: "Synthetic other", email: "other@firm.test", designation: "Psychologist" });
  for (const staff of [jasmin, other]) {
    await c.staff.setServices({}, staff.id, [svc.id]);
    await c.schedules.setWeeklyHours({}, staff.id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })));
  }
  const book = (staffId = jasmin.id, at = start, useCredits = false) => c.bookings.create({ mode: "client" }, {
    serviceId: svc.id, staffId, start: at, client: person, useCredits,
  }, { now, idempotencyKey: `initial-therapist-${++seq}` }).then((r) => r.booking);
  return { svc, jasmin, other, book };
}
const pay = (id: string) => c.payments.report({}, id, { status: "paid", amountPaise: 100000, razorpayPaymentId: `pay_initial_${++seq}` }, later);
const history = (clientId: string) => c.clients.therapistHistory(clientId);

describe("initial therapist from a confirmed booking", () => {
  it("leaves pending and failed checkouts unassigned, then assigns the paid booking's therapist once", async () => {
    const { jasmin, book } = await setup();
    const b = await book();
    expect(await history(b.clientId)).toEqual([]);
    await c.payments.report({}, b.id, { status: "failed", amountPaise: 100000 }, later);
    expect(await history(b.clientId)).toEqual([]);
    const input = { status: "paid", amountPaise: 100000, razorpayPaymentId: "pay_initial_retry" };
    await c.payments.report({}, b.id, input, later);
    await c.payments.report({}, b.id, input, later);
    expect(await history(b.clientId)).toMatchObject([{ staffId: jasmin.id, endsAt: null, startsAt: later }]);
    expect(await c.clients.directory({ therapist: jasmin.id })).toMatchObject([{ id: b.clientId, therapistName: jasmin.name }]);
    expect(await c.clients.directory({ therapist: "unassigned" })).toEqual([]);
    expect(await c.caseHistory.canRead(jasmin, b.clientId)).toBe(true);
    const audit = await db.execute(sql`select details from audit_log where entity_id = ${b.clientId} and action = 'assign_therapist_from_booking'`);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].details).toMatchObject({ staffId: jasmin.id, bookingId: b.id });
  });

  it("preserves the coordinator's existing assignment when a different therapist is booked", async () => {
    const { other, book } = await setup();
    const b = await book();
    await c.clients.assignTherapist({}, b.clientId, { staffId: other.id }, now);
    await pay(b.id);
    expect(await history(b.clientId)).toMatchObject([{ staffId: other.id, endsAt: null }]);
  });

  it("assigns a confirmed free website booking, but not an unpaid staff booking", async () => {
    const { jasmin, book, svc } = await setup("Free");
    const b = await book();
    expect(b.paymentStatus).toBe("not_required");
    expect(await history(b.clientId)).toMatchObject([{ staffId: jasmin.id, startsAt: now }]);
    const desk = await c.bookings.create({ mode: "staff" }, { serviceId: svc.id, staffId: jasmin.id,
      start: new Date("2026-12-04T04:30:00Z"), client: { name: "Desk client", phone: "98000 00902" }, useCredits: false }, { now });
    expect(await history(desk.booking.clientId)).toEqual([]);
  });

  it("assigns bookings covered by existing wallet credit at creation", async () => {
    const { jasmin, book } = await setup();
    const client = await c.clients.create({}, person);
    await c.packages.topUp({}, client.id, { amountPaise: 100000 }, now);
    const b = await book(jasmin.id, start, true);
    expect(b.paymentStatus).toBe("paid");
    expect(await history(client.id)).toMatchObject([{ staffId: jasmin.id }]);
  });

  it("assigns when credit pays off an existing booking, with no assignment for partial credit", async () => {
    const { jasmin, other, book } = await setup();
    const b = await book();
    await c.packages.topUp({}, b.clientId, { amountPaise: 50000 }, now);
    await c.bookings.useCredit({}, b.id, { now: later });
    expect(await history(b.clientId)).toEqual([]);
    const second = await book(other.id, new Date("2026-12-04T04:30:00Z"));
    await c.packages.topUp({}, b.clientId, { amountPaise: 100000 }, now);
    await c.bookings.useCredit({}, second.id, { now: later });
    expect(await history(b.clientId)).toMatchObject([{ staffId: other.id }]);
    expect(jasmin.id).not.toBe(other.id);
  });

  it("waits for a replacement time when a late payment lost its slot", async () => {
    const { jasmin, other, book, svc } = await setup();
    const b = await book();
    const expired = new Date(now.getTime() + 11 * 60_000);
    await c.payments.expire(expired);
    await c.bookings.create({ mode: "staff" }, { serviceId: svc.id, staffId: jasmin.id, start,
      client: { name: "Other client", phone: "98000 00903" }, useCredits: false }, { now: expired });
    await c.payments.report({}, b.id, { status: "paid", amountPaise: 100000, razorpayPaymentId: "pay_initial_late" }, expired);
    expect((await c.bookings.get(b.id)).slotReleased).toBe(true);
    expect(await history(b.clientId)).toEqual([]);
    await c.payments.resume({}, b.id, { start, staffId: other.id }, expired);
    expect(await history(b.clientId)).toMatchObject([{ staffId: other.id }]);
  });

  it("does not assign a cancelled checkout after late payment", async () => {
    const { book } = await setup();
    const b = await book();
    await c.bookings.cancel({ mode: "staff" }, b.id, {}, { now });
    await expect(pay(b.id)).rejects.toMatchObject({ details: { reason: "booking_cancelled" } });
    expect(await history(b.clientId)).toEqual([]);
  });

  it("keeps one current assignment when two first bookings are paid concurrently", async () => {
    const { other, book } = await setup();
    const a = await book();
    const b = await book(other.id);
    await Promise.all([pay(a.id), pay(b.id)]);
    expect(await history(a.clientId)).toHaveLength(1);
    expect((await c.bookings.get(a.id)).paymentStatus).toBe("paid");
    expect((await c.bookings.get(b.id)).paymentStatus).toBe("paid");
  });
});