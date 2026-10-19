import type { ClientRow, Journey, SessionFact, SessionOutcome } from "./performance.dto";

const DAY = 86_400_000;

/** A session that has happened: marked completed, or not marked at all and already over. */
export const isHeld = (s: SessionFact, now: Date) => s.status === "completed" || s.endsAt.getTime() <= now.getTime();

/**
 * Groups sessions into one journey per therapist and client. The input is sorted once and swept once, so the cost
 * is O(n log n) however many clients there are, and each journey comes out oldest first.
 */
export function buildJourneys(facts: SessionFact[]): Journey[] {
  const byPair = new Map<string, Journey>();
  for (const f of [...facts].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const key = `${f.staffId}|${f.clientId}`;
    const journey = byPair.get(key) ?? { staffId: f.staffId, clientId: f.clientId, sessions: [] };
    journey.sessions.push(f);
    byPair.set(key, journey);
  }
  return [...byPair.values()];
}

export type Window = { from: Date; to: Date };
export const inWindow = (d: Date, w: Window) => d.getTime() >= w.from.getTime() && d.getTime() < w.to.getTime();

/** The Nth held session of a journey and whether anything (held or booked ahead) follows it; null if there are fewer than N. */
export function nthHeld(journey: Journey, n: number, now: Date): { session: SessionFact; followedBySession: boolean } | null {
  let held = 0;
  for (let i = 0; i < journey.sessions.length; i++) {
    if (!isHeld(journey.sessions[i], now)) continue;
    held += 1;
    if (held === n) return { session: journey.sessions[i], followedBySession: i < journey.sessions.length - 1 };
  }
  return null;
}

/** The last session that has happened, and whether something is booked after it. */
export function lastHeld(journey: Journey, now: Date): { session: SessionFact; followedBySession: boolean } | null {
  for (let i = journey.sessions.length - 1; i >= 0; i--) {
    if (isHeld(journey.sessions[i], now)) return { session: journey.sessions[i], followedBySession: i < journey.sessions.length - 1 };
  }
  return null;
}

export const olderThan = (d: Date, days: number, now: Date) => now.getTime() - d.getTime() > days * DAY;
export const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export type JourneyDetail = {
  sessions: { fact: SessionFact; held: boolean; ordinal: number | null; outcome: SessionOutcome | null }[];
  client: Pick<ClientRow, "sessionsInPeriod" | "sessionsTotal" | "firstAt" | "lastAt" | "nextAt" | "status">;
};

/** One client's story with one therapist: each session numbered with what came after it, and where the client stands now. */
export function describeJourney(journey: Journey, window: Window, now: Date, graceDays: number): JourneyDetail {
  let held = 0;
  const sessions = journey.sessions.map((fact, i) => {
    if (!isHeld(fact, now)) return { fact, held: false, ordinal: null, outcome: null };
    held += 1;
    const outcome: SessionOutcome = i < journey.sessions.length - 1 ? "came_back" : olderThan(fact.startsAt, graceDays, now) ? "not_back" : "waiting";
    return { fact, held: true, ordinal: held, outcome };
  });
  const heldSessions = sessions.filter((s) => s.held);
  const ahead = sessions.find((s) => !s.held);
  const last = heldSessions.at(-1);
  const status: ClientRow["status"] = !last ? "new" : ahead ? "ongoing" : olderThan(last.fact.startsAt, graceDays, now) ? "terminated" : "recent";
  return {
    sessions,
    client: {
      sessionsInPeriod: heldSessions.filter((s) => inWindow(s.fact.startsAt, window)).length,
      sessionsTotal: heldSessions.length,
      firstAt: journey.sessions[0].startsAt,
      lastAt: last?.fact.startsAt ?? null,
      nextAt: ahead?.fact.startsAt ?? null,
      status,
    },
  };
}
