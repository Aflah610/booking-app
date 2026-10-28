import { eq, sql } from "drizzle-orm";
import { createPaymentsRepository } from "@/features/payments/payments.repository";
import { payment } from "@/db/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, reset } from "./helpers";
import { createContainer } from "@/features/container";
import type { OutgoingMessage } from "@/features/workflows/workflows.dto";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { zonedToUtc } from "@/lib/time";

const sent: OutgoingMessage[] = [];
const send = async (m: OutgoingMessage) => void sent.push(m) as never;
const c = createContainer(db, { manageSecret: "p".repeat(40), appUrl: "https://book.example.com", senders: { email: send, whatsapp: send, webhook: send } });

const IST = "Asia/Kolkata";
const at = (local: string) => zonedToUtc(local, IST);
const t0 = at("2026-10-15T08:00");
const plus = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
const website: BookingActor = { mode: "client" };
const desk: BookingActor = { mode: "staff" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));
const ravi = { name: "Ravi Kumar", phone: "98765 43210", email: "ravi@example.com" };
const meena = { name: "Meena", phone: "98765 11111", email: "meena@example.com" };
let keyN = 0;

const online = async (on: boolean) => c.settings.update({}, { ...(await c.settings.get()), onlinePayment: on, resumeUrl: "https://yourfirm.com/my-bookings" });

beforeEach(async () => {
  await reset();
  sent.length = 0;
  await online(true);
});
afterEach(() => online(false));

async function setup(price: string | null = "1500") {
  const svc = await c.catalog.create({}, { name: "Consult", durationMin: 30, priceDisplay: price });
  const staff = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
  await c.staff.setServices({}, staff.id, [svc.id]);
  await c.schedules.setWeeklyHours({}, staff.id, everyDay);
  await c.workflows.create({}, { name: "Confirm", trigger: "booked", action: { channel: "email", recipient: "client", subject: "Confirmed", body: "ok {{booking_id}}" } });
  await c.workflows.create({}, { name: "Failed", trigger: "payment_failed", action: { channel: "email", recipient: "client", subject: "Pay", body: "{{amount}} {{resume_link}}" } });
  return { svc, staff };
}
const book = (serviceId: string, start: string, client = ravi, now = t0) =>
  c.bookings.create(website, { serviceId, start: at(start), client }, { now, idempotencyKey: `key-${++keyN}-12345678` }).then((r) => r.booking);
const paid = (amountPaise = 150000, extra: Record<string, unknown> = {}) => ({ status: "paid", amountPaise, razorpayOrderId: "order_A1", razorpayPaymentId: `pay_${++keyN}`, method: "upi", ...extra });
const freeTimes = async (serviceId: string, day: string, now: Date) =>
  (await c.availability.slots({ serviceId, from: at(`${day}T00:00`), to: at(`${day}T23:59`) }, { now, mode: "client" })).slots.map((s) => s.start.toISOString());

describe("service price", () => {
  it("turns a plain rupee price into paise for charging, and ignores price text", async () => {
    const a = await c.catalog.create({}, { name: "A", durationMin: 30, priceDisplay: "1500" });
    const b = await c.catalog.create({}, { name: "B", durationMin: 30, priceDisplay: "499.50" });
    const t = await c.catalog.create({}, { name: "T", durationMin: 30, priceDisplay: "From ₹500" });
    expect([a.pricePaise, b.pricePaise, t.pricePaise]).toEqual([150000, 49950, null]);
    expect((await c.catalog.update({}, a.id, { priceDisplay: "2000" })).pricePaise).toBe(200000);
  });
});

describe("booking online", () => {
  it("holds a priced website booking for 10 minutes and confirms nothing yet", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    expect(b).toMatchObject({ paymentStatus: "pending", amountPaise: 150000, slotReleased: false });
    expect(b.paymentDueAt).toEqual(plus(t0, 10));
    expect(b.resumeUntil).toEqual(plus(t0, 24 * 60));
    expect(await c.workflows.processDue({ now: t0 })).toBe(0); // no confirmation until it is paid
  });

  it("books as before for desk bookings, free services, or when online payment is off", async () => {
    const { svc } = await setup();
    const desked = (await c.bookings.create(desk, { serviceId: svc.id, start: at("2026-10-19T10:00"), client: ravi }, { now: t0 })).booking;
    expect(desked).toMatchObject({ paymentStatus: "pending", paymentDueAt: null, resumeUntil: null });
    const free = await c.catalog.create({}, { name: "Free", durationMin: 30 });
    await c.staff.setServices({}, (await c.staff.list())[0].id, [svc.id, free.id]);
    expect((await book(free.id, "2026-10-19T11:00", meena)).paymentStatus).toBe("not_required");
    await online(false);
    expect(await book(svc.id, "2026-10-19T12:00", { ...meena, phone: "98765 22222" })).toMatchObject({ paymentStatus: "pending", resumeUntil: null });
    expect(await c.workflows.processDue({ now: t0 })).toBe(3); // all three are confirmed straight away
  });
});

describe("reporting a payment", () => {
  it("stores Razorpay's details, confirms the booking and sends the confirmation", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    const r = await c.payments.report({}, b.id, paid(150000, { paidAt: "2026-10-15T08:03:00Z", razorpayPaymentId: "pay_X1" }), plus(t0, 3));
    expect(r.booking).toMatchObject({ paymentStatus: "paid", paymentDueAt: null });
    expect(r.payment).toMatchObject({ status: "paid", amountPaise: 150000, razorpayOrderId: "order_A1", razorpayPaymentId: "pay_X1", method: "upi", source: "website" });
    expect(r.payment.paidAt).toEqual(new Date("2026-10-15T08:03:00Z"));
    expect(await c.workflows.processDue({ now: plus(t0, 3) })).toBe(1);
    expect(sent[0]).toMatchObject({ channel: "email", to: "ravi@example.com", subject: "Confirmed" });
    // The 15-minute clock no longer applies.
    await c.payments.expire(plus(t0, 60));
    expect((await c.bookings.get(b.id)).paymentStatus).toBe("paid");
  });

  it("counts the same Razorpay payment once, however often it is reported", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    const body = paid(150000, { razorpayPaymentId: "pay_ONCE" });
    await c.payments.report({}, b.id, body, plus(t0, 2));
    const again = await c.payments.report({}, b.id, body, plus(t0, 3));
    expect(again.duplicate).toBe(true);
    expect(await c.payments.forBooking(b.id)).toHaveLength(1);
    const other = await book(svc.id, "2026-10-19T11:00", meena);
    await expect(c.payments.report({}, other.id, body, plus(t0, 3))).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses zero and partial receipts, including staff entries with a discount note", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    await expect(c.payments.report({}, b.id, paid(100000), plus(t0, 2))).rejects.toMatchObject({ code: "invalid", details: { reason: "amount_mismatch", expected: 150000 } });
    expect((await c.bookings.get(b.id)).paymentStatus).toBe("pending");
    await expect(c.payments.recordManual({}, b.id, { status: "paid", amountPaise: 100000, notes: "Discount agreed on the phone" }, plus(t0, 2))).rejects.toMatchObject({ code: "invalid" });
    await expect(c.payments.recordManual({}, b.id, { status: "paid", amountPaise: 0 }, plus(t0, 2))).rejects.toThrow();
    expect(await c.payments.forBooking(b.id)).toHaveLength(0);
    const manual = await c.payments.recordManual({}, b.id, { status: "paid", amountPaise: 150000 }, plus(t0, 2));
    expect(manual.payment).toMatchObject({ source: "staff", amountPaise: 150000 });
    expect(manual.booking.paymentStatus).toBe("paid");
  });

  it("records a failed try without failing the booking early", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    const r = await c.payments.report({}, b.id, { status: "failed", amountPaise: 150000, razorpayOrderId: "order_A1", errorCode: "BAD_REQUEST_ERROR", errorDescription: "Payment declined" }, plus(t0, 2));
    expect(r.payment).toMatchObject({ status: "failed", errorDescription: "Payment declined" });
    expect(r.booking).toMatchObject({ paymentStatus: "pending", slotReleased: false });
  });

  it("flags a second, different payment on an already paid booking for refund", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.payments.report({}, b.id, paid(), plus(t0, 2));
    const dup = await c.payments.report({}, b.id, paid(), plus(t0, 3));
    expect(dup).toMatchObject({ warning: "duplicate_payment", payment: { needsRefund: true } });
  });
});

describe("the 10 minutes and the 24 hours", () => {
  it("fails an unpaid booking after 10 minutes, gives its time back and asks the client to pay", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.payments.expire(plus(t0, 9));
    expect((await c.bookings.get(b.id)).paymentStatus).toBe("pending");
    expect(await freeTimes(svc.id, "2026-10-19", plus(t0, 9))).not.toContain(at("2026-10-19T10:00").toISOString());
    await c.payments.expire(plus(t0, 16));
    expect(await c.bookings.get(b.id)).toMatchObject({ paymentStatus: "failed", slotReleased: true, status: "upcoming" });
    expect(await freeTimes(svc.id, "2026-10-19", plus(t0, 16))).toContain(at("2026-10-19T10:00").toISOString());
    expect(await c.workflows.processDue({ now: plus(t0, 16) })).toBe(1);
    const mail = sent[0] as { body: string };
    expect(mail.body).toContain("₹1,500");
    expect(mail.body).toContain(`https://yourfirm.com/my-bookings?booking=${b.id}&token=${c.bookings.manageToken(b.id)}`);
  });

  it("lets someone else book a released time", async () => {
    const { svc } = await setup();
    await book(svc.id, "2026-10-19T10:00");
    await c.payments.expire(plus(t0, 16));
    const other = await book(svc.id, "2026-10-19T10:00", meena, plus(t0, 17));
    expect(other.slotReleased).toBe(false);
  });

  it("lets the client resume within 24 hours: same time if free, or a new one", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.payments.expire(plus(t0, 16));
    const back = plus(t0, 60);
    const same = await c.payments.resume({}, b.id, {}, back);
    expect(same.booking).toMatchObject({ paymentStatus: "pending", slotReleased: false });
    expect(same.booking.paymentDueAt).toEqual(plus(back, 10));
    expect(same.booking.resumeUntil).toEqual(plus(t0, 24 * 60)); // the 24 hours still run from the original booking
    await c.payments.expire(plus(back, 16));
    await book(svc.id, "2026-10-19T10:00", meena, plus(back, 17)); // someone takes it
    await expect(c.payments.resume({}, b.id, {}, plus(back, 20))).rejects.toMatchObject({ code: "conflict", details: { reason: "slot_unavailable" } });
    const moved = await c.payments.resume({}, b.id, { start: at("2026-10-19T14:00").toISOString() }, plus(back, 20));
    expect(moved.booking.startsAt).toEqual(at("2026-10-19T14:00"));
    const done = await c.payments.report({}, b.id, paid(), plus(back, 25));
    expect(done.booking).toMatchObject({ paymentStatus: "paid", slotReleased: false });
  });

  it("cancels an unpaid booking 24 hours after it was made, and refuses to resume it", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.payments.expire(plus(t0, 24 * 60 + 1));
    expect(await c.bookings.get(b.id)).toMatchObject({ status: "cancelled", cancelledBy: "system" });
    await expect(c.payments.resume({}, b.id, {}, plus(t0, 24 * 60 + 2))).rejects.toMatchObject({ code: "conflict" });
  });

  it("records, and flags for refund, a payment that arrives after the booking was cancelled", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.payments.expire(plus(t0, 24 * 60 + 1));
    await expect(c.payments.report({}, b.id, paid(), plus(t0, 25 * 60))).rejects.toMatchObject({ code: "conflict", details: { reason: "booking_cancelled" } });
    expect(await c.payments.forBooking(b.id)).toEqual([expect.objectContaining({ status: "paid", needsRefund: true })]);
  });

  it("keeps a paid booking whose time was lost, and lets the client choose a new time", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.payments.expire(plus(t0, 16));
    await book(svc.id, "2026-10-19T10:00", meena, plus(t0, 17)); // the time is taken
    const r = await c.payments.report({}, b.id, paid(), plus(t0, 20)); // the late payment arrives
    expect(r.warning).toBe("choose_new_time");
    expect(r.booking).toMatchObject({ paymentStatus: "paid", slotReleased: true, status: "upcoming" });
    expect((await c.payments.resumable("98765 43210", plus(t0, 21))).map((x) => x.id)).toEqual([b.id]);
    await c.payments.expire(plus(t0, 48 * 60)); // never auto-cancelled: money was taken
    expect((await c.bookings.get(b.id)).status).toBe("upcoming");
    const fixed = await c.payments.resume({}, b.id, { start: at("2026-10-20T10:00").toISOString() }, plus(t0, 49 * 60));
    expect(fixed.booking).toMatchObject({ slotReleased: false, paymentStatus: "paid" });
    expect(await c.payments.resumable("98765 43210", plus(t0, 50 * 60))).toEqual([]);
  });

  it("takes the old time straight back when a late payment finds it still free", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.payments.expire(plus(t0, 16));
    const r = await c.payments.report({}, b.id, paid(), plus(t0, 20));
    expect(r).toMatchObject({ warning: null, booking: { paymentStatus: "paid", slotReleased: false } });
    // The "payment failed" message queued at 10 minutes, and now the confirmation.
    expect(await c.workflows.processDue({ now: plus(t0, 20) })).toBe(2);
  });

  it("lists a client's bookings that still need payment", async () => {
    const { svc } = await setup();
    const a = await book(svc.id, "2026-10-19T10:00");
    const other = await book(svc.id, "2026-10-19T11:00", meena);
    await c.payments.expire(plus(t0, 16));
    expect((await c.payments.resumable("+919876543210", plus(t0, 20))).map((x) => x.id)).toEqual([a.id]);
    expect((await c.payments.resumable("98765 11111", plus(t0, 20))).map((x) => x.id)).toEqual([other.id]);
    await expect(c.payments.resumable("abc", plus(t0, 20))).rejects.toMatchObject({ code: "invalid" });
  });

  it("stops a client moving an unpaid online booking; they resume it instead", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-21T10:00");
    await expect(c.bookings.reschedule(website, b.id, { start: at("2026-10-22T10:00") }, { now: plus(t0, 2) })).rejects.toMatchObject({ details: { reason: "payment_pending" } });
    await c.payments.report({}, b.id, paid(), plus(t0, 3));
    const moved = await c.bookings.reschedule(website, b.id, { start: at("2026-10-22T10:00") }, { now: plus(t0, 4) });
    expect(moved).toMatchObject({ paymentStatus: "paid", amountPaise: 150000 });
  });
});

describe("payment reliability regressions", () => {
  it("rolls back the receipt if settlement fails, then succeeds on the same payment retry", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    const body = paid(150000, { razorpayPaymentId: "pay_atomic" });
    await db.execute(sql`create function reliability_fail_settle() returns trigger language plpgsql as $$ begin raise exception 'synthetic settlement interruption'; end $$`);
    await db.execute(sql`create trigger reliability_fail_settle before update of payment_status on booking for each row when (new.payment_status = 'paid') execute function reliability_fail_settle()`);
    try {
      await expect(c.payments.report({}, b.id, body, plus(t0, 2))).rejects.toThrow();
      expect(await c.payments.forBooking(b.id)).toHaveLength(0);
      expect((await c.bookings.get(b.id)).paymentStatus).toBe("pending");
    } finally {
      await db.execute(sql`drop trigger reliability_fail_settle on booking`);
      await db.execute(sql`drop function reliability_fail_settle()`);
    }
    const retry = await c.payments.report({}, b.id, body, plus(t0, 3));
    expect(retry.booking.paymentStatus).toBe("paid");
    expect(await c.payments.forBooking(b.id)).toHaveLength(1);
  });

  it("reconciles a receipt left pending by the old implementation rather than dropping its retry", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    await db.insert(payment).values({ bookingId: b.id, status: "paid", amountPaise: 150000, currency: "INR", source: "website", razorpayPaymentId: "pay_legacy" });
    const retry = await c.payments.report({}, b.id, paid(150000, { razorpayPaymentId: "pay_legacy" }), plus(t0, 3));
    expect(retry.booking.paymentStatus).toBe("paid");
    expect(retry.duplicate).toBe(true);
    expect(await c.payments.forBooking(b.id)).toHaveLength(1);
  });

  it("parses a numeric Razorpay paidAt as Unix seconds, not milliseconds in 1970", async () => {
    const { svc } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    const result = await c.payments.report({}, b.id, paid(150000, { paidAt: 1793001600 }), plus(t0, 2));
    expect(result.payment.paidAt).toEqual(new Date("2026-10-26T08:00:00.000Z"));
  });
});

describe("rescheduled payment history", () => {
  it("preserves an unpaid booking's original expiry and resume deadlines", async () => {
    const { svc } = await setup();
    const original = await book(svc.id, "2026-10-19T10:00");
    const moved = await c.bookings.reschedule(desk, original.id, { start: at("2026-10-20T10:00") }, { now: plus(t0, 2) });
    expect(moved).toMatchObject({ paymentDueAt: original.paymentDueAt, resumeUntil: original.resumeUntil, paymentStatus: "pending" });
    await c.payments.expire(plus(t0, 11));
    expect(await c.bookings.get(moved.id)).toMatchObject({ paymentStatus: "failed", slotReleased: true });
    await c.payments.expire(plus(t0, 24 * 60 + 1));
    expect((await c.bookings.get(moved.id)).status).toBe("cancelled");
  });

  it("moves a paid receipt across repeated moves and accepts retries addressed to the original booking", async () => {
    const { svc } = await setup();
    const original = await book(svc.id, "2026-10-19T10:00");
    const report = paid(150000, { razorpayPaymentId: "pay_moved" });
    await c.payments.report({}, original.id, report, plus(t0, 1));
    const second = await c.bookings.reschedule(desk, original.id, { start: at("2026-10-20T10:00") }, { now: plus(t0, 2) });
    const third = await c.bookings.reschedule(desk, second.id, { start: at("2026-10-21T10:00") }, { now: plus(t0, 3) });
    expect(await c.payments.forBooking(third.id)).toHaveLength(1);
    expect(await c.payments.forBooking(original.id)).toHaveLength(0);
    const retry = await c.payments.report({}, original.id, report, plus(t0, 4));
    expect(retry).toMatchObject({ duplicate: true, booking: { id: third.id, paymentStatus: "paid" } });
    expect(await c.payments.forBooking(third.id)).toHaveLength(1);
    // Existing moves made before this fix still link their receipt in the current detail and export.
    const [receipt] = await c.payments.forBooking(third.id);
    await db.update(payment).set({ bookingId: original.id }).where(eq(payment.id, receipt.id));
    expect(await c.payments.forBooking(third.id)).toHaveLength(1);
    const exported = await c.reports.bookingsCsv({ from: "2026-10-19", to: "2026-10-22" });
    const receiptRows = exported.csv.split("\n").filter(line => line.includes("pay_moved"));
    expect(receiptRows).toHaveLength(1);
    expect(receiptRows[0]).toContain("2026-10-21 10:00");
  });
});


it("refuses a stale settlement after a simultaneous move, then reconciles a retry on the current visit", async () => {
  const { svc } = await setup();
  const original = await book(svc.id, "2026-10-19T10:00");
  const moved = await c.bookings.reschedule(desk, original.id, { start: at("2026-10-20T10:00") }, { now: plus(t0, 2) });
  await expect(createPaymentsRepository(db).settle({
    bookingId: original.id, status: "paid", amountPaise: 150000, currency: "INR", razorpayOrderId: null,
    razorpayPaymentId: "pay_raced_move", method: null, paidAt: null, errorCode: null, errorDescription: null,
    source: "website", recordedByStaffId: null, notes: null, needsRefund: false,
  }, { actor: {}, action: "payment_paid", entity: "booking", entityId: original.id }, plus(t0, 3))).rejects.toMatchObject({ details: { reason: "booking_moved" } });
  expect(await c.payments.forBooking(original.id)).toHaveLength(0);
  const retry = await c.payments.report({}, original.id, paid(150000, { razorpayPaymentId: "pay_raced_move" }), plus(t0, 4));
  expect(retry).toMatchObject({ booking: { id: moved.id, paymentStatus: "paid" }, payment: { needsRefund: false } });
});


it("does not turn an old underpaid receipt into a full settlement on retry", async () => {
  const { svc } = await setup();
  const b = await book(svc.id, "2026-10-19T10:00");
  await db.insert(payment).values({ bookingId: b.id, status: "paid", amountPaise: 100, currency: "INR", source: "website", razorpayPaymentId: "pay_old_partial" });
  await expect(c.payments.report({}, b.id, paid(150000, { razorpayPaymentId: "pay_old_partial" }), plus(t0, 3))).rejects.toMatchObject({ details: { reason: "receipt_amount_mismatch" } });
  expect((await c.bookings.get(b.id)).paymentStatus).toBe("pending");
});
