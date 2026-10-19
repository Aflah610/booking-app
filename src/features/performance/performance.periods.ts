import { DEFAULT_PERIOD, PERIODS, type PeriodKey } from "./performance.dto";

const DAY = 86_400_000;

export const isPeriodKey = (key: string | undefined): key is PeriodKey => PERIODS.some((p) => p.key === key);

/** The rolling window a period names, ending now. */
export function periodWindow(key: PeriodKey, now: Date): { from: Date; to: Date; label: string } {
  const p = PERIODS.find((x) => x.key === key) ?? PERIODS.find((x) => x.key === DEFAULT_PERIOD)!;
  return { from: new Date(now.getTime() - p.days * DAY), to: now, label: p.label };
}
