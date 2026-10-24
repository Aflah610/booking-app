import { beforeEach, describe, expect, it } from "vitest";
import type { BookingActor } from "@/features/bookings/bookings.service";
import type { DeskViewer } from "@/features/follow-up-desk/follow-up-desk.dto";
import { zonedToUtc } from "@/lib/time";
import { c, reset } from "./helpers";

beforeEach(reset);

const at = (local: string) => zonedToUtc(local, "Asia/Kolkata");
const desk: BookingActor = { mode: "staff" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));
const v = (s: DeskViewer): DeskViewer => s;

async function setup() {
  const therapy = await c.catalog.create({}, { name: "Therapy", durationMin: 60 });
  const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test", designation: "Psychologist" });
  const dev = await c.staff.create({}, { name: "Dev", email: "dev@firm.test", designation: "Psychologist" });
  const sana = await c.staff.create({}, { name: "Sana", email: "sana@firm.test", designation: "Consultation Coordinator" });
  const bde = await c.staff.create({}, { name: "Binu", email: "binu@firm.test", designation: "Sales Executive" });
  for (const s of [asha, dev]) {
    await c.staff.setServices({}, s.id, [therapy.id]);
    await c.schedules.setWeeklyHours({}, s.id, everyDay);
  }
  const book = (staffId: string, start: string, phone: string) =>
    c.bookings.create(desk, { serviceId: therapy.id, staffId, start: at(start), client: { name: "Ravi", phone }, useCredits: false }, { now: at("2026-09-01T08:00") }).then((r) => r.booking);
  const ravi = (await book(asha.id, "2026-09-03T10:00", "98765 43210")).clientId;
  const meena = (await book(dev.id, "2026-09-03T11:00", "98765 11111")).clientId;
  const ask = (by: DeskViewer, clientId: string, message = "Next week, evenings please", psychologistId = by.id) =>
    c.followUps.request(by, { clientId, psychologistId, suggestedOn: "2026-09-10", partOfDay: "evening", message }, at("2026-09-03T12:00"));
  return { asha, dev, sana, bde, book, ravi, meena, ask };
}

describe("asking the coordinators", () => {
  it("lets a psychologist open one follow-up per client, only for their own clients", async () => {
    const { asha, ravi, meena, ask } = await setup();
    const id = await ask(v(asha), ravi);
    expect((await c.followUps.get(v(asha), id)).status).toBe("new");
    await expect(ask(v(asha), ravi)).rejects.toMatchObject({ code: "conflict" });
    await expect(ask(v(asha), meena)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("lets a coordinator open one for any psychologist, but keeps sales executives out", async () => {
    const { sana, bde, dev, meena, ask } = await setup();
    const id = await ask(v(sana), meena, "Client called asking for a slot", dev.id);
    expect((await c.followUps.get(v(sana), id)).psychologistId).toBe(dev.id);
    await expect(c.followUps.list(v(bde))).rejects.toMatchObject({ code: "forbidden" });
    await expect(ask(v(bde), meena, "hi", dev.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("talking it through", () => {
  it("shows a psychologist only their own threads; coordinators see every thread", async () => {
    const { asha, dev, sana, ravi, meena, ask } = await setup();
    const a = await ask(v(asha), ravi);
    await ask(v(dev), meena);
    expect((await c.followUps.list(v(asha))).map((r) => r.id)).toEqual([a]);
    expect(await c.followUps.list(v(sana))).toHaveLength(2);
    await expect(c.followUps.get(v(dev), a)).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps the messages in order and flags news for whoever hasn't read them", async () => {
    const { asha, sana, ravi, ask } = await setup();
    const id = await ask(v(asha), ravi);
    expect(await c.followUps.countUnread(v(asha))).toBe(0);
    expect(await c.followUps.countUnread(v(sana))).toBe(1);

    await c.followUps.open(v(sana), id, at("2026-09-03T12:30"));
    expect(await c.followUps.countUnread(v(sana))).toBe(0);
    await c.followUps.post(v(sana), id, { body: "She can do Thursday 6 PM" }, at("2026-09-03T13:00"));
    expect(await c.followUps.countUnread(v(asha))).toBe(1);
    expect((await c.followUps.list(v(asha)))[0]).toMatchObject({ unread: true, lastMessage: "She can do Thursday 6 PM" });

    await c.followUps.post(v(asha), id, { body: "Thursday 6 PM is fine" }, at("2026-09-03T13:10"));
    const { messages } = await c.followUps.open(v(asha), id, at("2026-09-03T13:11"));
    expect(messages.map((m) => [m.authorName, m.body])).toEqual([
      ["Asha", "Next week, evenings please"],
      ["Sana", "She can do Thursday 6 PM"],
      ["Asha", "Thursday 6 PM is fine"],
    ]);
    expect(await c.followUps.countUnread(v(asha))).toBe(0);
    expect(await c.followUps.countUnread(v(sana))).toBe(1);
    await expect(c.followUps.post(v(asha), id, { body: "   " })).rejects.toThrow();
  });
});

describe("closing a follow-up", () => {
  it("lets only coordinators and managers change the status", async () => {
    const { asha, sana, ravi, ask } = await setup();
    const id = await ask(v(asha), ravi);
    await expect(c.followUps.setStatus(v(asha), id, { status: "contacting" })).rejects.toMatchObject({ code: "forbidden" });
    await c.followUps.setStatus(v(sana), id, { status: "waiting_psychologist" });
    expect((await c.followUps.get(v(asha), id)).status).toBe("waiting_psychologist");
    await c.followUps.setStatus(v(sana), id, { status: "declined" }, at("2026-09-04T10:00"));
    const closed = await c.followUps.get(v(sana), id);
    expect(closed.status).toBe("declined");
    expect(closed.closedAt).toEqual(at("2026-09-04T10:00"));
    expect(await c.followUps.list(v(sana))).toHaveLength(0);
    expect(await c.followUps.list(v(sana), { view: "closed" })).toHaveLength(1);
  });

  it("closes as booked when the client is booked with that psychologist, but not with someone else", async () => {
    const { asha, dev, ravi, ask, book } = await setup();
    const id = await ask(v(asha), ravi);
    await book(dev.id, "2026-09-09T10:00", "98765 43210");
    expect((await c.followUps.get(v(asha), id)).status).toBe("new");
    const session = await book(asha.id, "2026-09-10T16:00", "98765 43210");
    const done = await c.followUps.get(v(asha), id);
    expect(done).toMatchObject({ status: "booked", bookingId: session.id });
    // Closed, so the psychologist can ask about this client again later.
    await expect(ask(v(asha), ravi, "And the one after")).resolves.toBeTruthy();
  });
});
