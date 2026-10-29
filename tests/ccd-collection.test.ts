import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { booking, client } from "@/db/schema";
import { createContainer } from "@/features/container";
import { db, reset } from "./helpers";
const c = createContainer(db, { manageSecret: "synthetic-collection-secret-1234567890" });
const now = new Date("2026-11-01T02:30:00Z");
beforeEach(async () => { await reset(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());
async function setup() {
  const svc = await c.catalog.create({}, { name: "Therapy", durationMin: 60, priceDisplay: "1000" });
  const member = await c.staff.create({}, { name: "Therapist", email: "therapist@firm.test" });
  await c.staff.setServices({}, member.id, [svc.id]);
  await c.schedules.setWeeklyHours({}, member.id, [0,1,2,3,4,5,6].map(weekday => ({ weekday, startTime: "09:00", endTime: "20:00" })));
  const book = async (day: string, phone = "9876543210", followUp = false) => (await c.bookings.create({ mode: "staff" }, { serviceId: svc.id, staffId: member.id, start: `${day}T10:00:00+05:30`, client: { name: "Synthetic client", phone }, followUp, useCredits: false })).booking;
  return { svc, member, book };
}
describe("CCD follow-up classification without OTP", () => {
  it("keeps a first booking initial, reuses a normalised phone and marks a matching existing client as follow-up", async () => {
    const { book } = await setup();
    const first = await book("2026-11-03");
    const again = await book("2026-11-04", "+91 98765 43210");
    expect(first).toMatchObject({ isFollowUp: false, followUpSource: null, source: "staff", paymentStatus: "pending" });
    expect(again).toMatchObject({ clientId: first.clientId, isFollowUp: true, followUpSource: "existing_client", paymentStatus: "pending" });
    expect(await db.select().from(client)).toHaveLength(1);
    const count = await db.execute(sql`select count(*)::int as n from otp_request`);
    expect(count.rows[0].n).toBe(0);
  });
  it("accepts the CCD tick by itself and refuses client-side declarations", async () => {
    const { book, svc, member } = await setup();
    expect(await book("2026-11-03", "9876543210", true)).toMatchObject({ isFollowUp: true, followUpSource: "staff" });
    await expect(c.bookings.create({ mode: "client" }, { serviceId: svc.id, staffId: member.id, start: "2026-11-05T10:00:00+05:30", client: { name: "Other", phone: "9876543211" }, followUp: true }, { idempotencyKey: "synthetic-rejected-followup" })).rejects.toMatchObject({ code: "forbidden" });
  });
  it("does not treat an abandoned/failed web contact as an established client", async () => {
    const { svc, member, book } = await setup();
    await c.settings.update({}, { ...(await c.settings.get()), onlinePayment: true });
    const attempt = (await c.bookings.create({ mode: "client" }, { serviceId: svc.id, staffId: member.id, start: "2026-11-03T10:00:00+05:30", client: { name: "Synthetic client", phone: "9876543210" }, useCredits: false }, { idempotencyKey: "synthetic-failed-attempt" })).booking;
    await db.update(booking).set({ paymentStatus: "failed", slotReleased: true }).where(eq(booking.id, attempt.id));
    expect(await book("2026-11-04")).toMatchObject({ clientId: attempt.clientId, isFollowUp: false });
  });
  it("preserves the visit classification when rescheduled", async () => {
    const { book, member } = await setup();
    const initial = await book("2026-11-03");
    const moved = await c.bookings.reschedule({ mode: "staff" }, initial.id, { start: "2026-11-04T10:00:00+05:30", staffId: member.id });
    expect(moved.isFollowUp).toBe(false);
    const follow = await book("2026-11-05", "9876543211", true);
    expect((await c.bookings.reschedule({ mode: "staff" }, follow.id, { start: "2026-11-06T10:00:00+05:30" })).followUpSource).toBe("staff");
  });
});
describe("payment-only capabilities", () => {
  it("scopes a QR token to one booking and current balance, expires it, and grants no manage access", async () => {
    const { book } = await setup();
    const b = await book("2026-11-03"), other = await book("2026-11-04", "9876543211");
    const link = (await c.bookings.paymentLink(b.id))!;
    expect(link).not.toBeNull();
    expect((await c.bookings.paymentRequest(b.id, link.token)).id).toBe(b.id);
    await expect(c.bookings.paymentRequest(other.id, link.token)).rejects.toMatchObject({ code: "not_found" });
    await expect(c.bookings.verifyManageToken(b.id, link.token)).rejects.toMatchObject({ code: "not_found" });
    await expect(c.bookings.paymentRequest(b.id, link.token.slice(0,-1)+"!")).rejects.toMatchObject({ code: "not_found" });
    await db.update(booking).set({ amountPaise: 50000 }).where(eq(booking.id, b.id));
    await expect(c.bookings.paymentRequest(b.id, link.token)).rejects.toMatchObject({ code: "not_found" });
    await db.update(booking).set({ amountPaise: 100000 }).where(eq(booking.id, b.id));
    vi.setSystemTime(new Date(now.getTime()+25*3600000));
    await expect(c.bookings.paymentRequest(b.id, link.token)).rejects.toMatchObject({ code: "not_found" });
  });
  it("stops collection on cancellation/move and removes the QR after verified payment", async () => {
    const { book } = await setup();
    const b = await book("2026-11-03"); const link = (await c.bookings.paymentLink(b.id))!;
    await c.bookings.cancel({ mode: "staff" }, b.id, {});
    await expect(c.bookings.paymentRequest(b.id, link.token)).rejects.toMatchObject({ code: "conflict" });
    expect(await c.bookings.paymentLink(b.id)).toBeNull();
    const paid = await book("2026-11-04"); const paidLink = (await c.bookings.paymentLink(paid.id))!;
    await c.payments.report({}, paid.id, { status: "paid", amountPaise: 100000, razorpayPaymentId: "pay_synthetic", razorpayOrderId: "order_synthetic" });
    expect(await c.bookings.paymentLink(paid.id)).toBeNull();
    expect((await c.bookings.paymentRequest(paid.id, paidLink.token)).paymentStatus).toBe("paid");
  });
});
