import { beforeEach, describe, expect, it } from "vitest";
import { db, reset } from "./helpers";
import { createContainer } from "@/features/container";
import type { OutgoingMessage } from "@/features/workflows/workflows.dto";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { addToCalendarLinks, bookingIcs } from "@/lib/ics";
import { zonedToUtc } from "@/lib/time";

const sent: OutgoingMessage[] = [];
const send = async (m: OutgoingMessage) => void sent.push(m) as never;
const c = createContainer(db, { manageSecret: "p".repeat(40), appUrl: "https://book.example.com", senders: { email: send, whatsapp: send, webhook: send } });
const at = (local: string) => zonedToUtc(local, "Asia/Kolkata");
const t0 = at("2026-10-15T08:00");
const desk: BookingActor = { mode: "staff" };
const client = { name: "Ravi Kumar", phone: "98765 43210", email: "ravi@example.com" };
const emails = () => sent.filter((m): m is Extract<OutgoingMessage, { channel: "email" }> => m.channel === "email");

beforeEach(async () => {
  await reset();
  sent.length = 0;
});

async function setup(attachInvite: boolean, body = "See you {{date}}") {
  const svc = await c.catalog.create({}, { name: "Consult", durationMin: 30, location: "Room 2" });
  const staff = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
  await c.staff.setServices({}, staff.id, [svc.id]);
  await c.schedules.setWeeklyHours({}, staff.id, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" })));
  for (const trigger of ["booked", "rescheduled", "cancelled"] as const) {
    await c.workflows.create({}, { name: trigger, trigger, action: { channel: "email", recipient: "client", subject: "Hi", body, attachInvite } });
  }
  return { svc, staff };
}
const book = (serviceId: string, start: string) => c.bookings.create(desk, { serviceId, start: at(start), client }, { now: t0 }).then((r) => r.booking);

describe("calendar invite file", () => {
  it("writes an invitation calendars can act on", () => {
    const ics = bookingIcs({
      uid: "u1", start: new Date("2026-10-19T04:30:00Z"), end: new Date("2026-10-19T05:00:00Z"), title: "Consult", method: "REQUEST", sequence: 2,
      organizer: { email: "bookings@firm.test" }, attendee: { name: "Ravi", email: "ravi@example.com" }, now: new Date("2026-10-15T00:00:00Z"),
    });
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain("ORGANIZER:mailto:bookings@firm.test\r\n");
    expect(ics.replace(/\r\n /g, "")).toContain('ATTENDEE;CN="Ravi";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:ravi@example.com\r\n');
    expect(ics).toContain("SEQUENCE:2\r\n");
    expect(ics).toContain("STATUS:CONFIRMED\r\n");
    expect(bookingIcs({ uid: "u1", start: new Date(0), end: new Date(1000), title: "x", method: "CANCEL" })).toContain("STATUS:CANCELLED\r\n");
  });

  it("builds add-to-calendar links with the time in UTC", () => {
    const l = addToCalendarLinks({ start: new Date("2026-10-19T04:30:00Z"), end: new Date("2026-10-19T05:00:00Z"), title: "Consult & more", location: "Room 2" });
    expect(l.google).toContain("dates=20261019T043000Z%2F20261019T050000Z");
    expect(l.google).toContain("text=Consult+%26+more");
    expect(l.outlook).toContain("startdt=2026-10-19T04%3A30%3A00.000Z");
  });
});

describe("invite attached to workflow emails", () => {
  it("is not attached unless the workflow asks for it", async () => {
    const { svc } = await setup(false);
    await book(svc.id, "2026-10-19T10:00");
    await c.workflows.processDue({ now: t0 });
    expect(emails()).toHaveLength(1);
    expect(emails()[0].invite).toBeUndefined();
  });

  it("attaches a REQUEST for a new booking, with the client as guest", async () => {
    const { svc } = await setup(true);
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.workflows.processDue({ now: t0 });
    expect(emails()[0].invite).toMatchObject({
      method: "REQUEST", uid: b.id, sequence: 0, title: "Consult with Asha", location: "Room 2",
      start: at("2026-10-19T10:00"), end: at("2026-10-19T10:30"), attendee: { name: "Ravi Kumar", email: "ravi@example.com" },
    });
  });

  it("keeps the same calendar entry when a booking is moved, with a higher sequence, and cancels that entry", async () => {
    const { svc, staff } = await setup(true);
    const first = await book(svc.id, "2026-10-19T10:00");
    await c.workflows.processDue({ now: t0 });
    const moved = await c.bookings.reschedule(desk, first.id, { start: at("2026-10-20T11:00"), staffId: staff.id }, { now: t0 });
    await c.workflows.processDue({ now: t0 });
    const again = await c.bookings.reschedule(desk, moved.id, { start: at("2026-10-21T11:00"), staffId: staff.id }, { now: t0 });
    await c.workflows.processDue({ now: t0 });
    expect(emails().map((m) => [m.invite!.uid, m.invite!.sequence])).toEqual([[first.id, 0], [first.id, 1], [first.id, 2]]);
    sent.length = 0;
    await c.bookings.cancel(desk, again.id, {}, { now: t0 });
    await c.workflows.processDue({ now: t0 });
    expect(emails()[0].invite).toMatchObject({ method: "CANCEL", uid: first.id, sequence: 3 });
  });

  it("fills the add-to-calendar links in the message", async () => {
    const { svc } = await setup(false, "G {{add_to_google}}\nO {{add_to_outlook}}\nF {{add_to_calendar}}");
    const b = await book(svc.id, "2026-10-19T10:00");
    await c.workflows.processDue({ now: t0 });
    const body = emails()[0].body;
    expect(body).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
    expect(body).toContain("https://outlook.live.com/calendar/0/deeplink/compose");
    expect(body).toContain(`https://book.example.com/manage/${b.id}/calendar.ics?t=`);
  });

  it("never attaches an invite to a message for staff", async () => {
    const { svc } = await setup(false);
    await c.workflows.create({}, { name: "staff", trigger: "booked", action: { channel: "email", recipient: "staff", subject: "New", body: "x", attachInvite: true } });
    await book(svc.id, "2026-10-19T10:00");
    await c.workflows.processDue({ now: t0 });
    expect(emails().find((m) => m.to === "asha@firm.test")?.invite).toBeUndefined();
  });
});
