import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { c, db, reset } from "./helpers";
import { createContainer } from "@/features/container";
import { checkAnswers, formatQuestions, parseQuestions } from "@/features/catalog/questions";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { zonedToUtc } from "@/lib/time";

beforeEach(reset);

const IST = "Asia/Kolkata";
const at = (local: string) => zonedToUtc(local, IST);
const now = at("2026-10-15T08:00");
const desk: BookingActor = { mode: "staff" };
const website: BookingActor = { mode: "client" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));
const ravi = { name: "Ravi Kumar", phone: "98765 43210" };

async function setup(extra: Record<string, unknown> = {}) {
  const svc = await c.catalog.create({}, { name: "Consult", durationMin: 30, ...extra });
  const staff = await c.staff.create({}, { name: "Asha", email: "asha@firm.test" });
  await c.staff.setServices({}, staff.id, [svc.id]);
  await c.schedules.setWeeklyHours({}, staff.id, everyDay);
  return { svc, staff };
}

const starts = async (serviceId: string, day: string, mode: "client" | "staff" = "client") => {
  const { slots } = await c.availability.slots({ serviceId, from: at(`${day}T00:00`), to: at(`${day}T23:59`) }, { now, mode });
  return slots.map((s) => s.start.toISOString());
};

describe("holidays", () => {
  it("close every staff member for that date, even where extra hours were added", async () => {
    const { svc, staff } = await setup();
    await c.schedules.setDateOverride({}, staff.id, { date: "2026-10-20", ranges: [{ startTime: "10:00", endTime: "12:00" }] });
    expect((await starts(svc.id, "2026-10-20")).length).toBeGreaterThan(0);
    await c.holidays.add({}, { date: "2026-10-20", name: "Diwali" });
    expect(await starts(svc.id, "2026-10-20")).toEqual([]);
    expect((await starts(svc.id, "2026-10-21")).length).toBeGreaterThan(0);
  });

  it("refuses a duplicate date and can be removed", async () => {
    const { svc } = await setup();
    const h = await c.holidays.add({}, { date: "2026-10-20", name: "Diwali" });
    await expect(c.holidays.add({}, { date: "2026-10-20", name: "Again" })).rejects.toMatchObject({ code: "conflict" });
    await c.holidays.remove({}, h.id);
    expect((await starts(svc.id, "2026-10-20")).length).toBeGreaterThan(0);
    await expect(c.holidays.remove({}, h.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("validates the date", async () => {
    await expect(c.holidays.add({}, { date: "20-10-2026", name: "x" })).rejects.toThrow();
  });
});

describe("daily booking limit", () => {
  it("offers no more times once the day is full, at list time and at booking time", async () => {
    const { svc } = await setup({ maxPerDay: 2 });
    await c.bookings.create(desk, { serviceId: svc.id, start: at("2026-10-19T10:00"), client: ravi }, { now });
    expect((await starts(svc.id, "2026-10-19")).length).toBeGreaterThan(0);
    await c.bookings.create(desk, { serviceId: svc.id, start: at("2026-10-19T11:00"), client: { ...ravi, phone: "98765 11111" } }, { now });
    expect(await starts(svc.id, "2026-10-19")).toEqual([]);
    expect((await starts(svc.id, "2026-10-20")).length).toBeGreaterThan(0);
    await expect(c.bookings.create(desk, { serviceId: svc.id, start: at("2026-10-19T15:00"), client: { ...ravi, phone: "98765 22222" } }, { now })).rejects.toMatchObject({ code: "conflict" });
  });

  it("frees a place when a booking is cancelled", async () => {
    const { svc } = await setup({ maxPerDay: 1 });
    const { booking } = await c.bookings.create(desk, { serviceId: svc.id, start: at("2026-10-19T10:00"), client: ravi }, { now });
    expect(await starts(svc.id, "2026-10-19")).toEqual([]);
    await c.bookings.cancel(desk, booking.id, {}, { now });
    expect((await starts(svc.id, "2026-10-19")).length).toBeGreaterThan(0);
  });
});

describe("daily limit per person", () => {
  it("closes a person's day once they have the firm's limit of sessions, across services, while others stay open", async () => {
    const { svc, staff } = await setup();
    const couple = await c.catalog.create({}, { name: "Couple", durationMin: 30 });
    const dev = await c.staff.create({}, { name: "Dev", email: "dev@firm.test" });
    await c.staff.setServices({}, staff.id, [svc.id, couple.id]);
    await c.staff.setServices({}, dev.id, [svc.id]);
    await c.schedules.setWeeklyHours({}, dev.id, everyDay);
    await db.execute(sql`update business set staff_max_per_day = 2`);

    await c.bookings.create(desk, { serviceId: svc.id, staffId: staff.id, start: at("2026-10-19T10:00"), client: ravi }, { now });
    await c.bookings.create(desk, { serviceId: couple.id, staffId: staff.id, start: at("2026-10-19T12:00"), client: { ...ravi, phone: "98765 11111" } }, { now });
    const asha = async (serviceId: string, day: string) =>
      (await c.availability.slots({ serviceId, staffId: staff.id, from: at(`${day}T00:00`), to: at(`${day}T23:59`) }, { now })).slots;
    expect(await asha(svc.id, "2026-10-19")).toEqual([]);
    expect(await asha(couple.id, "2026-10-19")).toEqual([]);
    expect((await asha(svc.id, "2026-10-20")).length).toBeGreaterThan(0);
    expect((await starts(svc.id, "2026-10-19")).length).toBeGreaterThan(0); // Dev is still free
    await expect(c.bookings.create(desk, { serviceId: svc.id, staffId: staff.id, start: at("2026-10-19T15:00"), client: { ...ravi, phone: "98765 22222" } }, { now }))
      .rejects.toMatchObject({ code: "conflict" });
  });

  it("keeps a 30-minute gap after each session when the service has one", async () => {
    const { svc } = await setup({ durationMin: 60, bufferAfterMin: 30 });
    await c.bookings.create(desk, { serviceId: svc.id, start: at("2026-10-19T10:00"), client: ravi }, { now });
    const free = await starts(svc.id, "2026-10-19");
    expect(free).not.toContain(at("2026-10-19T11:00").toISOString());
    expect(free).toContain(at("2026-10-19T11:30").toISOString());
    expect(free).not.toContain(at("2026-10-19T09:00").toISOString()); // its own gap would run into the 10:00 session
  });
});

describe("booking questions", () => {
  it("reads questions typed one per line and writes them back the same way", () => {
    const text = "Reason for visit*\nAnything we should know (long)\nLanguage: English, Hindi*";
    const qs = parseQuestions(text);
    expect(qs).toEqual([
      { id: "reason_for_visit", label: "Reason for visit", type: "text", required: true },
      { id: "anything_we_should_know", label: "Anything we should know", type: "longtext", required: false },
      { id: "language", label: "Language", type: "choice", required: true, options: ["English", "Hindi"] },
    ]);
    expect(formatQuestions(qs)).toBe(text);
    expect(parseQuestions("Name\nName")).toHaveLength(2);
    expect(() => parseQuestions(Array.from({ length: 11 }, (_, i) => `Q${i}`).join("\n"))).toThrow(/10/);
  });

  it("checks required answers and choices, keyed by the question's wording", () => {
    const qs = parseQuestions("Reason*\nLanguage: English, Hindi");
    expect(checkAnswers(qs, { reason: " Check-up ", language: "Hindi", stray: "x" })).toEqual({ Reason: "Check-up", Language: "Hindi" });
    expect(() => checkAnswers(qs, {})).toThrow(/Reason/);
    expect(() => checkAnswers(qs, { reason: "x", language: "Klingon" })).toThrow(/choices/);
  });

  it("keeps the answers and the payment status when a booking is moved", async () => {
    const { svc } = await setup({ questions: parseQuestions("Reason for visit*") });
    const { booking } = await c.bookings.create(desk, { serviceId: svc.id, start: at("2026-10-19T10:00"), client: ravi, formAnswers: { reason_for_visit: "Back pain" } }, { now });
    await c.bookings.setPayment({}, booking.id, "paid");
    const moved = await c.bookings.reschedule(desk, booking.id, { start: at("2026-10-20T10:00") }, { now });
    expect(moved.id).not.toBe(booking.id);
    expect(moved).toMatchObject({ formAnswers: { "Reason for visit": "Back pain" }, paymentStatus: "paid" });
  });

  it("stores the answers on the booking and refuses a booking without a required one", async () => {
    const { svc } = await setup({ questions: parseQuestions("Reason for visit*") });
    const base = { serviceId: svc.id, start: at("2026-10-19T10:00"), client: ravi };
    await expect(c.bookings.create(website, { ...base }, { now, idempotencyKey: "key-12345678" })).rejects.toMatchObject({ code: "invalid" });
    const { booking } = await c.bookings.create(website, { ...base, formAnswers: { reason_for_visit: "Back pain" } }, { now, idempotencyKey: "key-12345679" });
    expect(booking.formAnswers).toEqual({ "Reason for visit": "Back pain" });
  });
});

describe("client manage links", () => {
  const secret = "s".repeat(40);
  const signed = createContainer(db, { manageSecret: secret, appUrl: "https://book.example.com", senders: { email: async (m) => void sent.push(m) as never, whatsapp: async () => ({}), webhook: async () => ({}) } });
  const sent: unknown[] = [];

  it("accepts the signed token for that booking only, and rejects a tampered or foreign one", async () => {
    const svc = await signed.catalog.create({}, { name: "Consult", durationMin: 30 });
    const s = await signed.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await signed.staff.setServices({}, s.id, [svc.id]);
    await signed.schedules.setWeeklyHours({}, s.id, everyDay);
    const a = (await signed.bookings.create(desk, { serviceId: svc.id, start: at("2026-10-19T10:00"), client: ravi }, { now })).booking;
    const b = (await signed.bookings.create(desk, { serviceId: svc.id, start: at("2026-10-19T11:00"), client: { ...ravi, phone: "98765 11111" } }, { now })).booking;
    const token = signed.bookings.manageToken(a.id)!;
    await expect(signed.bookings.verifyManageToken(a.id, token)).resolves.toBeUndefined();
    await expect(signed.bookings.verifyManageToken(b.id, token)).rejects.toMatchObject({ code: "not_found" });
    await expect(signed.bookings.verifyManageToken(a.id, token.slice(0, -2) + "xx")).rejects.toMatchObject({ code: "not_found" });
    await expect(signed.bookings.verifyManageToken(a.id, null)).rejects.toMatchObject({ code: "not_found" });
  });

  it("puts the link and the location into workflow messages", async () => {
    const svc = await signed.catalog.create({}, { name: "Consult", durationMin: 30, location: "12 MG Road" });
    const s = await signed.staff.create({}, { name: "Asha", email: "asha@firm.test" });
    await signed.staff.setServices({}, s.id, [svc.id]);
    await signed.schedules.setWeeklyHours({}, s.id, everyDay);
    await signed.workflows.create({}, {
      name: "Confirm",
      trigger: "booked",
      action: { channel: "email", recipient: "client", subject: "Booked", body: "Where: {{location}} Manage: {{manage_link}}" },
    });
    const { booking } = await signed.bookings.create(desk, { serviceId: svc.id, start: at("2026-10-19T10:00"), client: { ...ravi, email: "ravi@example.com" } }, { now });
    await signed.workflows.processDue({ now });
    const body = (sent[0] as { body: string }).body;
    expect(body).toBe(`Where: 12 MG Road Manage: https://book.example.com/manage/${booking.id}?t=${signed.bookings.manageToken(booking.id)}`);
  });
});
