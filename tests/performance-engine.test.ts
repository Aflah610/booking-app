import { describe, expect, it } from "vitest";
import { buildJourneys, describeJourney } from "@/features/performance/performance.engine";
import type { Attendance, SessionFact } from "@/features/performance/performance.dto";
import { punctualityKpi, retentionKpi, conclusionKpi, volumeKpi } from "@/features/performance/kpis";
import type { KpiContext } from "@/features/performance/kpis/kpi";
import { periodWindow } from "@/features/performance/performance.periods";

const DAY = 86_400_000;
const now = new Date("2026-10-20T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);
let n = 0;
/** A one-hour session that started `ago` days before now. */
const session = (staffId: string, clientId: string, ago: number, status: SessionFact["status"] = "upcoming"): SessionFact => ({
  id: `b${++n}`,
  staffId,
  clientId,
  startsAt: daysAgo(ago),
  endsAt: new Date(daysAgo(ago).getTime() + 3_600_000),
  status,
});
const ctx = (facts: SessionFact[], o: Partial<KpiContext> & { period?: "10d" | "30d" | "90d" | "6m" | "1y" } = {}): KpiContext => ({
  journeys: buildJourneys(facts),
  window: periodWindow(o.period ?? "90d", now),
  now,
  graceDays: 30,
  attendance: new Map(),
  ...o,
});
const step = (facts: SessionFact[], after: number, o = {}) => retentionKpi.compute(ctx(facts, o)).steps[after - 1];

describe("journeys", () => {
  it("keeps one journey per therapist and client, oldest session first", () => {
    const js = buildJourneys([session("a", "x", 5), session("a", "x", 20), session("b", "x", 8), session("a", "y", 3)]);
    expect(js).toHaveLength(3);
    const ax = js.find((j) => j.staffId === "a" && j.clientId === "x")!;
    expect(ax.sessions.map((s) => s.startsAt.getTime())).toEqual([daysAgo(20).getTime(), daysAgo(5).getTime()]);
  });
});

describe("sessions (volume)", () => {
  it("counts held sessions and distinct clients inside the window only", () => {
    const facts = [session("a", "x", 5), session("a", "x", 12), session("a", "y", 40), session("a", "z", 120)];
    expect(volumeKpi.compute(ctx(facts, { period: "30d" }))).toMatchObject({ sessions: 2, clients: 1 });
    expect(volumeKpi.compute(ctx(facts, { period: "90d" }))).toMatchObject({ sessions: 3, clients: 2 });
    expect(volumeKpi.compute(ctx(facts, { period: "1y" }))).toMatchObject({ sessions: 4, clients: 3 });
  });

  it("does not count a session that has not happened yet, but counts one marked completed", () => {
    const future = { ...session("a", "x", -3) };
    const doneEarly = session("a", "y", 0.01, "completed");
    expect(volumeKpi.compute(ctx([future, doneEarly], { period: "10d" })).sessions).toBe(1);
  });
});

describe("retention after the Nth session", () => {
  it("counts a client who has a later session as returned, and one with nothing after it as lost once the grace has passed", () => {
    const facts = [session("a", "back", 60), session("a", "back", 50), session("a", "gone", 60)];
    expect(step(facts, 1)).toMatchObject({ cohort: 2, returned: 1, lost: 1, waiting: 0, rate: 0.5 });
  });

  it("counts a session booked ahead as a return", () => {
    const facts = [session("a", "x", 5), session("a", "x", -4)];
    expect(step(facts, 1, { period: "30d" })).toMatchObject({ cohort: 1, returned: 1, lost: 0 });
  });

  it("calls a recent client waiting, not lost, and leaves them out of the rate", () => {
    expect(step([session("a", "new", 10)], 1)).toMatchObject({ cohort: 1, returned: 0, lost: 0, waiting: 1, rate: null });
  });

  it("measures each step on its own: after the 2nd only clients who had a 2nd are counted", () => {
    const facts = [
      session("a", "x", 80), session("a", "x", 70), session("a", "x", 60), // three sessions, so returned after 1st and 2nd, nothing after the 3rd
      session("a", "y", 80),                                                // one session, lost after the 1st
    ];
    expect(step(facts, 1)).toMatchObject({ cohort: 2, returned: 1, lost: 1 });
    expect(step(facts, 2)).toMatchObject({ cohort: 1, returned: 1, lost: 0 });
    expect(step(facts, 3)).toMatchObject({ cohort: 1, returned: 0, lost: 1 });
    expect(step(facts, 4)).toMatchObject({ cohort: 0, rate: null });
    expect(retentionKpi.compute(ctx(facts)).steps).toHaveLength(6);
  });

  it("puts a client in the window of the session being measured, not of their first visit", () => {
    // first session long ago, second inside the 30-day window: counted under "after the 2nd" for the 30-day view only
    const facts = [session("a", "x", 100), session("a", "x", 20)];
    expect(step(facts, 1, { period: "30d" }).cohort).toBe(0);
    expect(step(facts, 2, { period: "30d" }).cohort).toBe(1);
    expect(step(facts, 1, { period: "1y" }).cohort).toBe(1);
  });

  it("keeps two therapists' clients apart: a client who left one therapist for another is lost to the first", () => {
    const facts = [session("a", "x", 70), session("b", "x", 40)];
    expect(retentionKpi.compute(ctx(facts.filter((f) => f.staffId === "a"))).steps[0]).toMatchObject({ lost: 1, returned: 0 });
  });
});

describe("concluded (treatment ended)", () => {
  it("counts active clients whose treatment has ended: nothing booked and a last session older than the grace period", () => {
    const facts = [session("a", "ended", 50), session("a", "going", 5), session("a", "booked", 45), session("a", "booked", -7)];
    expect(conclusionKpi.compute(ctx(facts))).toEqual({ kind: "conclusion", activeClients: 3, concluded: 1, ongoing: 2, rate: 1 / 3 });
  });

  it("ignores clients with no session in the window", () => {
    expect(conclusionKpi.compute(ctx([session("a", "old", 200)], { period: "30d" })).activeClients).toBe(0);
  });
});

describe("punctuality", () => {
  it("says no data until an attendance source supplies join times", () => {
    expect(punctualityKpi.compute(ctx([session("a", "x", 5)]))).toEqual({ kind: "punctuality", status: "no_data" });
  });

  it("measures how late the therapist joined, with a few minutes of grace, over the sessions it knows about", () => {
    const early = session("a", "x", 5);
    const late = session("a", "y", 6);
    const unknown = session("a", "z", 7);
    const joined = (s: SessionFact, minutes: number): [string, Attendance] => [s.id, { joinedAt: new Date(s.startsAt.getTime() + minutes * 60_000) }];
    const attendance = new Map([joined(early, -2), joined(late, 10)]);
    const r = punctualityKpi.compute(ctx([early, late, unknown], { attendance }));
    expect(r).toMatchObject({ status: "ok", measured: 2, sessions: 3, onTimeRate: 0.5, avgMinutesLate: 5 });
  });
});

describe("one client's story with a therapist", () => {
  const describe1 = (facts: SessionFact[], period: "30d" | "90d" = "90d") => describeJourney(buildJourneys(facts)[0], periodWindow(period, now), now, 30);

  it("numbers each held session and says what came after it", () => {
    const d = describe1([session("a", "x", 80), session("a", "x", 70), session("a", "x", 40)]);
    expect(d.sessions.map((s) => [s.ordinal, s.outcome])).toEqual([[1, "came_back"], [2, "came_back"], [3, "not_back"]]);
    expect(d.client).toMatchObject({ sessionsInPeriod: 3, sessionsTotal: 3, status: "concluded", nextAt: null });
  });

  it("marks a client with something booked ahead as ongoing, and leaves the booked session unnumbered", () => {
    const d = describe1([session("a", "x", 10), session("a", "x", -5)]);
    expect(d.sessions.map((s) => [s.held, s.ordinal, s.outcome])).toEqual([[true, 1, "came_back"], [false, null, null]]);
    expect(d.client.status).toBe("ongoing");
    expect(d.client.nextAt).toEqual(daysAgo(-5));
  });

  it("calls a client seen recently with nothing booked recent, and one with nothing held yet new", () => {
    expect(describe1([session("a", "x", 10)]).client.status).toBe("recent");
    expect(describe1([session("a", "x", 10)]).sessions[0].outcome).toBe("waiting");
    expect(describe1([session("a", "x", -3)]).client).toMatchObject({ status: "new", sessionsTotal: 0, lastAt: null });
  });

  it("counts sessions inside the period separately from all of them", () => {
    const d = describe1([session("a", "x", 100), session("a", "x", 10)], "30d");
    expect(d.client).toMatchObject({ sessionsInPeriod: 1, sessionsTotal: 2 });
  });
});
