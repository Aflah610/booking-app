/**
 * The slot engine: pure functions, no database. Everything works on half-open UTC intervals
 * [start, end) in epoch milliseconds, kept sorted so each step is one sweep (O(n log n) overall).
 */
import type { DateOverrideDTO, WorkingRangeDTO } from "@/features/schedules/schedules.dto";
import { zonedToUtc } from "@/lib/time";

export type Interval = { start: number; end: number };

const MIN = 60_000;
const DAY = 86_400_000;

/** Sorts and joins overlapping or touching intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.start < i.end).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out.at(-1);
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ ...cur });
  }
  return out;
}

/** `base` minus `cut`. Both must be merged (sorted, non-overlapping); one pass with two pointers. */
export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  const out: Interval[] = [];
  let j = 0;
  for (const b of base) {
    let start = b.start;
    while (j < cut.length && cut[j].end <= start) j++;
    let k = j;
    while (k < cut.length && cut[k].start < b.end) {
      if (cut[k].start > start) out.push({ start, end: cut[k].start });
      start = Math.max(start, cut[k].end);
      k++;
    }
    if (start < b.end) out.push({ start, end: b.end });
  }
  return out;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsIn(ms: number, timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return p;
}

/** How far the zone's wall clock is ahead of UTC at that instant, in ms (IST: +5h30m). */
export function offsetMs(ms: number, timeZone: string): number {
  const p = partsIn(ms, timeZone);
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

/** "YYYY-MM-DD" of the instant in the zone. */
export function localDate(ms: number, timeZone: string): string {
  const p = partsIn(ms, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/**
 * Concrete working intervals between `from` and `to`: the weekly pattern for each local date,
 * except dates with an override, which replace that day's hours entirely.
 */
export function workingIntervals(opts: {
  weekly: WorkingRangeDTO[];
  overrides: DateOverrideDTO[];
  timeZone: string;
  from: number;
  to: number;
}): Interval[] {
  const { weekly, timeZone, from, to } = opts;
  const overrides = new Map(opts.overrides.map((o) => [o.date, o.ranges]));
  const out: Interval[] = [];
  const last = localDate(to, timeZone);
  for (let d = localDate(from, timeZone); d <= last; d = addDays(d, 1)) {
    const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    const ranges = overrides.get(d) ?? weekly.filter((r) => r.weekday === weekday);
    for (const r of ranges) {
      const start = Math.max(zonedToUtc(`${d}T${r.startTime}`, timeZone).getTime(), from);
      const end = Math.min(zonedToUtc(`${d}T${r.endTime}`, timeZone).getTime(), to);
      if (start < end) out.push({ start, end });
    }
  }
  return mergeIntervals(out);
}

/**
 * Start times inside the free intervals. Starts sit on the interval grid of the staff member's
 * wall clock (10:00, 10:15…), not wherever a free gap happens to begin.
 */
export function cutSlots(opts: {
  free: Interval[];
  durationMin: number;
  intervalMin: number;
  timeZone: string;
  earliest: number;
  latest: number;
}): number[] {
  const dur = opts.durationMin * MIN;
  const step = opts.intervalMin * MIN;
  const align = (t: number) => {
    const off = offsetMs(t, opts.timeZone);
    return Math.ceil((t + off) / step) * step - off;
  };
  const out: number[] = [];
  for (const f of opts.free) {
    let s = align(Math.max(f.start, opts.earliest));
    while (s + dur <= f.end && s <= opts.latest) {
      out.push(s);
      // Re-align after each step so a daylight-saving change mid-range stays on the wall-clock grid.
      s = align(s + step);
    }
  }
  return out;
}

export type SlotRequest = {
  weekly: WorkingRangeDTO[];
  overrides: DateOverrideDTO[];
  timeZone: string;
  /** Things that block time, already widened by their own buffers. */
  busy: Interval[];
  from: number;
  to: number;
  durationMin: number;
  intervalMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  /** Nothing starts before this (now + minimum notice) or after `latest` (the booking window). */
  earliest: number;
  latest: number;
};

/** Free start times for one staff member and one service. Starts fall in [from, to). */
export function staffSlots(r: SlotRequest): number[] {
  const dur = r.durationMin * MIN;
  const work = workingIntervals({ weekly: r.weekly, overrides: r.overrides, timeZone: r.timeZone, from: r.from, to: r.to + dur });
  // The new booking's own buffers must not touch anything busy: widen busy times by them.
  const busy = mergeIntervals(
    r.busy.map((b) => ({ start: b.start - r.bufferAfterMin * MIN, end: b.end + r.bufferBeforeMin * MIN })),
  );
  const free = subtractIntervals(work, busy);
  return cutSlots({
    free,
    durationMin: r.durationMin,
    intervalMin: r.intervalMin,
    timeZone: r.timeZone,
    earliest: Math.max(r.earliest, r.from),
    latest: Math.min(r.latest, r.to - 1),
  });
}

/** Joins several staff members' slot lists into one sorted list of start → who is free. */
export function unionSlots(perStaff: { staffId: string; starts: number[] }[]): { start: number; staffIds: string[] }[] {
  const byStart = new Map<number, string[]>();
  for (const { staffId, starts } of perStaff) {
    for (const s of starts) {
      const ids = byStart.get(s);
      if (ids) ids.push(staffId);
      else byStart.set(s, [staffId]);
    }
  }
  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([start, staffIds]) => ({ start, staffIds }));
}
