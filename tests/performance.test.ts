import { beforeEach, describe, expect, it } from "vitest";
import { createContainer } from "@/features/container";
import type { AttendanceSource } from "@/features/performance/performance.dto";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { zonedToUtc } from "@/lib/time";
import { db, reset } from "./helpers";

beforeEach(reset);

const IST = "Asia/Kolkata";
const at = (local: string) => zonedToUtc(local, IST);
const desk: BookingActor = { mode: "staff" };
const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "17:00" }));
const reportAt = at("2026-10-20T08:00");
const createdAt = at("2026-07-30T08:00");

async function setup(attendance?: AttendanceSource) {
  const c = createContainer(db, { attendance });
  const therapy = await c.catalog.create({}, { name: "Therapy", durationMin: 60 });
  const asha = await c.staff.create({}, { name: "Asha", email: "asha@firm.test", designation: "Psychologist" });
  const dev = await c.staff.create({}, { name: "Dr Dev", email: "dev@firm.test", designation: "Psychiatrist" });
  await c.staff.create({}, { name: "Sales Sam", email: "sam@firm.test", designation: "Sales Executive" });
  for (const s of [asha, dev]) {
    await c.staff.setServices({}, s.id, [therapy.id]);
    await c.schedules.setWeeklyHours({}, s.id, everyDay);
  }
  const people = { ravi: { name: "Ravi", phone: "98765 43210" }, meera: { name: "Meera", phone: "98765 43211" }, kiran: { name: "Kiran", phone: "98765 43212" } };
  const book = (staffId: string, start: string, who: keyof typeof people, now = createdAt) =>
    c.bookings.create(desk, { serviceId: therapy.id, staffId, start: at(start), client: people[who], useCredits: false }, { now }).then((r) => r.booking);
  return { c, asha, dev, book };
}

describe("therapist performance report", () => {
  it("builds the volume, retention and stopped numbers per therapist from real bookings", async () => {
    const { c, asha, dev, book } = await setup();
    // Ravi: three sessions with Asha and then one with Dr Dev. Meera: one with Asha, never back. Kiran: one recent session.
    await book(asha.id, "2026-08-03T10:00", "ravi");
    await book(asha.id, "2026-08-10T10:00", "ravi");
    await book(asha.id, "2026-08-17T10:00", "ravi");
    await book(dev.id, "2026-09-01T10:00", "ravi");
    await book(asha.id, "2026-08-05T10:00", "meera");
    await book(asha.id, "2026-10-15T10:00", "kiran", at("2026-10-01T08:00"));

    const report = await c.performance.report({ period: "90d" }, reportAt);
    expect(report.period).toBe("90d");
    expect(report.therapists.map((t) => t.name)).toEqual(["Asha", "Dr Dev"]); // by sessions; the person with no bookings is not listed

    const a = report.therapists[0];
    expect(a).toMatchObject({ designation: "Psychologist", volume: { sessions: 5, clients: 3 } });
    // After the 1st: Ravi came back (2nd), Meera did not (lost), Kiran is too recent to judge.
    expect(a.retention.steps[0]).toMatchObject({ after: 1, cohort: 3, returned: 1, lost: 1, waiting: 1, rate: 0.5 });
    expect(a.retention.steps[1]).toMatchObject({ after: 2, cohort: 1, returned: 1, lost: 0, rate: 1 });
    // After the 3rd with Asha: Ravi went to Dr Dev and not back to Asha, so Asha lost him.
    expect(a.retention.steps[2]).toMatchObject({ after: 3, cohort: 1, returned: 0, lost: 1, rate: 0 });
    expect(a.stopped).toMatchObject({ activeClients: 3, stopped: 2, ongoing: 1 });
    expect(a.punctuality).toEqual({ kind: "punctuality", status: "no_data" });

    const d = report.therapists[1];
    expect(d.volume).toMatchObject({ sessions: 1, clients: 1 });
    expect(d.retention.steps[0]).toMatchObject({ cohort: 1, lost: 1 });
  });

  it("leaves out cancelled bookings, no-shows, and the original of a moved session, but counts the new one", async () => {
    const { c, asha, book } = await setup();
    const cancelled = await book(asha.id, "2026-08-03T10:00", "ravi");
    await c.bookings.cancel(desk, cancelled.id, {}, { now: createdAt });
    const noShow = await book(asha.id, "2026-08-04T10:00", "meera");
    await c.bookings.markStatus(desk, noShow.id, "no_show", { now: at("2026-08-05T08:00"), noShowBy: "client" });
    const original = await book(asha.id, "2026-08-06T10:00", "kiran");
    await c.bookings.reschedule(desk, original.id, { start: at("2026-08-07T10:00") }, { now: createdAt });

    const [a] = (await c.performance.report({ period: "90d" }, reportAt)).therapists;
    expect(a.volume).toMatchObject({ sessions: 1, clients: 1 }); // only Kiran's moved session, once
  });

  it("only counts sessions inside the chosen period, and falls back to 30 days for an unknown one", async () => {
    const { c, asha, book } = await setup();
    await book(asha.id, "2026-10-12T10:00", "ravi", at("2026-10-01T08:00"));
    await book(asha.id, "2026-09-05T10:00", "meera", at("2026-08-30T08:00"));
    await book(asha.id, "2026-05-20T10:00", "kiran", at("2026-05-01T08:00"));
    await book(asha.id, "2026-02-10T10:00", "ravi", at("2026-02-01T08:00"));
    const sessions = async (period?: string) => (await c.performance.report({ period }, reportAt)).therapists[0].volume.sessions;
    expect(await sessions("10d")).toBe(1);
    expect(await sessions("30d")).toBe(1);
    expect(await sessions("90d")).toBe(2);
    expect(await sessions("6m")).toBe(3);
    expect(await sessions("1y")).toBe(4);
    expect(await sessions("nonsense")).toBe(1);
    expect(await sessions()).toBe(1);
  });

  it("measures punctuality once an attendance source reports when the therapist joined", async () => {
    const seen: string[][] = [];
    const source: AttendanceSource = {
      async forBookings(ids) {
        seen.push(ids);
        return new Map(ids.map((id) => [id, { joinedAt: at("2026-10-12T10:07") }]));
      },
    };
    const { c, asha, book } = await setup(source);
    await book(asha.id, "2026-10-12T10:00", "ravi", at("2026-10-01T08:00"));
    const [a] = (await c.performance.report({ period: "30d" }, reportAt)).therapists;
    expect(a.punctuality).toMatchObject({ status: "ok", measured: 1, sessions: 1, onTimeRate: 0, avgMinutesLate: 7 });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(1);
  });

  it("does not ask the attendance source anything when there is nothing to measure", async () => {
    let asked = 0;
    const { c } = await setup({ async forBookings() { asked += 1; return new Map(); } });
    expect((await c.performance.report({}, reportAt)).therapists).toEqual([]);
    expect(asked).toBe(0);
  });
});
