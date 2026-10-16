import { beforeEach, describe, expect, it } from "vitest";
import { db, reset } from "./helpers";
import { createContainer } from "@/features/container";
import type { CalendarBookingDTO, ExternalBusy } from "@/features/calendar/calendar.dto";
import { decrypt, encrypt, readState, signState } from "@/features/calendar/crypto";
import { ProviderAuthError, type CalendarProvider } from "@/features/calendar/provider";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { zonedToUtc } from "@/lib/time";

const SECRET = "c".repeat(40);
const IST = "Asia/Kolkata";
const at = (local: string) => zonedToUtc(local, IST);
const t0 = at("2026-10-15T08:00");
const plus = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
const desk: BookingActor = { mode: "staff" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));

/** Stands in for Google: remembers what was written and returns whatever busy times the test sets. */
function fakeGoogle() {
  const events = new Map<string, CalendarBookingDTO>();
  const state = { busy: [] as ExternalBusy[], down: false, revoked: false, next: 0, calls: [] as string[], refreshes: 0 };
  const provider: CalendarProvider = {
    id: "google",
    configured: () => true,
    authUrl: (s, redirect) => `https://accounts.example/auth?state=${s}&redirect_uri=${encodeURIComponent(redirect)}`,
    exchangeCode: async (code) => {
      if (code !== "good") throw new Error("bad code");
      return { refreshToken: "refresh-1", accessToken: "access-1", accessExpiresAt: t0.getTime() + 3600_000, accountEmail: "asha@gmail.test" };
    },
    refresh: async () => {
      state.refreshes++;
      return { accessToken: "access-2", accessExpiresAt: t0.getTime() + 7 * 3600_000 };
    },
    revoke: async () => void (state.revoked = true),
    listBusy: async () => {
      if (state.down) throw new Error("Google is down");
      return state.busy;
    },
    upsertEvent: async (_t, _c, id, b) => {
      if (state.down) throw new Error("Google is down");
      if (state.revoked) throw new ProviderAuthError("revoked");
      const eventId = id ?? `evt_${++state.next}`;
      state.calls.push(`${id ? "update" : "create"}:${eventId}`);
      events.set(eventId, b);
      return eventId;
    },
    deleteEvent: async (_t, _c, id) => {
      if (state.down) throw new Error("Google is down");
      state.calls.push(`delete:${id}`);
      events.delete(id);
    },
  };
  return { provider, events, state };
}

let google = fakeGoogle();
let c = createContainer(db, { manageSecret: SECRET, appUrl: "https://book.example.com", calendarProvider: google.provider });

async function setup() {
  const svc = await c.catalog.create({}, { name: "Consult", durationMin: 30, location: "Room 2" });
  const staff = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
  await c.staff.setServices({}, staff.id, [svc.id]);
  await c.schedules.setWeeklyHours({}, staff.id, everyDay);
  return { svc, staff };
}
const connect = async (staffId: string, now = t0) => {
  const url = new URL(c.calendar.connectUrl(staffId, now));
  return c.calendar.completeConnect("good", url.searchParams.get("state")!, now);
};
const book = (serviceId: string, start: string, now = t0) =>
  c.bookings.create(desk, { serviceId, start: at(start), client: { name: "Ravi", phone: "98765 43210", email: "ravi@example.com" } }, { now }).then((r) => r.booking);
const slots = async (serviceId: string, day: string) =>
  (await c.availability.slots({ serviceId, from: at(`${day}T00:00`), to: at(`${day}T23:59`) }, { now: t0, mode: "client" })).slots.map((s) => s.start.toISOString());

beforeEach(async () => {
  await reset();
  google = fakeGoogle();
  c = createContainer(db, { manageSecret: SECRET, appUrl: "https://book.example.com", calendarProvider: google.provider });
});

describe("token storage and connect link", () => {
  it("encrypts tokens so the stored text reveals nothing, and only the right key reads it", () => {
    const stored = encrypt("super-secret-refresh-token", SECRET);
    expect(stored).not.toContain("super-secret");
    expect(decrypt(stored, SECRET)).toBe("super-secret-refresh-token");
    expect(() => decrypt(stored, "d".repeat(40))).toThrow();
  });

  it("accepts a state only for the person, before it expires, and unaltered", () => {
    const state = signState("staff-1", SECRET, t0);
    expect(readState(state, SECRET, plus(t0, 5))).toBe("staff-1");
    expect(readState(state, SECRET, plus(t0, 11))).toBeNull();
    expect(readState(state.replace("staff-1", "staff-2"), SECRET, t0)).toBeNull();
    expect(readState(state, "d".repeat(40), t0)).toBeNull();
  });
});

describe("connecting", () => {
  it("stores the connection encrypted and reports status without secrets", async () => {
    const { staff } = await setup();
    expect((await c.calendar.status(staff.id)).connection).toBeNull();
    await connect(staff.id);
    const status = await c.calendar.status(staff.id);
    expect(status.connection).toMatchObject({ accountEmail: "asha@gmail.test", pushBookings: true, blockBusy: true, errorCount: 0 });
    expect(JSON.stringify(status)).not.toContain("refresh-1");
  });

  it("refuses a tampered or expired link and a code Google rejects", async () => {
    const { staff } = await setup();
    await expect(c.calendar.completeConnect("good", "nonsense")).rejects.toMatchObject({ code: "invalid" });
    const state = signState(staff.id, SECRET, t0);
    await expect(c.calendar.completeConnect("good", state, plus(t0, 30))).rejects.toMatchObject({ code: "invalid" });
    await expect(c.calendar.completeConnect("wrong", state, t0)).rejects.toMatchObject({ code: "invalid" });
  });

  it("puts bookings made before connecting into the calendar", async () => {
    const { svc, staff } = await setup();
    const b = await book(svc.id, "2026-10-19T10:00");
    await connect(staff.id);
    await c.calendar.processDue(t0);
    expect([...google.events.values()].map((e) => e.id)).toEqual([b.id]);
  });

  it("disconnects, revokes at Google and clears the copied busy times", async () => {
    const { svc, staff } = await setup();
    await connect(staff.id);
    google.state.busy = [{ externalId: "e1", start: at("2026-10-19T10:00"), end: at("2026-10-19T11:00") }];
    await c.calendar.syncBusy(plus(t0, 10));
    expect(await slots(svc.id, "2026-10-19")).not.toContain(at("2026-10-19T10:00").toISOString());
    await c.calendar.disconnect(staff.id);
    expect(google.state.revoked).toBe(true);
    expect((await c.calendar.status(staff.id)).connection).toBeNull();
    expect(await slots(svc.id, "2026-10-19")).toContain(at("2026-10-19T10:00").toISOString());
  });
});

describe("writing bookings to the calendar", () => {
  it("creates an event with client and service details, then updates it instead of duplicating", async () => {
    const { svc, staff } = await setup();
    await connect(staff.id);
    await c.calendar.processDue(t0);
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.calendar.processDue(t0);
    expect(google.state.calls).toEqual(["create:evt_1"]);
    expect(google.events.get("evt_1")).toMatchObject({ serviceName: "Consult", clientName: "Ravi", location: "Room 2", timezone: IST });
    await c.bookings.updateNotes({}, b.id, "bring papers");
    await c.calendar.onBookingEvent({ type: "booked", bookingId: b.id, at: t0 });
    await c.calendar.processDue(t0);
    expect(google.state.calls).toEqual(["create:evt_1", "update:evt_1"]);
  });

  it("moves a rescheduled booking: removes the old event, adds the new", async () => {
    const { svc, staff } = await setup();
    await connect(staff.id);
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.calendar.processDue(t0);
    const moved = await c.bookings.reschedule(desk, b.id, { start: at("2026-10-20T11:00"), staffId: staff.id }, { now: t0 });
    await c.calendar.processDue(t0);
    expect([...google.events.values()].map((e) => e.id)).toEqual([moved.id]);
  });

  it("removes the event when a booking is cancelled", async () => {
    const { svc, staff } = await setup();
    await connect(staff.id);
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.calendar.processDue(t0);
    await c.bookings.cancel(desk, b.id, {}, { now: t0 });
    await c.calendar.processDue(t0);
    expect(google.events.size).toBe(0);
  });

  it("does nothing for staff who have not connected, or who turned writing off", async () => {
    const { svc, staff } = await setup();
    await book(svc.id, "2026-10-19T10:00");
    await c.calendar.processDue(t0);
    expect(google.events.size).toBe(0);
    await connect(staff.id);
    await c.calendar.setOptions(staff.id, { pushBookings: false, blockBusy: true });
    await c.calendar.processDue(t0);
    expect(google.events.size).toBe(0);
    await c.calendar.setOptions(staff.id, { pushBookings: true, blockBusy: true }, t0);
    await c.calendar.processDue(t0);
    expect(google.events.size).toBe(1); // turning it back on catches up
  });

  it("keeps the booking when Google is down and retries later with a growing delay", async () => {
    const { svc, staff } = await setup();
    await connect(staff.id);
    await c.calendar.processDue(t0);
    const b = await book(svc.id, "2026-10-19T10:00");
    google.state.down = true;
    await c.calendar.processDue(t0);
    expect(google.events.size).toBe(0);
    expect((await c.bookings.get(b.id)).status).toBe("upcoming");
    expect(await c.calendar.processDue(plus(t0, 1))).toBe(0); // not due yet: first retry waits 2 minutes
    google.state.down = false;
    expect(await c.calendar.processDue(plus(t0, 3))).toBe(1);
    expect(google.events.size).toBe(1);
  });

  it("stops and flags the connection when Google says access was revoked", async () => {
    const { svc, staff } = await setup();
    await connect(staff.id);
    google.state.revoked = true;
    await book(svc.id, "2026-10-19T10:00");
    await c.calendar.processDue(t0);
    const { connection } = await c.calendar.status(staff.id);
    expect(connection).toMatchObject({ errorCount: 99, lastError: "revoked" });
    expect(await c.calendar.syncBusy(plus(t0, 30))).toBe(0); // parked until the person reconnects
  });

  it("refreshes an expired access token and stores the new one", async () => {
    const { svc, staff } = await setup();
    await connect(staff.id);
    await book(svc.id, "2026-10-19T10:00");
    await c.calendar.processDue(plus(t0, 120)); // two hours on: the one-hour token has expired
    expect(google.state.refreshes).toBe(1);
    expect(google.events.size).toBe(1);
  });
});

describe("blocking busy times", () => {
  it("hides slots that clash with events in the calendar and shows them again when the event goes", async () => {
    const { svc, staff } = await setup();
    await connect(staff.id);
    google.state.busy = [{ externalId: "e1", start: at("2026-10-19T10:00"), end: at("2026-10-19T11:00") }];
    expect(await c.calendar.syncBusy(plus(t0, 10))).toBe(1);
    const blocked = await slots(svc.id, "2026-10-19");
    expect(blocked).not.toContain(at("2026-10-19T10:00").toISOString());
    expect(blocked).not.toContain(at("2026-10-19T10:30").toISOString());
    expect(blocked).toContain(at("2026-10-19T11:00").toISOString());
    google.state.busy = [];
    await c.calendar.syncBusy(plus(t0, 20));
    expect(await slots(svc.id, "2026-10-19")).toContain(at("2026-10-19T10:00").toISOString());
  });

  it("refreshes only when the copy is older than five minutes", async () => {
    const { staff } = await setup();
    await connect(staff.id);
    expect(await c.calendar.syncBusy(plus(t0, 1))).toBe(1);
    expect(await c.calendar.syncBusy(plus(t0, 3))).toBe(0);
    expect(await c.calendar.syncBusy(plus(t0, 7))).toBe(1);
  });

  it("stops blocking when the option is switched off", async () => {
    const { svc, staff } = await setup();
    await connect(staff.id);
    google.state.busy = [{ externalId: "e1", start: at("2026-10-19T10:00"), end: at("2026-10-19T11:00") }];
    await c.calendar.syncBusy(plus(t0, 10));
    await c.calendar.setOptions(staff.id, { pushBookings: true, blockBusy: false });
    expect(await slots(svc.id, "2026-10-19")).toContain(at("2026-10-19T10:00").toISOString());
  });

  it("keeps the old copy when a refresh fails, and records why", async () => {
    const { svc, staff } = await setup();
    await connect(staff.id);
    google.state.busy = [{ externalId: "e1", start: at("2026-10-19T10:00"), end: at("2026-10-19T11:00") }];
    await c.calendar.syncBusy(plus(t0, 10));
    google.state.down = true;
    await c.calendar.syncBusy(plus(t0, 20));
    expect(await slots(svc.id, "2026-10-19")).not.toContain(at("2026-10-19T10:00").toISOString());
    expect((await c.calendar.status(staff.id)).connection).toMatchObject({ errorCount: 1, lastError: "Google is down" });
  });

  it("refuses to book over a Google event even if a stale slot list was shown", async () => {
    const { svc, staff } = await setup();
    await connect(staff.id);
    google.state.busy = [{ externalId: "e1", start: at("2026-10-19T10:00"), end: at("2026-10-19T11:00") }];
    await c.calendar.syncBusy(plus(t0, 10));
    await expect(book(svc.id, "2026-10-19T10:00", plus(t0, 10))).rejects.toMatchObject({ code: "conflict" });
  });
});
