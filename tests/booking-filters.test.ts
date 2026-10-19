import { beforeEach, describe, expect, it } from "vitest";
import { c, reset } from "./helpers";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { zonedToUtc } from "@/lib/time";

beforeEach(reset);

const IST = "Asia/Kolkata";
const at = (local: string) => zonedToUtc(local, IST);
const now = at("2026-10-15T08:00");
const desk: BookingActor = { mode: "staff" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));

/** Two services, two therapists, two clients: Ravi has a package with sessions left, Meera has none. */
async function setup() {
  const talk = await c.catalog.create({}, { name: "Counselling", durationMin: 30, priceDisplay: "1000" });
  const test = await c.catalog.create({}, { name: "Assessment", durationMin: 30, priceDisplay: "2000" });
  const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
  const dev = await c.staff.create({}, { name: "Dr Dev", email: "dev@firm.test" });
  for (const s of [asha, dev]) {
    await c.staff.setServices({}, s.id, [talk.id, test.id]);
    await c.schedules.setWeeklyHours({}, s.id, everyDay);
  }
  const ravi = { name: "Ravi", phone: "98765 43210" };
  const meera = { name: "Meera", phone: "98765 43211" };
  const book = (serviceId: string, staffId: string, start: string, client: typeof ravi) =>
    c.bookings.create(desk, { serviceId, staffId, start: at(start), client, useCredits: false }, { now }).then((r) => r.booking);
  const a = await book(talk.id, asha.id, "2026-12-01T10:00", ravi);
  const b = await book(test.id, dev.id, "2026-12-02T10:00", meera);
  const d = await book(talk.id, dev.id, "2026-12-03T10:00", ravi);
  const pack = await c.packages.create({}, { name: "4 sessions", serviceIds: [talk.id], sessions: 4, pricePaise: 360000, validityDays: 365 });
  await c.packages.sell({}, a.clientId, { packageId: pack.id }, now);
  return { talk, test, asha, dev, a, b, d };
}
const ids = async (q: Parameters<typeof c.bookings.list>[0]) => (await c.bookings.list({ view: "all", ...q })).map((x) => x.id).sort();

describe("filtering the booking list", () => {
  it("by service", async () => {
    const { talk, test, a, b, d } = await setup();
    expect(await ids({ serviceId: talk.id })).toEqual([a.id, d.id].sort());
    expect(await ids({ serviceId: test.id })).toEqual([b.id]);
  });

  it("by therapist", async () => {
    const { asha, dev, a, b, d } = await setup();
    expect(await ids({ staffId: asha.id })).toEqual([a.id]);
    expect(await ids({ staffId: dev.id })).toEqual([b.id, d.id].sort());
  });

  it("by payment status", async () => {
    const { a, b, d } = await setup();
    await c.bookings.setPayment({}, a.id, "paid");
    await c.bookings.setPayment({}, b.id, "failed");
    await c.bookings.setPayment({}, d.id, "pending");
    expect(await ids({ paymentStatus: "paid" })).toEqual([a.id]);
    expect(await ids({ paymentStatus: "failed" })).toEqual([b.id]);
    expect(await ids({ paymentStatus: "pending" })).toEqual([d.id]);
  });

  it("by whether the client still has package sessions left", async () => {
    const { a, b, d } = await setup();
    expect(await ids({ packageBalance: "has" })).toEqual([a.id, d.id].sort());
    expect(await ids({ packageBalance: "none" })).toEqual([b.id]);
  });

  it("treats a used-up or expired package as no balance", async () => {
    const { a, b, d } = await setup();
    const { sql } = await import("drizzle-orm");
    const { db } = await import("./helpers");
    await db.execute(sql`update client_package set credits_left_milli = 0`);
    expect(await ids({ packageBalance: "has" })).toEqual([]);
    expect(await ids({ packageBalance: "none" })).toEqual([a.id, b.id, d.id].sort());
    await db.execute(sql`update client_package set credits_left_milli = credits_total_milli, expires_at = now() - interval '1 day'`);
    expect(await ids({ packageBalance: "has" })).toEqual([]);
  });

  it("by date, and combined with the other filters", async () => {
    const { talk, dev, a, b, d } = await setup();
    expect(await ids({ from: at("2026-12-02T00:00"), to: at("2026-12-03T23:59") })).toEqual([b.id, d.id].sort());
    expect(await ids({ from: at("2026-12-02T00:00"), to: at("2026-12-03T23:59"), serviceId: talk.id })).toEqual([d.id]);
    expect(await ids({ staffId: dev.id, packageBalance: "has", from: at("2026-12-01T00:00"), to: at("2026-12-01T23:59") })).toEqual([]);
    expect(await ids({ from: at("2026-12-01T00:00"), to: at("2026-12-01T23:59") })).toEqual([a.id]);
  });

  it("rejects a service id or payment status that is not valid", async () => {
    await expect(c.bookings.list({ view: "all", serviceId: "not-a-uuid" })).rejects.toThrow();
    // @ts-expect-error not a payment status
    await expect(c.bookings.list({ view: "all", paymentStatus: "refunded" })).rejects.toThrow();
  });
});
