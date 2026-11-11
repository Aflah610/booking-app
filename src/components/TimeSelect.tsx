import type { ChangeEvent } from "react";

/** "13:30" -> "1:30 PM". */
export function amPm(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Every 15 minutes of the day, as "HH:MM". */
const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

/**
 * A time chosen from a list shown as 9:00 AM, 1:30 PM. The browser's own time box follows the computer's settings and
 * often shows 24-hour time. The value stays "HH:MM", so the forms behind it are unchanged.
 */
export function TimeSelect({ value, defaultValue, onChange, name, id, label, required, blank, className = "input" }: {
  value?: string;
  defaultValue?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  name?: string;
  id?: string;
  label?: string;
  required?: boolean;
  /** Offer an empty choice (an optional time). */
  blank?: boolean;
  className?: string;
}) {
  const current = value ?? defaultValue;
  // A saved time off the 15-minute grid (e.g. 09:05) still shows as itself.
  const times = current && !TIMES.includes(current) ? [...TIMES, current].sort() : TIMES;
  return (
    <select className={className} id={id} name={name} aria-label={label} required={required} value={value} defaultValue={value === undefined ? defaultValue ?? "" : undefined} onChange={onChange}>
      {blank && <option value="">–</option>}
      {times.map((t) => <option key={t} value={t}>{amPm(t)}</option>)}
    </select>
  );
}
