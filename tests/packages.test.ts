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
    expect(mine).toMatchObject({ creditsTotal: 4, creditsLeft: 4, pricePaise: 360000, paymentNote: "UPI 123" });
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
    expect(b).toMatchObject({ paymentStatus: "paid", creditMilli: 1000, creditPaise: 0, amountPaise: null, paymentDueAt: null });
    expect((await left(clientId)).packages[0].creditsLeft).toBe(3);
    expect((await c.packages.usesForBooking(b.id))[0]).toMatchObject({ kind: "package", credits: 1, valuePaise: 90000 }); // ₹3,600 / 4
    expect(await c.workflows.processDue({ now: t0 })).toBeGreaterThan(0);
  });

  it("uses the package that expires first, and skips one that covers a different service", async () => {
    const { counselling, other, asha, clientId } = await setup();
    const onlyOther = await pack([other.id], { name: "Assessments", sessions: 1, price: 150000 });
    const soon = await pack([counselling.id], { name: "Soon", validityDays: 30 });
    const later = await pack([counselling.id], { name: "Later", validityDays: 300 });
    for (const p of [onlyOther, later, soon]) await c.packages.sell({}, clientId, { packageId: p.id }, t0);
    await book(counselling.id, asha.id, "2026-10-19T10:00");
    const byName = Object.fromEntries((await left(clientId)).packages.map((p) => [p.packageName, p.creditsLeft]));
    expect(byName).toEqual({ Assessments: 1, Soon: 3, Later: 4 });
  });

  it("does not spend anything on a free service, or when told not to", async () => {
    const { counselling, free, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([])).id }, t0);
    await book(free.id, asha.id, "2026-10-19T10:00");
    await book(counselling.id, asha.id, "2026-10-19T12:00", { useCredits: false });
    expect((await left(clientId)).packages[0].creditsLeft).toBe(4);
  });

  it("ignores a package that has expired", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id], { validityDays: 10 })).id }, t0);
    const b = await book(counselling.id, asha.id, "2026-10-30T10:00", { now: days(t0, 11) });
    expect(b).toMatchObject({ creditMilli: 0, paymentStatus: "pending", amountPaise: 100000 });
  });

  it("never lets two bookings made at once share the last session", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id], { sessions: 1 })).id }, t0);
    const both = await Promise.all([book(counselling.id, asha.id, "2026-10-19T10:00"), book(counselling.id, asha.id, "2026-10-20T10:00")]);
    expect(both.filter((b) => b.creditMilli > 0)).toHaveLength(1);
    expect(both.filter((b) => b.paymentStatus === "pending")).toHaveLength(1);
    expect((await left(clientId)).packages).toHaveLength(0);
  });
});

describe("booking with wallet money", () => {
  it("takes the session's price and leaves the rest", async () => {
    const { counselling, asha, dev, clientId } = await setup();
    await c.packages.topUp({}, clientId, { amountPaise: 700000 }, t0);
    const cheap = await book(counselling.id, asha.id, "2026-10-19T10:00");
    expect(cheap).toMatchObject({ paymentStatus: "paid", creditPaise: 100000, creditMilli: 0, amountPaise: null });
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
    expect([s.packages[0].creditsLeft, s.walletPaise]).toEqual([3, 500000]);
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
    expect([s.packages[0].creditsLeft, s.walletPaise]).toEqual([1, 600000]);
    expect(await c.bookings.get(withMoney.id)).toMatchObject({ creditPaise: 0, creditMilli: 0 });
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
    expect(moved).toMatchObject({ creditMilli: 1000, paymentStatus: "paid" });
    expect((await left(clientId)).packages[0].creditsLeft).toBe(3);
    await c.bookings.cancel(desk, moved.id, {}, { now: t0 });
    expect((await left(clientId)).packages[0].creditsLeft).toBe(4);
  });

  it("keeps the credit used when the client misses it, and gives it back when the staff member does", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id])).id }, t0);
    const missedByClient = await book(counselling.id, asha.id, "2026-10-19T10:00");
    const missedByStaff = await book(counselling.id, asha.id, "2026-10-20T10:00");
    const after = days(t0, 10);
    await c.bookings.markStatus(desk, missedByClient.id, "no_show", { now: after, noShowBy: "client" });
    expect((await left(clientId)).packages[0].creditsLeft).toBe(2);
    await c.bookings.markStatus(desk, missedByStaff.id, "no_show", { now: after, noShowBy: "staff" });
    expect((await left(clientId)).packages[0].creditsLeft).toBe(3);
  });

  it("completing a booking uses nothing more", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id])).id }, t0);
    const b = await book(counselling.id, asha.id, "2026-10-19T10:00");
    await c.bookings.markStatus(desk, b.id, "completed", { now: days(t0, 10) });
    expect((await left(clientId)).packages[0].creditsLeft).toBe(3);
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
    expect(toPublicBooking(b, "BK-", t0).payment.credit).toEqual({ credits: 0, walletPaise: 40000 });
  });
});

describe("paying an existing booking with credit", () => {
  it("uses a package bought after the booking was made", async () => {
    const { counselling, asha, clientId } = await setup();
    const b = await book(counselling.id, asha.id, "2026-10-19T10:00");
    expect(b).toMatchObject({ paymentStatus: "pending", creditMilli: 0 });
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id])).id }, t0);
    expect(await c.bookings.useCredit({}, b.id, { now: t0 })).toMatchObject({ paymentStatus: "paid", creditMilli: 1000, amountPaise: null });
    expect((await left(clientId)).packages[0].creditsLeft).toBe(3);
  });

  it("uses wallet money added later, leaving the difference to pay", async () => {
    const { counselling, asha, clientId } = await setup();
    const b = await book(counselling.id, asha.id, "2026-10-19T10:00");
    await c.packages.topUp({}, clientId, { amountPaise: 40000 }, t0);
    expect(await c.bookings.useCredit({}, b.id, { now: t0 })).toMatchObject({ paymentStatus: "pending", creditPaise: 40000, amountPaise: 60000 });
  });

  it("works for a service whose price was typed as plain text only when there is a session to use", async () => {
    const { asha, clientId } = await setup();
    const vague = await c.catalog.create({}, { name: "Consult", durationMin: 60, priceDisplay: "From ₹500" });
    await c.staff.setServices({}, asha.id, [vague.id]);
    const b = await book(vague.id, asha.id, "2026-10-19T10:00");
    await c.packages.topUp({}, clientId, { amountPaise: 500000 }, t0);
    await expect(c.bookings.useCredit({}, b.id, { now: t0 })).rejects.toMatchObject({ code: "invalid" }); // no amount, so the wallet can't pay it
    await c.packages.sell({}, clientId, { packageId: (await pack([vague.id])).id }, t0);
    expect(await c.bookings.useCredit({}, b.id, { now: t0 })).toMatchObject({ paymentStatus: "paid", creditMilli: 1000 });
  });

  it("refuses when nothing applies, when already paid, when credit was used, or when cancelled", async () => {
    const { counselling, asha, clientId } = await setup();
    const b = await book(counselling.id, asha.id, "2026-10-19T10:00");
    await expect(c.bookings.useCredit({}, b.id, { now: t0 })).rejects.toMatchObject({ code: "invalid" });
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id])).id }, t0);
    await c.bookings.useCredit({}, b.id, { now: t0 });
    await expect(c.bookings.useCredit({}, b.id, { now: t0 })).rejects.toMatchObject({ code: "conflict" });
    const other = await book(counselling.id, asha.id, "2026-10-20T10:00", { useCredits: false });
    await c.bookings.cancel(desk, other.id, {}, { now: t0 });
    await expect(c.bookings.useCredit({}, other.id, { now: t0 })).rejects.toMatchObject({ code: "conflict" });
  });

  it("confirms an online booking that was waiting for payment once credit pays it all", async () => {
    await c.settings.update({}, { ...(await c.settings.get()), onlinePayment: true, resumeUrl: "https://yourfirm.com/my-bookings" });
    try {
      const { counselling, asha, clientId } = await setup();
      await c.workflows.processDue({ now: t0 });
      const b = (await c.bookings.create(website, { serviceId: counselling.id, staffId: asha.id, start: at("2026-10-19T10:00"), client: ravi }, { now: t0, idempotencyKey: "web-key-12345678" })).booking;
      expect(await c.workflows.processDue({ now: t0 })).toBe(0);
      await c.packages.topUp({}, clientId, { amountPaise: 100000 }, t0);
      await c.bookings.useCredit({}, b.id, { now: t0 });
      expect(await c.workflows.processDue({ now: t0 })).toBeGreaterThan(0);
      expect(await c.bookings.get(b.id)).toMatchObject({ paymentStatus: "paid", resumeUntil: null });
    } finally {
      await c.settings.update({}, { ...(await c.settings.get()), onlinePayment: false });
    }
  });
});

describe("wallet total follows package purchases", () => {
  it("shows the full amount paid after buying a package, and falls by each session's share as sessions are used", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id])).id }, t0); // ₹3,600 for 4
    expect(await left(clientId)).toMatchObject({ totalPaise: 360000, packageValuePaise: 360000, walletPaise: 0 });
    const b = await book(counselling.id, asha.id, "2026-10-19T10:00");
    expect(await left(clientId)).toMatchObject({ totalPaise: 270000, packageValuePaise: 270000 });
    expect((await left(clientId)).packages[0]).toMatchObject({ creditsLeft: 3, valueLeftPaise: 270000 });
    await c.bookings.cancel(desk, b.id, {}, { now: t0 });
    expect(await left(clientId)).toMatchObject({ totalPaise: 360000, packageValuePaise: 360000 });
  });

  it("adds top-ups on top, and a client who used up every session has nothing left", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id], { sessions: 2, price: 200000 })).id }, t0);
    await c.packages.topUp({}, clientId, { amountPaise: 50000 }, t0);
    expect(await left(clientId)).toMatchObject({ totalPaise: 250000, packageValuePaise: 200000, walletPaise: 50000 });
    await book(counselling.id, asha.id, "2026-10-19T10:00");
    await book(counselling.id, asha.id, "2026-10-20T10:00");
    expect(await left(clientId)).toMatchObject({ totalPaise: 50000, packageValuePaise: 0 });
  });

  it("splits a price that doesn't divide evenly so the sessions add up to exactly what was paid", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id], { sessions: 3, price: 100000, name: "Three" })).id }, t0);
    const ids = [
      (await book(counselling.id, asha.id, "2026-10-19T10:00")).id,
      (await book(counselling.id, asha.id, "2026-10-20T10:00")).id,
      (await book(counselling.id, asha.id, "2026-10-21T10:00")).id,
    ];
    const values = (await Promise.all(ids.map((id) => c.packages.usesForBooking(id)))).map((u) => u[0].valuePaise);
    expect(values.reduce((n, v) => n + v, 0)).toBe(100000);
    expect((await left(clientId)).packages).toHaveLength(0);
  });

  it("does not let package money pay for a service the package doesn't cover", async () => {
    const { counselling, other, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id])).id }, t0);
    const b = await book(other.id, asha.id, "2026-10-19T10:00");
    expect(b).toMatchObject({ creditMilli: 0, creditPaise: 0, paymentStatus: "pending", amountPaise: 200000 });
    expect((await left(clientId)).totalPaise).toBe(360000);
  });

  it("leaves out the value of a package that has expired", async () => {
    const { counselling, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([counselling.id], { validityDays: 10 })).id }, t0);
    expect((await left(clientId, days(t0, 11))).totalPaise).toBe(0);
  });
});

import { allocate } from "@/features/packages/packages.dto";

describe("credit that flexes with the price", () => {
  const pkg = (leftMilli: number, over: Partial<{ id: string; creditValuePaise: number; pricePaise: number; totalMilli: number; valueLeftPaise: number }> = {}) => {
    const totalMilli = over.totalMilli ?? 4000;
    const pricePaise = over.pricePaise ?? 360000;
    return { id: over.id ?? "p1", leftMilli, totalMilli, creditValuePaise: over.creditValuePaise ?? 100000, pricePaise, valueLeftPaise: over.valueLeftPaise ?? Math.round((pricePaise * leftMilli) / totalMilli) };
  };

  it("takes 1 credit and ₹900 at the package's own tier, but 1.5 credits and the full ₹1,500 at a dearer one", () => {
    const base = allocate(100000, [pkg(4000)], []);
    expect(base.packages[0]).toMatchObject({ milli: 1000, coveredPaise: 100000, valuePaise: 90000 });
    const dearer = allocate(150000, [pkg(4000)], []);
    expect(dearer).toMatchObject({ creditsMilli: 1500, walletPaise: 0, duePaise: 0, covered: true });
    expect(dearer.packages[0]).toMatchObject({ milli: 1500, coveredPaise: 150000, valuePaise: 150000 });
  });

  it("never takes more money value than the package has left", () => {
    expect(allocate(150000, [pkg(1500, { valueLeftPaise: 100000 })], []).packages[0].valuePaise).toBe(100000);
    expect(allocate(100000, [pkg(2000, { valueLeftPaise: 50000 })], []).packages[0].valuePaise).toBe(50000);
  });

  it("takes 5 credits for a ₹5,000 service, and asks for the rest when there are too few", () => {
    expect(allocate(500000, [pkg(5000, { totalMilli: 5000, pricePaise: 450000 })], [])).toMatchObject({ creditsMilli: 5000, covered: true });
    expect(allocate(500000, [pkg(4000)], [])).toMatchObject({ creditsMilli: 4000, duePaise: 100000, covered: false });
  });

  it("pays what packages can, then wallet money, then leaves the rest", () => {
    const a = allocate(100000, [pkg(500)], [{ id: "l1", remainingPaise: 30000 }]);
    expect(a).toMatchObject({ creditsMilli: 500, walletPaise: 30000, duePaise: 20000, covered: false });
  });

  it("spreads one booking across packages, soonest expiry first, and across wallet lots", () => {
    const a = allocate(300000, [pkg(1000, { id: "a" }), pkg(4000, { id: "b" })], []);
    expect(a.packages.map((p) => [p.id, p.milli])).toEqual([["a", 1000], ["b", 2000]]);
    const w = allocate(100000, [], [{ id: "x", remainingPaise: 60000 }, { id: "y", remainingPaise: 60000 }]);
    expect(w.lots).toEqual([{ id: "x", amountPaise: 60000 }, { id: "y", amountPaise: 40000 }]);
  });

  it("uses exactly what is left of a package when it is the last of it, so no sliver is stranded", () => {
    const last = pkg(333, { creditValuePaise: 300000, totalMilli: 1000, pricePaise: 90000 }); // 0.333 of a credit covers ₹999
    expect(allocate(99900, [last], [])).toMatchObject({ creditsMilli: 333, duePaise: 0, covered: true });
    expect(allocate(100000, [last], [])).toMatchObject({ creditsMilli: 333, duePaise: 100, covered: false });
  });

  it("counts a service with no known price as one credit and charges nothing", () => {
    expect(allocate(null, [pkg(4000)], [])).toMatchObject({ creditsMilli: 1000, covered: true });
    expect(allocate(null, [pkg(500)], [])).toMatchObject({ creditsMilli: 0, covered: false });
  });

  it("the client's own example: ₹1,000 therapist takes 1 credit and ₹900; moving up to ₹1,500 takes 1.5 credits and ₹1,500; cancelling restores each", async () => {
    const { clientId } = await setup();
    const mid = await c.catalog.create({}, { name: "Session", durationMin: 60, priceDisplay: "1500" });
    const dr = (await c.staff.list()).find((x) => x.name === "Asha")!;
    await c.staff.setServices({}, dr.id, [mid.id]);
    await c.packages.sell({}, clientId, { packageId: (await pack([])).id }, t0); // 4 credits for ₹3,600, one credit covers ₹1,000
    const counselling = (await c.catalog.list()).find((x) => x.name === "Counselling")!;
    await c.staff.setServices({}, dr.id, [mid.id, counselling.id]);
    const stays = await book(counselling.id, dr.id, "2026-10-19T10:00");
    expect(stays).toMatchObject({ creditMilli: 1000, paymentStatus: "paid" });
    expect((await left(clientId)).packages[0]).toMatchObject({ creditsLeft: 3, valueLeftPaise: 270000 });
    const b = await book(mid.id, dr.id, "2026-10-20T10:00");
    expect(b).toMatchObject({ paymentStatus: "paid", creditMilli: 1500, amountPaise: null });
    expect((await left(clientId)).packages[0]).toMatchObject({ creditsLeft: 1.5, valueLeftPaise: 120000 });
    expect(await left(clientId)).toMatchObject({ totalPaise: 120000 });
    expect((await c.packages.usesForBooking(b.id))[0]).toMatchObject({ credits: 1.5, coveredPaise: 150000, valuePaise: 150000 });
    await c.bookings.cancel(desk, b.id, {}, { now: t0 });
    expect((await left(clientId)).packages[0]).toMatchObject({ creditsLeft: 3, valueLeftPaise: 270000 });
    await c.bookings.cancel(desk, stays.id, {}, { now: t0 });
    expect(await left(clientId)).toMatchObject({ totalPaise: 360000 });
  });

  it("lets the money run out before the credits when a client keeps moving up, and still takes the credits", async () => {
    const { counselling, asha, dev, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([])).id }, t0); // 4 credits, ₹3,600
    const first = await book(counselling.id, dev.id, "2026-10-19T10:00"); // ₹5,000: 4 credits would be needed, only 4 held
    expect(first).toMatchObject({ creditMilli: 4000, amountPaise: 100000 }); // credits cover ₹4,000, ₹1,000 to pay
    expect((await left(clientId)).packages).toHaveLength(0);
    const uses = await c.packages.usesForBooking(first.id);
    expect(uses[0].valuePaise).toBe(360000); // all the money the package held
    void asha;
  });

  it("lets one package pay for services of different prices, and a pricey therapist uses more credits", async () => {
    const { counselling, other, asha, dev, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([])).id }, t0);
    const cheap = await book(counselling.id, asha.id, "2026-10-19T10:00"); // ₹1,000 → 1 credit
    const mid = await book(other.id, asha.id, "2026-10-20T10:00"); // ₹2,000 → 2 credits
    expect([cheap.creditMilli, mid.creditMilli]).toEqual([1000, 2000]);
    const dear = await book(counselling.id, dev.id, "2026-10-21T10:00"); // ₹5,000, only 1 credit left
    expect(dear).toMatchObject({ creditMilli: 1000, paymentStatus: "pending", amountPaise: 400000 });
    expect((await left(clientId)).packages).toHaveLength(0);
  });

  it("combines part-used credit with wallet money and leaves the difference to pay", async () => {
    const { counselling, asha, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([], { sessions: 1, price: 90000 })).id }, t0);
    const mid = await c.catalog.create({}, { name: "Long", durationMin: 60, priceDisplay: "1500" });
    await c.staff.setServices({}, asha.id, [counselling.id, mid.id]);
    await c.packages.topUp({}, clientId, { amountPaise: 20000 }, t0);
    const b = await book(mid.id, asha.id, "2026-10-19T10:00"); // wants ₹1,500: 1 credit covers ₹1,000, wallet ₹200, ₹300 left
    expect(b).toMatchObject({ creditMilli: 1000, creditPaise: 20000, paymentStatus: "pending", amountPaise: 30000 });
  });

  it("quotes exactly what booking will do, and takes nothing", async () => {
    const { counselling, dev, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([])).id }, t0);
    const q = await c.packages.quote(clientId, { serviceId: counselling.id, staffId: dev.id }, t0);
    expect(q.pricePaise).toBe(500000);
    expect(q.plan).toMatchObject({ creditsMilli: 4000, duePaise: 100000, covered: false });
    expect((await left(clientId)).packages[0].creditsLeft).toBe(4); // nothing taken
    const b = await book(counselling.id, dev.id, "2026-10-19T10:00");
    expect([b.creditMilli, b.amountPaise]).toEqual([q.plan.creditsMilli, q.plan.duePaise]);
  });

  it("quotes nothing for a free service", async () => {
    const { free, clientId } = await setup();
    await c.packages.sell({}, clientId, { packageId: (await pack([])).id }, t0);
    expect((await c.packages.quote(clientId, { serviceId: free.id }, t0)).plan).toMatchObject({ creditsMilli: 0, covered: false });
  });
});
