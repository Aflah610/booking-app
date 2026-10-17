import { beforeEach, describe, expect, it } from "vitest";
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
const DAY = 86_400_000;
const days = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const desk: BookingActor = { mode: "staff" };
const website: BookingActor = { mode: "client" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));
const ravi = { name: "Ravi Kumar", phone: "98765 43210", email: "ravi@example.com" };
let keyN = 0;

beforeEach(async () => {
  await reset();
  sent.length = 0;
});

async function setup() {
  const counselling = await c.catalog.create({}, { name: "Counselling", durationMin: 60, priceDisplay: "1000" });
  const other = await c.catalog.create({}, { name: "Assessment", durationMin: 60, priceDisplay: "2000" });
  const free = await c.catalog.create({}, { name: "Intro call", durationMin: 15 });
  const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
  const dev = await c.staff.create({}, { name: "Dr Dev", email: "dev@firm.test" });
  for (const s of [asha, dev]) {
    await c.staff.setServices({}, s.id, [counselling.id, other.id, free.id]);
    await c.schedules.setWeeklyHours({}, s.id, everyDay);
  }
  // Dr Dev charges five times as much for the same service.
  await c.staff.setServicePrices({}, dev.id, { [counselling.id]: 500000 });
  await c.workflows.create({}, { name: "Confirm", trigger: "booked", action: { channel: "email", recipient: "client", subject: "ok", body: "booked {{booking_id}}" } });
  const client = (await c.bookings.create(desk, { serviceId: free.id, start: at("2026-10-30T09:00"), client: ravi }, { now: t0 })).booking;
  return { counselling, other, free, asha, dev, clientId: client.clientId };
}
const book = (serviceId: string, staffId: string, start: string, o: { now?: Date; useCredits?: boolean } = {}) =>
  c.bookings.create(desk, { serviceId, staffId, start: at(start), client: ravi, useCredits: o.useCredits ?? true }, { now: o.now ?? t0 }).then((r) => r.booking);
const pack = (serviceIds: string[], o: { sessions?: number; price?: number; validityDays?: number | null; name?: string } = {}) =>
  c.packages.create({}, { name: o.name ?? "4 sessions", serviceIds, sessions: o.sessions ?? 4, pricePaise: o.price ?? 360000, validityDays: o.validityDays === undefined ? 365 : o.validityDays });
const left = async (clientId: string, now = t0) => c.packages.summary(clientId, now);

describe("staff prices", () => {
  it("charges the therapist's own price, or the service's when they have none", async () => {
    const { counselling, asha, dev } = await setup();
    expect((await book(counselling.id, asha.id, "2026-10-19T10:00")).amountPaise).toBe(100000);
    expect((await book(counselling.id, dev.id, "2026-10-19T10:00")).amountPaise).toBe(500000);
  });

  it("keeps a therapist's price when their list of services is saved again", async () => {
    const { counselling, other, dev } = await setup();
    await c.staff.setServices({}, dev.id, [counselling.id, other.id]);
    expect((await c.staff.servicePrices(dev.id))[counselling.id]).toBe(500000);
  });

  it("rejects a negative or fractional price", async () => {
    const { counselling, dev } = await setup();
    await expect(c.staff.setServicePrices({}, dev.id, { [counselling.id]: -5 })).rejects.toMatchObject({ code: "invalid" });
    await expect(c.staff.setServicePrices({}, dev.id, { [counselling.id]: 10.5 })).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("packages", () => {
  it("is validated when created", async () => {
    const { counselling } = await setup();
    await expect(pack([counselling.id], { sessions: 0 })).rejects.toThrow();
    await expect(pack(["00000000-0000-4000-8000-000000000000"])).rejects.toMatchObject({ code: "invalid" });
    expect(await pack([counselling.id])).toMatchObject({ sessions: 4, pricePaise: 360000, validityDays: 365 });
  });

  it("when sold, gives the client the sessions, the price and an expiry, and is not changed by later edits", async () => {
    const { counselling, clientId } = await setup();
    const p = await pack([counselling.id]);
    await c.packages.sell({}, clientId, { packageId: p.id, paymentNote: "UPI 123" }, t0);
    await c.packages.update({}, p.id, { name: "Renamed", serviceIds: [], sessions: 10, pricePaise: 1, validityDays: 5, active: true });
    const [mine] = (await left(clientId)).packages;
    expect(mine).toMatchObject({ sessionsTotal: 4, sessionsLeft: 4, pricePaise: 360000, paymentNote: "UPI 123" });
    expect(mine.expiresAt).toEqual(days(t0, 365));
  });

  it("can't be sold when switched off, or to someone who isn't a client", async () => {
    const { counselling, clientId } = await setup();
    const p = await c.packages.create({}, { name: "Old", serviceIds: [counselling.id], sessions: 2, pricePaise: 1000, active: false });
    await expect(c.packages.sell({}, clientId, { packageId: p.id })).rejects.toMatchObject({ code: "invalid" });
    const live = await pack([counselling.id]);
    await expect(c.packages.sell({}, "00000000-0000-4000-8000-000000000000", { packageId: live.id })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("booking with a package", () => {
  it("uses one session, marks the booking paid, and confirms it straight away", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id])).id }, t0);
    const b = await book(counselling.id, asha.id, "2026-10-19T10:00");
    expect(b).toMatchObject({ paymentStatus: "paid", creditSession: true, creditPaise: 0, amountPaise: null, paymentDueAt: null });
    expect((await left(clientId)).packages[0].sessionsLeft).toBe(3);
    expect((await c.packages.usesForBooking(b.id))[0]).toMatchObject({ kind: "package", sessions: 1, valuePaise: 90000 }); // ₹3,600 / 4
    expect(await c.workflows.processDue({ now: t0 })).toBeGreaterThan(0);
  });

  it("uses the package that expires first, and skips one that covers a different service", async () => {
    const { counselling, other, asha, clientId } = await setup();
    const onlyOther = await pack([other.id], { name: "Assessments", sessions: 1, price: 150000 });
    const soon = await pack([counselling.id], { name: "Soon", validityDays: 30 });
    const later = await pack([counselling.id], { name: "Later", validityDays: 300 });
    for (const p of [onlyOther, later, soon]) await c.packages.sell({}, clientId, { packageId: p.id }, t0);
    await book(counselling.id, asha.id, "2026-10-19T10:00");
    const byName = Object.fromEntries((await left(clientId)).packages.map((p) => [p.packageName, p.sessionsLeft]));
    expect(byName).toEqual({ Assessments: 1, Soon: 3, Later: 4 });
  });

  it("does not spend anything on a free service, or when told not to", async () => {
    const { counselling, free, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([])).id }, t0);
    await book(free.id, asha.id, "2026-10-19T10:00");
    await book(counselling.id, asha.id, "2026-10-19T12:00", { useCredits: false });
    expect((await left(clientId)).packages[0].sessionsLeft).toBe(4);
  });

  it("ignores a package that has expired", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id], { validityDays: 10 })).id }, t0);
    const b = await book(counselling.id, asha.id, "2026-10-30T10:00", { now: days(t0, 11) });
    expect(b).toMatchObject({ creditSession: false, paymentStatus: "pending", amountPaise: 100000 });
  });

  it("never lets two bookings made at once share the last session", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id], { sessions: 1 })).id }, t0);
    const both = await Promise.all([book(counselling.id, asha.id, "2026-10-19T10:00"), book(counselling.id, asha.id, "2026-10-20T10:00")]);
    expect(both.filter((b) => b.creditSession)).toHaveLength(1);
    expect(both.filter((b) => b.paymentStatus === "pending")).toHaveLength(1);
    expect((await left(clientId)).packages).toHaveLength(0);
  });
});

describe("booking with wallet money", () => {
  it("takes the session's price and leaves the rest", async () => {
    const { counselling, asha, dev, clientId } = await setup();
    await c.packages.topUp({}, clientId, { amountPaise: 700000 }, t0);
    const cheap = await book(counselling.id, asha.id, "2026-10-19T10:00");
    expect(cheap).toMatchObject({ paymentStatus: "paid", creditPaise: 100000, creditSession: false, amountPaise: null });
    const dear = await book(counselling.id, dev.id, "2026-10-19T10:00");
    expect(dear).toMatchObject({ paymentStatus: "paid", creditPaise: 500000 });
    expect((await left(clientId)).walletPaise).toBe(100000);
  });

  it("uses what it can and leaves the difference to pay", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.topUp({}, clientId, { amountPaise: 40000 }, t0);
    const b = await book(counselling.id, asha.id, "2026-10-19T10:00");
    expect(b).toMatchObject({ paymentStatus: "pending", creditPaise: 40000, amountPaise: 60000 });
    expect((await left(clientId)).walletPaise).toBe(0);
  });

  it("spends the money that expires first, across top-ups", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.topUp({}, clientId, { amountPaise: 60000 }, days(t0, -100)); // expires first
    await c.packages.topUp({}, clientId, { amountPaise: 300000 }, t0);
    await book(counselling.id, asha.id, "2026-10-19T10:00");
    const lots = (await left(clientId)).lots;
    expect(lots.map((l) => l.remainingPaise)).toEqual([260000]); // the older ₹600 is gone, ₹400 came from the newer one
    const uses = await c.packages.usesForBooking((await c.bookings.list({ view: "all" })).find((b) => b.creditPaise)!.id);
    expect(uses.map((u) => u.amountPaise).sort((a, b) => a - b)).toEqual([40000, 60000]);
  });

  it("prefers a package session over wallet money", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id])).id }, t0);
    await c.packages.topUp({}, clientId, { amountPaise: 500000 }, t0);
    await book(counselling.id, asha.id, "2026-10-19T10:00");
    const s = await left(clientId);
    expect([s.packages[0].sessionsLeft, s.walletPaise]).toEqual([3, 500000]);
  });

  it("can never go below zero when bookings race for the same money", async () => {
    const { counselling, asha, dev, clientId } = await setup();
    await c.packages.topUp({}, clientId, { amountPaise: 150000 }, t0);
    const both = await Promise.all([book(counselling.id, asha.id, "2026-10-19T10:00"), book(counselling.id, dev.id, "2026-10-19T10:00")]);
    const taken = both.reduce((n, b) => n + b.creditPaise, 0);
    expect(taken).toBe(150000);
    expect((await left(clientId)).walletPaise).toBe(0);
  });

  it("ignores money that has expired", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.topUp({}, clientId, { amountPaise: 500000 }, days(t0, -400));
    expect((await book(counselling.id, asha.id, "2026-10-19T10:00")).creditPaise).toBe(0);
    expect((await left(clientId)).walletPaise).toBe(0);
  });

  it("topping up needs a real amount", async () => {
    const { clientId } = await setup();
    await expect(c.packages.topUp({}, clientId, { amountPaise: 0 })).rejects.toThrow();
    await expect(c.packages.topUp({}, clientId, { amountPaise: -500 })).rejects.toThrow();
  });
});

describe("giving credit back", () => {
  it("returns a package session and the exact wallet money when a booking is cancelled", async () => {
    const { counselling, asha, dev, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id], { sessions: 1 })).id }, t0);
    await c.packages.topUp({}, clientId, { amountPaise: 600000 }, t0);
    const withSession = await book(counselling.id, asha.id, "2026-10-19T10:00");
    const withMoney = await book(counselling.id, dev.id, "2026-10-19T10:00");
    expect((await left(clientId)).walletPaise).toBe(100000);
    await c.bookings.cancel(desk, withSession.id, {}, { now: t0 });
    await c.bookings.cancel(desk, withMoney.id, {}, { now: t0 });
    const s = await left(clientId);
    expect([s.packages[0].sessionsLeft, s.walletPaise]).toEqual([1, 600000]);
    expect(await c.bookings.get(withMoney.id)).toMatchObject({ creditPaise: 0, creditSession: false });
    // The history still shows what it was paid with, marked as given back.
    expect((await c.packages.usesForBooking(withMoney.id))[0].returnedAt).not.toBeNull();
  });

  it("does not restore money or a session that expired in the meantime", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.topUp({}, clientId, { amountPaise: 300000 }, days(t0, -364)); // expires tomorrow
    const b = await book(counselling.id, asha.id, "2026-10-25T10:00");
    await c.bookings.cancel(desk, b.id, {}, { now: days(t0, 2) });
    expect((await left(clientId, days(t0, 2))).walletPaise).toBe(0);
  });

  it("keeps what paid for a booking when it is moved, and returns it once if the new one is cancelled", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id])).id }, t0);
    const b = await book(counselling.id, asha.id, "2026-10-19T10:00");
    const moved = await c.bookings.reschedule(desk, b.id, { start: at("2026-10-20T10:00"), staffId: asha.id }, { now: t0 });
    expect(moved).toMatchObject({ creditSession: true, paymentStatus: "paid" });
    expect((await left(clientId)).packages[0].sessionsLeft).toBe(3);
    await c.bookings.cancel(desk, moved.id, {}, { now: t0 });
    expect((await left(clientId)).packages[0].sessionsLeft).toBe(4);
  });

  it("keeps the credit used when the client misses it, and gives it back when the staff member does", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id])).id }, t0);
    const missedByClient = await book(counselling.id, asha.id, "2026-10-19T10:00");
    const missedByStaff = await book(counselling.id, asha.id, "2026-10-20T10:00");
    const after = days(t0, 10);
    await c.bookings.markStatus(desk, missedByClient.id, "no_show", { now: after, noShowBy: "client" });
    expect((await left(clientId)).packages[0].sessionsLeft).toBe(2);
    await c.bookings.markStatus(desk, missedByStaff.id, "no_show", { now: after, noShowBy: "staff" });
    expect((await left(clientId)).packages[0].sessionsLeft).toBe(3);
  });

  it("completing a booking uses nothing more", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id])).id }, t0);
    const b = await book(counselling.id, asha.id, "2026-10-19T10:00");
    await c.bookings.markStatus(desk, b.id, "completed", { now: days(t0, 10) });
    expect((await left(clientId)).packages[0].sessionsLeft).toBe(3);
  });
});

describe("on the website", () => {
  const online = async (on: boolean) => c.settings.update({}, { ...(await c.settings.get()), onlinePayment: on, resumeUrl: "https://yourfirm.com/my-bookings" });
  // Always with Asha (₹1,000): left to itself the website would sometimes pick Dr Dev at ₹5,000.
  const webBook = async (serviceId: string, start: string, now = t0) =>
    c.bookings.create(website, { serviceId, staffId: (await c.staff.list()).find((s) => s.name === "Asha")!.id, start: at(start), client: ravi }, { now, idempotencyKey: `key-${++keyN}-12345678` });

  it("is settled at once when credit covers it, and asks only for the difference when it does not", async () => {
    await online(true);
    try {
      const { counselling, clientId } = await setup();
      await c.packages.topUp({}, clientId, { amountPaise: 40000 }, t0);
      await c.workflows.processDue({ now: t0 }); // setup's own free booking sends its confirmation first
      const part = (await webBook(counselling.id, "2026-10-19T10:00")).booking;
      expect(part).toMatchObject({ paymentStatus: "pending", amountPaise: 60000, creditPaise: 40000 });
      expect(part.paymentDueAt).toEqual(new Date(t0.getTime() + 15 * 60_000));
      expect(await c.workflows.processDue({ now: t0 })).toBe(0); // not confirmed until the rest is paid

      await c.packages.topUp({}, clientId, { amountPaise: 500000 }, t0);
      const whole = (await webBook(counselling.id, "2026-10-20T10:00")).booking;
      expect(whole).toMatchObject({ paymentStatus: "paid", paymentDueAt: null, resumeUntil: null });
      expect(await c.workflows.processDue({ now: t0 })).toBeGreaterThan(0); // confirmed straight away
    } finally {
      await online(false);
    }
  });

  it("gives credit back when an unpaid booking is cancelled after 24 hours, but not when only the 15 minutes pass", async () => {
    await online(true);
    try {
      const { counselling, clientId } = await setup();
      await c.packages.topUp({}, clientId, { amountPaise: 40000 }, t0);
      await webBook(counselling.id, "2026-10-19T10:00");
      await c.payments.expire(new Date(t0.getTime() + 20 * 60_000));
      expect((await left(clientId)).walletPaise).toBe(0); // still held while the client can resume
      await c.payments.expire(new Date(t0.getTime() + 25 * 3600_000));
      expect((await left(clientId, new Date(t0.getTime() + 25 * 3600_000))).walletPaise).toBe(40000);
    } finally {
      await online(false);
    }
  });

  it("does not spend twice when the same request is retried", async () => {
    const { counselling, clientId } = await setup();
    await c.packages.topUp({}, clientId, { amountPaise: 300000 }, t0);
    const key = "same-key-123456";
    const asha = (await c.staff.list()).find((s) => s.name === "Asha")!.id;
    const send1 = () => c.bookings.create(website, { serviceId: counselling.id, staffId: asha, start: at("2026-10-19T10:00"), client: ravi }, { now: t0, idempotencyKey: key });
    await send1();
    expect((await send1()).replayed).toBe(true);
    expect((await left(clientId)).walletPaise).toBe(200000);
  });

  it("tells the website what was paid from credit", async () => {
    const { counselling, clientId } = await setup();
    await c.packages.topUp({}, clientId, { amountPaise: 40000 }, t0);
    const { toPublicBooking } = await import("@/features/bookings/bookings.dto");
    const b = (await webBook(counselling.id, "2026-10-19T10:00")).booking;
    expect(toPublicBooking(b, "BK-", t0).payment.credit).toEqual({ session: false, walletPaise: 40000 });
  });
});
