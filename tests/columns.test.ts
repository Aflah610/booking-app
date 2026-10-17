import { beforeEach, describe, expect, it } from "vitest";
import { c, reset } from "./helpers";
import { checkColumns, columnChoices, columnPrefKey, DEFAULT_COLUMNS, resolveColumns } from "@/lib/booking-columns";
import { zonedToUtc } from "@/lib/time";

beforeEach(reset);

describe("choosing columns", () => {
  it("uses the standard columns when nothing is saved or the saved value is rubbish", () => {
    expect(resolveColumns(null, "bookings")).toEqual(DEFAULT_COLUMNS.bookings);
    expect(resolveColumns("nope", "today")).toEqual(DEFAULT_COLUMNS.today);
    expect(resolveColumns(["bogus"], "bookings")).toEqual(DEFAULT_COLUMNS.bookings);
    // A column that no longer exists (the old separate phone column) is quietly dropped from a saved choice.
    expect(resolveColumns(["time", "client", "phone"], "bookings")).toEqual(["time", "client"]);
  });

  it("keeps the order chosen, drops unknown and repeated columns, and always keeps Time", () => {
    expect(resolveColumns(["client", "price", "client", "bogus", "status"], "bookings")).toEqual(["time", "client", "price", "status"]);
    expect(resolveColumns(["email", "time", "booking_id"], "bookings")).toEqual(["email", "time", "booking_id"]);
  });

  it("refuses fewer than two columns when saving, counting Time", () => {
    expect(() => checkColumns([], "bookings")).toThrow("Select at least two fields");
    expect(() => checkColumns(["time"], "bookings")).toThrow("Select at least two fields");
    expect(() => checkColumns("x", "bookings")).toThrow();
    expect(checkColumns(["email"], "bookings")).toEqual(["time", "email"]);
  });

  it("lists shown columns first in their order, then the hidden ones, with Time locked", () => {
    const list = columnChoices(["status", "time", "client"]);
    expect(list.slice(0, 3).map((x) => x.id)).toEqual(["status", "time", "client"]);
    expect(list.slice(0, 3).every((x) => x.checked)).toBe(true);
    expect(list.slice(3).every((x) => !x.checked)).toBe(true);
    expect(list.find((x) => x.id === "time")).toMatchObject({ locked: true });
    expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
  });
});

describe("remembering the choice", () => {
  it("keeps each person's choice separate and per list, and can reset it", async () => {
    const a = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    const b = await c.staff.create({}, { name: "Ben", email: "ben@firm.test" });
    await c.preferences.set(a.id, columnPrefKey("bookings"), ["time", "email"]);
    expect(await c.preferences.get(a.id, columnPrefKey("bookings"))).toEqual(["time", "email"]);
    expect(await c.preferences.get(b.id, columnPrefKey("bookings"))).toBeNull();
    expect(await c.preferences.get(a.id, columnPrefKey("today"))).toBeNull();
    await c.preferences.set(a.id, columnPrefKey("bookings"), ["time", "client"]); // saving again replaces it
    expect(await c.preferences.get(a.id, columnPrefKey("bookings"))).toEqual(["time", "client"]);
    await c.preferences.reset(a.id, columnPrefKey("bookings"));
    expect(await c.preferences.get(a.id, columnPrefKey("bookings"))).toBeNull();
  });

  it("refuses a bad setting name or an unknown person", async () => {
    await expect(c.preferences.get("not-an-id", "columns.bookings")).rejects.toMatchObject({ code: "not_found" });
    const a = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await expect(c.preferences.set(a.id, "Bad Key!", 1)).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("what the columns show", () => {
  it("stores the price of each booking and the client's email", async () => {
    const svc = await c.catalog.create({}, { name: "Counselling", durationMin: 60, priceDisplay: "1000" });
    const dev = await c.staff.create({}, { name: "Dev", email: "dev@firm.test" });
    await c.staff.setServices({}, dev.id, [svc.id]);
    await c.staff.setServicePrices({}, dev.id, { [svc.id]: 150000 });
    await c.schedules.setWeeklyHours({}, dev.id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })));
    const now = zonedToUtc("2026-10-15T08:00", "Asia/Kolkata");
    const { booking } = await c.bookings.create({ mode: "staff" }, { serviceId: svc.id, staffId: dev.id, start: zonedToUtc("2026-10-19T10:00", "Asia/Kolkata"), client: { name: "Ravi", phone: "98765 43210", email: "ravi@example.com" } }, { now });
    expect(booking).toMatchObject({ pricePaise: 150000, clientEmail: "ravi@example.com" });
    // The price stays what it cost, even when credit or a payment later settles it.
    await c.packages.topUp({}, booking.clientId, { amountPaise: 150000 }, now);
    const paid = await c.bookings.useCredit({}, booking.id, { now });
    expect(paid).toMatchObject({ paymentStatus: "paid", amountPaise: null, pricePaise: 150000 });
    const moved = await c.bookings.reschedule({ mode: "staff" }, booking.id, { start: zonedToUtc("2026-10-20T10:00", "Asia/Kolkata"), staffId: dev.id }, { now });
    expect(moved.pricePaise).toBe(150000);
  });
});
