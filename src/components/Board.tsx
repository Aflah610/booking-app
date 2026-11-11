import type { ReactNode } from "react";

/** One column of a Zoho-style board: a coloured header with a count (and a total), then cards. */
export type BoardColumn = { key: string; title: string; tone: keyof typeof TONES; count: number; total?: string; cards: ReactNode[]; empty?: string };

const TONES = {
  rose: "border-rose-300 bg-rose-100 text-rose-900",
  amber: "border-amber-300 bg-amber-100 text-amber-900",
  green: "border-green-300 bg-green-100 text-green-900",
  emerald: "border-emerald-500 bg-emerald-500 text-white",
  red: "border-red-400 bg-red-100 text-red-900",
  orange: "border-orange-300 bg-orange-100 text-orange-900",
} as const;

export function Board({ columns }: { columns: BoardColumn[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
      <div className="flex min-w-max gap-3">
        {columns.map((col) => (
          <section key={col.key} className="flex w-72 shrink-0 flex-col rounded-lg border border-zinc-200 bg-zinc-50" aria-label={col.title}>
            <header className={`rounded-t-lg border-b px-3 py-2.5 ${TONES[col.tone]}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{col.title}</h2>
                <span className="rounded-full bg-white/70 px-2 text-xs font-semibold leading-5 text-zinc-800">{col.count}</span>
              </div>
              {col.total && <p className="mt-0.5 text-xs font-medium">{col.total}</p>}
            </header>
            <div className="grid max-h-[70vh] content-start gap-2 overflow-y-auto p-2">
              {col.cards.length === 0 ? <p className="px-2 py-6 text-center text-sm text-zinc-500">{col.empty ?? "Nothing here."}</p> : col.cards}
              {col.count > col.cards.length && <p className="px-2 py-1 text-center text-xs text-zinc-500">Showing the newest {col.cards.length}</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
