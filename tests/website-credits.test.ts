import { beforeEach, describe, expect, it } from "vitest";
import { db, reset } from "./helpers";
import { createContainer } from "@/features/container";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { zonedToUtc } from "@/lib/time";

const c = createContainer(db, { manageSecret: "p".repeat(40), appUrl: "https://book.example.com" });
const at = (local: string) => zonedToUtc(local, "Asia/Kolkata");
const t0 = at("2026-10-15T08:00");
const website: BookingActor = { mode: "client" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));
const ravi = { name: "Ravi Kumar", phone: "98765 43210", email: "ravi@example.com", whatsappOptIn: false };
let n = 0;

beforeEach(async () => {
  await reset();
});

async function setup() {
  const svc = await c.catalog.create({}, { name: "Counselling", durationMin: 60, priceDisplay: "1000" });
  const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
  const dev = await c.staff.create({}, { name: "Dr Dev", email: "dev@firm.test" });
  for (const s of [asha, dev]) {
    await c.staff.setServices({}, s.id, [svc.id]);
    await c.schedules.setWeeklyHours({}, s.id, everyDay);
  }
  await c.staff.setServicePrices({}, dev.id, { [svc.id]: 150000 });
  const pkg = await c.packages.create({}, { name: "4 credits", serviceIds: [svc.id], sessions: 4, pricePaise: 360000, validityDays: 365 });
  return { svc, asha, dev, pkg };
}
const pay = (amountPaise: number, extra: Record<string, unknown> = {}) => ({ client: ravi, amountPaise, razorpayPaymentId: `pay_${++n}_abc`, razorpayOrderId: "order_X1", method: "upi", ...extra });

describe("packages for the website", () => {
  it("lists only packages on sale, with the per-credit price", async () => {
    const { pkg } = await setup();
    await c.packages.create({}, { name: "Old", serviceIds: [], sessions: 2, pricePaise: 1000, active: false });
    expect(await c.packages.onSale()).toEqual([
      { id: pkg.id, name: "4 credits", serviceIds: pkg.serviceIds, credits: 4, creditValuePaise: 100000, pricePaise: 360000, perCreditPaise: 90000, validityDays: 365 },
    ]);
  });

  it("shows each therapist's price for a service, so the website does no pricing", async () => {
    const { svc } = await setup();
    const prices = Object.fromEntries((await c.staff.listBookableForService(svc.id)).map((s) => [s.name, s.pricePaise]));
    expect(prices).toEqual({ Asha: 100000, "Dr Dev": 150000 });
  });
});

describe("buying a package through the website", () => {
  it("creates the client if new, gives the credits and wallet value, and records the Razorpay payment", async () => {
    const { pkg } = await setup();
    const r = await c.packages.purchasePackage(website, pkg.id, pay(360000), t0);
    expect(r).toMatchObject({ kind: "package", replayed: false });
    const s = await c.packages.summary(r.clientId, t0);
    expect(s).toMatchObject({ packageValuePaise: 360000, totalPaise: 360000, walletPaise: 0 });
    expect(s.packages[0]).toMatchObject({ creditsLeft: 4, creditValuePaise: 100000 });
    expect(s.packages[0].expiresAt).toEqual(new Date(t0.getTime() + 365 * 86_400_000));
    expect((await c.clients.findByPhone("+919876543210"))?.name).toBe("Ravi Kumar");
  });

  it("refuses a wrong amount and credits nothing", async () => {
    const { pkg } = await setup();
    await expect(c.packages.purchasePackage(website, pkg.id, pay(350000))).rejects.toMatchObject({ code: "invalid", details: { reason: "amount_mismatch", expectedPaise: 360000 } });
    expect(await c.clients.findByPhone("+919876543210")).toBeNull();
  });

  it("refuses a package that is off sale", async () => {
    const { pkg } = await setup();
    await c.packages.update({}, pkg.id, { name: pkg.name, serviceIds: pkg.serviceIds, sessions: 4, pricePaise: 360000, active: false });
    await expect(c.packages.purchasePackage(website, pkg.id, pay(360000))).rejects.toMatchObject({ code: "conflict" });
  });

  it("credits once when the same Razorpay payment is reported again, even at the same moment", async () => {
    const { pkg } = await setup();
    const body = pay(360000);
    const results = await Promise.all([c.packages.purchasePackage(website, pkg.id, body, t0), c.packages.purchasePackage(website, pkg.id, body, t0), c.packages.purchasePackage(website, pkg.id, body, t0)]);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(new Set(results.map((r) => r.purchaseId)).size).toBe(1);
    expect((await c.packages.summary(results[0].clientId, t0)).packages).toHaveLength(1);
  });

  it("needs a Razorpay payment id and rejects other currencies", async () => {
    const { pkg } = await setup();
    await expect(c.packages.purchasePackage(website, pkg.id, { client: ravi, amountPaise: 360000 })).rejects.toThrow();
    await expect(c.packages.purchasePackage(website, pkg.id, pay(360000, { currency: "USD" }))).rejects.toMatchObject({ code: "invalid" });
  });

  it("is then used by the next booking, at the therapist's tier", async () => {
    const { svc, dev, pkg } = await setup();
    await c.packages.purchasePackage(website, pkg.id, pay(360000), t0);
    const { booking } = await c.bookings.create(website, { serviceId: svc.id, staffId: dev.id, start: at("2026-10-19T10:00"), client: ravi }, { now: t0, idempotencyKey: "web-key-12345678" });
    expect(booking).toMatchObject({ paymentStatus: "paid", creditMilli: 1500 });
    expect((await c.packages.summary(booking.clientId, t0)).packages[0]).toMatchObject({ creditsLeft: 2.5, valueLeftPaise: 210000 });
  });
});

describe("wallet top-up through the website", () => {
  it("gives exactly the amount paid, expiring in a year, and ignores a repeat", async () => {
    await setup();
    const body = pay(250000);
    const first = await c.packages.topUpFromPayment(website, body, t0);
    const again = await c.packages.topUpFromPayment(website, body, t0);
    expect([first.replayed, again.replayed, again.purchaseId === first.purchaseId]).toEqual([false, true, true]);
    const s = await c.packages.summary(first.clientId, t0);
    expect(s).toMatchObject({ walletPaise: 250000, totalPaise: 250000 });
    expect(s.lots[0].expiresAt).toEqual(new Date(t0.getTime() + 365 * 86_400_000));
  });

  it("refuses less than ₹1", async () => {
    await setup();
    await expect(c.packages.topUpFromPayment(website, pay(50))).rejects.toThrow();
  });
});

describe("a client's own bookings, for 'my bookings'", () => {
  it("lists upcoming, past, cancelled and all by phone, each with a working manage token", async () => {
    const { svc, asha } = await setup();
    const make = (start: string, now: Date) =>
      c.bookings.create(website, { serviceId: svc.id, staffId: asha.id, start: at(start), client: ravi, useCredits: false }, { now, idempotencyKey: `k-${++n}-12345678` }).then((r) => r.booking);
    const old = await make("2026-10-16T10:00", at("2026-10-10T08:00"));
    const soon = await make("2026-10-30T10:00", t0);
    const gone = await make("2026-10-31T10:00", t0);
    await c.bookings.cancel(website, gone.id, {}, { now: t0 });
    const after = at("2026-10-20T08:00");
    const ids = async (view: "upcoming" | "past" | "cancelled" | "all") => (await c.bookings.listForPhone("98765 43210", view, after)).map((r) => r.booking.id);
    expect(await ids("upcoming")).toEqual([soon.id]);
    expect(await ids("past")).toEqual([old.id]);
    expect(await ids("cancelled")).toEqual([gone.id]);
    expect((await ids("all")).sort()).toEqual([old.id, soon.id, gone.id].sort());
    const [item] = await c.bookings.listForPhone("+919876543210", "upcoming", after);
    await expect(c.bookings.verifyManageToken(item.booking.id, item.manageToken)).resolves.toBeUndefined();
    await c.bookings.cancel(website, item.booking.id, {}, { now: t0 }); // the website can cancel with nothing stored
  });

  it("returns nothing for another phone number, and rejects a bad one", async () => {
    const { svc, asha } = await setup();
    await c.bookings.create(website, { serviceId: svc.id, staffId: asha.id, start: at("2026-10-30T10:00"), client: ravi, useCredits: false }, { now: t0, idempotencyKey: "other-key-1234567" });
    expect(await c.bookings.listForPhone("99999 99999", "all", t0)).toEqual([]);
    await expect(c.bookings.listForPhone("12", "all")).rejects.toMatchObject({ code: "invalid" });
  });
});
