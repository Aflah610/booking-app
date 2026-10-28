import { afterEach, beforeEach, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, reset, c } from "./helpers";
import { createBookingsService } from "@/features/bookings/bookings.service";
import { createBookingsRepository } from "@/features/bookings/bookings.repository";
import { createSettingsRepository } from "@/features/settings/settings.repository";
import { zonedToUtc } from "@/lib/time";

const at = (local: string) => zonedToUtc(local, "Asia/Kolkata");
const now = at("2026-10-15T08:00");
const actor = { mode: "staff" as const };
const client = { name: "Synthetic client", phone: "9876543210" };
beforeEach(async () => { await reset(); await db.execute(sql`update business set staff_max_per_day = null, online_payment = false`); });
afterEach(() => db.execute(sql`update business set staff_max_per_day = null`));
async function setup(extra = {}) {
  const service = await c.catalog.create({}, { name: "Session", durationMin: 30, ...extra });
  const people = await Promise.all(["One", "Two"].map((name, i) => c.staff.create({}, { name, email: `race${i}@example.test` })));
  for (const person of people) {
    await c.staff.setServices({}, person.id, [service.id]);
    await c.schedules.setWeeklyHours({}, person.id, [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, startTime: "09:00", endTime: "17:00" })));
  }
  // Both callers must finish the real availability read before either attempts its database write.
  let reads = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const bookings = createBookingsService({ bookingsRepo: createBookingsRepository(db), settingsRepo: createSettingsRepository(db), availability: {
    ...c.availability,
    freeStaffAt: async input => { const result = await c.availability.freeStaffAt(input); if (++reads === 2) release(); await gate; return result; },
  } });
  const book = (staffId: string, time: string) => bookings.create(actor, { serviceId: service.id, staffId, start: at(`2026-10-19T${time}`), client }, { now });
  return { service, people, bookings, book };
}
function oneWinner(results: PromiseSettledResult<unknown>[]) {
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  const failure = results.find(result => result.status === "rejected") as PromiseRejectedResult;
  expect(failure.reason).toMatchObject({ code: "conflict" });
}
it("serialises adjacent bookings so the service buffer cannot be consumed twice", async () => {
  const { people, book } = await setup({ bufferAfterMin: 30 });
  oneWinner(await Promise.allSettled([book(people[0].id, "09:00"), book(people[0].id, "09:30")]));
});
it("enforces the staff daily maximum after two callers read the last available place", async () => {
  const { people, book } = await setup();
  await db.execute(sql`update business set staff_max_per_day = 1`);
  oneWinner(await Promise.allSettled([book(people[0].id, "09:00"), book(people[0].id, "11:00")]));
});
it("enforces the service daily maximum across different staff members", async () => {
  const { people, book } = await setup({ maxPerDay: 1 });
  oneWinner(await Promise.allSettled([book(people[0].id, "09:00"), book(people[1].id, "11:00")]));
});
it("serialises holds and bookings around the same required buffer", async () => {
  const { service, people, bookings, book } = await setup({ bufferAfterMin: 30 });
  oneWinner(await Promise.allSettled([
    book(people[0].id, "09:00"),
    bookings.hold(actor, { serviceId: service.id, staffId: people[0].id, start: at("2026-10-19T09:30") }, { now }),
  ]));
});
