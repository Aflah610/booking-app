import type { Journey, SessionFact } from "./performance.dto";

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
