"use client";

import { useState } from "react";

type Range = { start: string; end: string };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT: Range = { start: "09:00", end: "17:00" };

/**
 * Weekly hours with real time pickers. Each day posts one hidden field `day<N>` holding
 * "09:00-13:00, 14:00-18:00" so the server action keeps a single, validated format.
 */
export function HoursEditor({ initial }: { initial: { weekday: number; startTime: string; endTime: string }[] }) {
  const [days, setDays] = useState<Range[][]>(() =>
    DAYS.map((_, d) => initial.filter((r) => r.weekday === d).map((r) => ({ start: r.startTime, end: r.endTime }))),
  );

  const update = (d: number, fn: (ranges: Range[]) => Range[]) =>
    setDays((all) => all.map((ranges, i) => (i === d ? fn(ranges) : ranges)));

  const copyToAll = (d: number) => setDays((all) => all.map((ranges, i) => (i === 0 || i === 6 ? ranges : all[d].map((r) => ({ ...r })))));

  return (
    <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {DAYS.map((name, d) => {
        const ranges = days[d];
        const on = ranges.length > 0;
        return (
          <div key={name} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start">
            <input type="hidden" name={`day${d}`} value={ranges.map((r) => `${r.start}-${r.end}`).join(", ")} />
            <label className="flex w-36 shrink-0 items-center gap-3 pt-1.5 text-sm font-medium">
              <input
                type="checkbox"
                className="toggle"
                checked={on}
                onChange={(e) => update(d, () => (e.target.checked ? [{ ...DEFAULT }] : []))}
              />
              {name}
            </label>
            <div className="flex flex-1 flex-col gap-2">
              {!on && <span className="pt-1.5 text-sm text-zinc-500">Unavailable</span>}
              {ranges.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    step={300}
                    aria-label={`${name} start`}
                    className="input w-32"
                    value={r.start}
                    onChange={(e) => update(d, (rs) => rs.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                    required
                  />
                  <span className="text-zinc-400">–</span>
                  <input
                    type="time"
                    step={300}
                    aria-label={`${name} end`}
                    className="input w-32"
                    value={r.end}
                    onChange={(e) => update(d, (rs) => rs.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                    required
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Remove time range"
                    onClick={() => update(d, (rs) => rs.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                  {i === 0 && (
                    <>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Add another time range"
                        title="Add a break or second range"
                        onClick={() => update(d, (rs) => [...rs, { start: rs.at(-1)?.end ?? "13:00", end: "18:00" }])}
                      >
                        +
                      </button>
                      <button type="button" className="text-xs text-zinc-500 hover:underline" onClick={() => copyToAll(d)}>
                        Copy to weekdays
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
