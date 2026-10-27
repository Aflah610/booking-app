import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, reset } from "./helpers";
import { createContainer } from "@/features/container";
import type { CalendarBookingDTO } from "@/features/calendar/calendar.dto";
import type { CalendarProvider } from "@/features/calendar/provider";
import type { BookingActor } from "@/features/bookings/bookings.service";
import type { OutgoingMessage } from "@/features/workflows/workflows.dto";
import { zonedToUtc } from "@/lib/time";
import { GET as join } from "@/app/join/[id]/route";

const SECRET = "m".repeat(40);
const at = (local: string) => zonedToUtc(local, "Asia/Kolkata");
const t0 = at("2026-10-15T08:00");
const desk: BookingActor = { mode: "staff" };
const website: BookingActor = { mode: "client" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));
const sent: OutgoingMessage[] = [];
const send = async (m: OutgoingMessage) => void sent.push(m) as never;

function fakeGoogle() {
  const events = new Map<string, CalendarBookingDTO>();
  const state = { notReady: false, next: 0, calls: [] as string[], meetFlags: [] as { want: boolean; hasLink: boolean; remove: boolean }[], guests: [] as (string | null)[] };
  const provider: CalendarProvider = {
    id: "google",
    configured: () => true,
    authUrl: (state) => `https://accounts.example/auth?state=${state}`,
    exchangeCode: async () => ({ refreshToken: "r", accessToken: "a", accessExpiresAt: t0.getTime() + 3600_000, accountEmail: "asha@gmail.test" }),
    refresh: async () => ({ accessToken: "a2", accessExpiresAt: t0.getTime() + 7 * 3600_000 }),
    revoke: async () => undefined,
    listBusy: async () => [],
    upsertEvent: async (_t, _c, id, b, _invite, meet, guest) => {
      const eventId = id ?? `evt_${++state.next}`;
      state.calls.push(`${id ? "update" : "create"}:${eventId}`);
      state.meetFlags.push(meet);
      state.guests.push(guest?.email ?? null);
      events.set(eventId, b);
      const meetUrl = meet.want && !state.notReady ? `https://meet.google.com/${eventId}` : meet.hasLink && !meet.remove ? b.meetingUrl : null;
      return { eventId, meetUrl };
    },
    deleteEvent: async (_t, _c, id) => {
      state.calls.push(`delete:${id}`);
      events.delete(id);
    },
  };
  return { provider, events, state };
}

let google = fakeGoogle();
let c = createContainer(db, { manageSecret: SECRET, appUrl: "https://book.example.com", calendarProvider: google.provider, senders: { email: send, whatsapp: send, webhook: send } });

async function firm(meetEnabled: boolean) {
  await c.settings.update({}, { ...(await c.settings.get()), meetEnabled });
}

async function setup(opts: { meeting?: "in_person" | "google_meet"; connect?: boolean } = {}) {
  const svc = await c.catalog.create({}, { name: "Counselling", durationMin: 60, meetingType: opts.meeting ?? "google_meet" });
  const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
  const dev = await c.staff.create({}, { name: "Dev", email: "dev@firm.test" });
  for (const s of [asha, dev]) {
    await c.staff.setServices({}, s.id, [svc.id]);
    await c.schedules.setWeeklyHours({}, s.id, everyDay);
    if (opts.connect !== false) await c.calendar.completeConnect("x", (await connectState(s.id)), t0);
  }
  return { svc, asha, dev };
}
const connectState = async (staffId: string) => new URL(c.calendar.connectUrl(staffId, t0)).searchParams.get("state") ?? "";
const book = (serviceId: string, staffId: string, start: string, actor: BookingActor = desk) =>
  c.bookings.create(actor, { serviceId, staffId, start: at(start), client: { name: "Ravi", phone: "98765 43210", email: "ravi@example.com" } }, { now: t0, idempotencyKey: actor.mode === "client" ? `k-${Math.random().toString(36).slice(2)}-1234` : undefined }).then((r) => r);
const sync = () => c.calendar.processDue(t0);

beforeEach(async () => {
  await reset();
  sent.length = 0;
  google = fakeGoogle();
  c = createContainer(db, { manageSecret: SECRET, appUrl: "https://book.example.com", calendarProvider: google.provider, senders: { email: send, whatsapp: send, webhook: send } });
});
afterEach(() => firm(false));

describe("making the Meet link", () => {
  it("makes one for an online service when the firm and the therapist both have it on, and keeps it on the booking", async () => {
    await firm(true);
    const { svc, asha } = await setup();
    const { booking } = await book(svc.id, asha.id, "2026-10-19T10:00");
    expect(booking.meetingUrl).toBeNull();
    await sync();
    const after = await c.bookings.get(booking.id);
    expect(after).toMatchObject({ meetingUrl: "https://meet.google.com/evt_1", meetingSource: "google" });
    expect(google.state.meetFlags[0]).toEqual({ want: true, hasLink: false, remove: false });
  });

  it("makes none when the firm switch is off, the service is in person, or the therapist turned it off", async () => {
    const { svc, asha } = await setup();
    const off = await book(svc.id, asha.id, "2026-10-19T10:00"); // firm switch off
    await sync();
    expect((await c.bookings.get(off.booking.id)).meetingUrl).toBeNull();

    await firm(true);
    const person = await c.catalog.create({}, { name: "Clinic visit", durationMin: 60, meetingType: "in_person" });
    await c.staff.setServices({}, asha.id, [svc.id, person.id]);
    const inPerson = await book(person.id, asha.id, "2026-10-20T10:00");
    await sync();
    expect((await c.bookings.get(inPerson.booking.id)).meetingUrl).toBeNull();

    await c.calendar.setOptions(asha.id, { pushBookings: true, blockBusy: true, inviteClients: false, createMeetLinks: false });
    const noLinks = await book(svc.id, asha.id, "2026-10-21T10:00");
    await sync();
    expect((await c.bookings.get(noLinks.booking.id)).meetingUrl).toBeNull();
  });

  it("makes none when the therapist has not connected Google Calendar, and the booking still works", async () => {
    await firm(true);
    const { svc, asha } = await setup({ connect: false });
    const { booking } = await book(svc.id, asha.id, "2026-10-19T10:00");
    await sync();
    expect(booking.status).toBe("upcoming");
    expect((await c.bookings.get(booking.id)).meetingUrl).toBeNull();
  });

  it("waits and retries when Google has not made the link yet, without creating a second event", async () => {
    await firm(true);
    const { svc, asha } = await setup();
    const { booking } = await book(svc.id, asha.id, "2026-10-19T10:00");
    google.state.notReady = true;
    await sync();
    expect((await c.bookings.get(booking.id)).meetingUrl).toBeNull();
    google.state.notReady = false;
    await c.calendar.processDue(new Date(t0.getTime() + 3 * 60_000));
    expect((await c.bookings.get(booking.id)).meetingUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(google.state.calls.filter((x) => x.startsWith("create"))).toHaveLength(1);
  });
});

describe("staff control of one booking", () => {
  it("can make an in-person booking online, and take the link away again", async () => {
    await firm(true);
    const { asha } = await setup();
    const person = await c.catalog.create({}, { name: "Clinic visit", durationMin: 60, meetingType: "in_person" });
    await c.staff.setServices({}, asha.id, [person.id]);
    const { booking } = await book(person.id, asha.id, "2026-10-19T10:00");
    await sync();
    await c.bookings.setMeeting({}, booking.id, { action: "add" }, { now: t0 });
    await sync();
    expect((await c.bookings.get(booking.id)).meetingUrl).toMatch(/meet\.google\.com/);
    await c.bookings.setMeeting({}, booking.id, { action: "remove" }, { now: t0 });
    await sync();
    expect(await c.bookings.get(booking.id)).toMatchObject({ meetingUrl: null, meetingSource: null, meetingOverride: "off" });
    expect(google.state.meetFlags.at(-1)).toMatchObject({ remove: true });
  });

  it("keeps a pasted link and never replaces it with a Google one, until asked to", async () => {
    await firm(true);
    const { svc, asha } = await setup();
    const { booking } = await book(svc.id, asha.id, "2026-10-19T10:00");
    await c.bookings.setMeeting({}, booking.id, { action: "manual", url: "https://zoom.us/j/123" }, { now: t0 });
    await sync();
    expect(await c.bookings.get(booking.id)).toMatchObject({ meetingUrl: "https://zoom.us/j/123", meetingSource: "manual" });
    expect(google.state.meetFlags[0]).toMatchObject({ want: false });
    await c.bookings.setMeeting({}, booking.id, { action: "add" }, { now: t0 });
    await sync();
    expect((await c.bookings.get(booking.id)).meetingUrl).toMatch(/meet\.google\.com/);
  });

  it("refuses a pasted link that is not a web address", async () => {
    const { svc, asha } = await setup();
    const { booking } = await book(svc.id, asha.id, "2026-10-19T10:00");
    await expect(c.bookings.setMeeting({}, booking.id, { action: "manual", url: "javascript:alert(1)" }, { now: t0 })).rejects.toMatchObject({ code: "invalid" });
    await expect(c.bookings.setMeeting({}, booking.id, { action: "manual", url: "not a link" }, { now: t0 })).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("moving and cancelling", () => {
  it("keeps the same Meet link when the booking moves to another time with the same therapist", async () => {
    await firm(true);
    const { svc, asha } = await setup();
    const { booking } = await book(svc.id, asha.id, "2026-10-19T10:00");
    await sync();
    const link = (await c.bookings.get(booking.id)).meetingUrl;
    const moved = await c.bookings.reschedule(desk, booking.id, { start: at("2026-10-20T11:00"), staffId: asha.id }, { now: t0 });
    await sync();
    expect((await c.bookings.get(moved.id)).meetingUrl).toBe(link);
    expect(google.state.calls).toEqual(["create:evt_1", "update:evt_1"]); // moved in place, nothing deleted
  });

  it("makes a new event and link when the booking moves to another therapist, and removes the old event", async () => {
    await firm(true);
    const { svc, asha, dev } = await setup();
    const { booking } = await book(svc.id, asha.id, "2026-10-19T10:00");
    await sync();
    const moved = await c.bookings.reschedule(desk, booking.id, { start: at("2026-10-19T10:00"), staffId: dev.id }, { now: t0 });
    await sync();
    expect((await c.bookings.get(moved.id)).meetingUrl).toBe("https://meet.google.com/evt_2");
    expect(google.state.calls).toContain("delete:evt_1");
  });

  it("removes the event when a booking is cancelled", async () => {
    await firm(true);
    const { svc, asha } = await setup();
    const { booking } = await book(svc.id, asha.id, "2026-10-19T10:00");
    await sync();
    await c.bookings.cancel(desk, booking.id, {}, { now: t0 });
    await sync();
    expect(google.events.size).toBe(0);
  });
});

describe("the firm calendar for therapists without their own", () => {
  async function office() {
    const admin = await c.staff.create({}, { name: "Office", email: "office@firm.test", accessRole: "admin" });
    await c.calendar.completeConnect("x", await connectState(admin.id), t0);
    return admin;
  }

  it("makes the event and link in the chosen calendar, with the therapist as a guest, and catches up earlier bookings", async () => {
    await firm(true);
    const { svc, asha } = await setup({ connect: false });
    const earlier = await book(svc.id, asha.id, "2026-10-19T10:00");
    await sync();
    expect((await c.bookings.get(earlier.booking.id)).meetingUrl).toBeNull();
    const admin = await office();
    await c.calendar.setMeetCalendar(admin.id, t0);
    const later = await book(svc.id, asha.id, "2026-10-20T10:00");
    await sync();
    expect((await c.bookings.get(earlier.booking.id)).meetingUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    expect((await c.bookings.get(later.booking.id)).meetingUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(google.state.guests).toEqual(["asha@firm.test", "asha@firm.test"]);
  });

  it("leaves a therapist with their own calendar to it, and keeps an event where it was made after they connect", async () => {
    await firm(true);
    const { svc, asha, dev } = await setup({ connect: false });
    await c.calendar.completeConnect("x", await connectState(dev.id), t0);
    const admin = await office();
    await c.calendar.setMeetCalendar(admin.id, t0);
    const own = await book(svc.id, dev.id, "2026-10-19T11:00");
    const covered = await book(svc.id, asha.id, "2026-10-19T10:00");
    await sync();
    expect([...google.state.guests].sort()).toEqual(["asha@firm.test", null]);
    const link = (await c.bookings.get(covered.booking.id)).meetingUrl;
    // Asha connects later and the session moves: it stays in the firm calendar, so the client's link doesn't change.
    await c.calendar.completeConnect("x", await connectState(asha.id), t0);
    const moved = await c.bookings.reschedule(desk, covered.booking.id, { start: at("2026-10-21T10:00"), staffId: asha.id }, { now: t0 });
    await sync();
    expect((await c.bookings.get(moved.id)).meetingUrl).toBe(link);
    expect(google.state.guests.at(-1)).toBe("asha@firm.test");
    await c.bookings.cancel(desk, moved.id, {}, { now: t0 });
    await sync();
    expect(google.state.calls.filter((x) => x.startsWith("delete"))).toHaveLength(1);
    expect(own.booking.id).toBeTruthy();
  });

  it("only takes a connected calendar, and switches off when that calendar is disconnected", async () => {
    const { asha } = await setup({ connect: false });
    await expect(c.calendar.setMeetCalendar(asha.id, t0)).rejects.toMatchObject({ code: "invalid" });
    const admin = await office();
    await c.calendar.setMeetCalendar(admin.id, t0);
    expect((await c.calendar.meetCalendar()).staffId).toBe(admin.id);
    await c.calendar.disconnect(admin.id);
    expect((await c.calendar.meetCalendar()).staffId).toBeNull();
  });
});

describe("telling the client", () => {
  const confirm = async () =>
    c.workflows.create({}, { name: "Confirm", trigger: "booked", action: { channel: "email", recipient: "client", subject: "ok", body: "Join: {{meeting_link}}", attachInvite: true } });

  it("gives a join link at once, before Google has made the Meet link, and it is in the calendar invite", async () => {
    await firm(true);
    const { svc, asha } = await setup();
    await confirm();
    const { booking } = await book(svc.id, asha.id, "2026-10-19T10:00");
    await c.workflows.processDue({ now: t0 });
    const mail = sent.find((m) => m.channel === "email")!;
    expect(mail.channel === "email" && mail.body).toMatch(new RegExp(`^Join: https://book\\.example\\.com/join/${booking.id}\\?t=`));
    expect(mail.channel === "email" && mail.invite?.url).toContain(`/join/${booking.id}?t=`);
  });

  it("leaves the link out for an in-person session", async () => {
    await firm(true);
    const { asha } = await setup();
    const person = await c.catalog.create({}, { name: "Clinic visit", durationMin: 60, meetingType: "in_person" });
    await c.staff.setServices({}, asha.id, [person.id]);
    await confirm();
    await book(person.id, asha.id, "2026-10-19T10:00");
    await c.workflows.processDue({ now: t0 });
    const mail = sent.find((m) => m.channel === "email")!;
    expect(mail.channel === "email" && mail.body).toBe("Join: ");
    expect(mail.channel === "email" && mail.invite?.url).toBeNull();
  });
});

describe("the join link", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const open = (id: string, token: string) => join(new Request(`http://localhost/join/${id}?t=${encodeURIComponent(token)}`), ctx(id));

  it("sends the client to the video call, says when it is still being prepared, and refuses a bad token", async () => {
    await firm(true);
    const { svc, asha } = await setup();
    const made = await book(svc.id, asha.id, "2026-10-19T10:00", website);
    const token = made.manageToken!;
    const waiting = await open(made.booking.id, token);
    expect(waiting.status).toBe(200);
    expect(await waiting.text()).toContain("being prepared");
    await sync();
    const ready = await open(made.booking.id, token);
    expect(ready.status).toBe(302);
    expect(ready.headers.get("location")).toBe((await c.bookings.get(made.booking.id)).meetingUrl);
    expect((await open(made.booking.id, "wrong")).status).toBe(404);
    await c.bookings.cancel(website, made.booking.id, {}, { now: t0 });
    expect(await (await open(made.booking.id, token)).text()).toContain("cancelled");
  });
});

describe("making the link right after booking, without a scheduler", () => {
  it("queues follow-up work for every booking change, and running it writes the event and sends the message", async () => {
    const tasks: (() => Promise<unknown>)[] = [];
    const quick = createContainer(db, {
      manageSecret: SECRET,
      appUrl: "https://book.example.com",
      calendarProvider: google.provider,
      senders: { email: send, whatsapp: send, webhook: send },
      defer: (task) => void tasks.push(task),
    });
    await quick.settings.update({}, { ...(await quick.settings.get()), meetEnabled: true });
    const svc = await quick.catalog.create({}, { name: "Counselling", durationMin: 60, meetingType: "google_meet" });
    const asha = await quick.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await quick.staff.setServices({}, asha.id, [svc.id]);
    await quick.schedules.setWeeklyHours({}, asha.id, everyDay);
    await quick.calendar.completeConnect("x", new URL(quick.calendar.connectUrl(asha.id, t0)).searchParams.get("state")!, t0);
    await quick.workflows.create({}, { name: "Confirm", trigger: "booked", action: { channel: "email", recipient: "client", subject: "ok", body: "Join: {{meeting_link}}" } });

    const { booking } = await quick.bookings.create(desk, { serviceId: svc.id, staffId: asha.id, start: zonedToUtc(`${new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)}T10:00`, "Asia/Kolkata"), client: { name: "Ravi", phone: "98765 43210", email: "ravi@example.com" } });
    expect(tasks).toHaveLength(1); // one follow-up queued by the booking
    expect((await quick.bookings.get(booking.id)).meetingUrl).toBeNull(); // not yet: it runs after the response
    for (const task of tasks) await task();
    expect((await quick.bookings.get(booking.id)).meetingUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(sent.some((m) => m.channel === "email" && m.body.startsWith("Join: https://book.example.com/join/"))).toBe(true);
  });
});
