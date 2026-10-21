import Link from "next/link";
import { addDays } from "@/features/availability/slots";
import { zonedToUtc } from "@/lib/time";

const isDay = (v?: string): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

/** A from/to pair of YYYY-MM-DD days in the firm's zone, as the UTC range [from, to) they cover. Bad input is ignored. */
export function dayRange(from: string | undefined, to: string | undefined, tz: string): { from?: Date; to?: Date } {
  return {
    from: isDay(from) ? zonedToUtc(`${from}T00:00`, tz) : undefined,
    to: isDay(to) ? zonedToUtc(`${addDays(to, 1)}T00:00`, tz) : undefined,
  };
}

/**
 * Less-used filters, folded away behind one "Filters" switch so the page stays quiet. It opens by itself while any of its
 * filters is on, and shows how many are.
 */
export function FilterPanel({ active, clearHref, keep, children }: { active: number; clearHref: string; keep: Record<string, string | undefined>; children: React.ReactNode }) {
  return (
    <details className="group relative" open={active > 0}>
      <summary className="btn-ghost cursor-pointer list-none select-none">
        Filters{active > 0 && <span className="rounded-full bg-black px-1.5 text-[11px] font-medium text-white">{active}</span>}
      </summary>
      <form action="" className="card mt-2 flex flex-wrap items-end gap-3 p-4">
        {/* Search and tabs live outside this panel; carry them along so applying a filter keeps them. */}
        {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        {children}
        <div className="flex gap-2">
          <button className="btn" type="submit">Apply</button>
          {active > 0 && <Link className="btn-ghost" href={clearHref}>Clear</Link>}
        </div>
      </form>
    </details>
  );
}

export function DateRangeFields({ legend, from, to }: { legend: string; from?: string; to?: string }) {
  return (
    <fieldset className="flex flex-wrap items-end gap-2">
      <legend className="label">{legend}</legend>
      <label className="sr-only" htmlFor="from">From</label>
      <input className="input w-auto" id="from" name="from" type="date" defaultValue={from ?? ""} />
      <span className="pb-2 text-sm text-zinc-500">to</span>
      <label className="sr-only" htmlFor="to">To</label>
      <input className="input w-auto" id="to" name="to" type="date" defaultValue={to ?? ""} />
    </fieldset>
  );
}
