"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { moveLeadAction } from "./actions";

export type DragCard = { id: string; title: string; owner: string | null; when: string; phone: string | null; badge: string | null };
export type DragColumn = { status: string; title: string; tone: string; count: number; empty: string; cards: DragCard[] };

const TONES: Record<string, string> = {
  rose: "border-rose-300 bg-rose-100 text-rose-900",
  amber: "border-amber-300 bg-amber-100 text-amber-900",
  green: "border-green-300 bg-green-100 text-green-900",
  red: "border-red-400 bg-red-100 text-red-900",
  orange: "border-orange-300 bg-orange-100 text-orange-900",
  emerald: "border-emerald-500 bg-emerald-500 text-white",
};

type Drag = { card: DragCard; from: string; x: number; y: number; dx: number; dy: number; width: number; over: string | null };

/**
 * The leads board with drag and drop: hold the grip on a card and drop it on another column. Works with a mouse and on
 * touch screens (pointer events, not the browser's own drag, which phones don't support). Tapping the card still opens it.
 */
export function DragBoard({ columns: initial, lostReasons }: { columns: DragColumn[]; lostReasons: { value: string; label: string }[] }) {
  const router = useRouter();
  const [columns, setColumns] = useState(initial);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [askLost, setAskLost] = useState<{ card: DragCard; from: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const dragRef = useRef<Drag | null>(null);

  // Fresh columns from the server (after a move or a refresh) replace the local copy.
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setColumns(initial);
  }

  function columnAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest("[data-col]");
    return el?.getAttribute("data-col") ?? null;
  }

  function start(e: React.PointerEvent, card: DragCard, from: string) {
    const box = (e.currentTarget as HTMLElement).closest("[data-card]")!.getBoundingClientRect();
    const d = { card, from, x: e.clientX, y: e.clientY, dx: e.clientX - box.left, dy: e.clientY - box.top, width: box.width, over: from };
    dragRef.current = d;
    setDrag(d);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function moveTo(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const d = { ...dragRef.current, x: e.clientX, y: e.clientY, over: columnAt(e.clientX, e.clientY) };
    dragRef.current = d;
    setDrag(d);
  }

  function end() {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d || !d.over || d.over === d.from) return;
    if (d.over === "lost") {
      setAskLost({ card: d.card, from: d.from });
      return;
    }
    commit(d.card, d.from, d.over, null);
  }

  function shift(card: DragCard, from: string, to: string) {
    setColumns((cols) => cols.map((c) =>
      c.status === from ? { ...c, count: c.count - 1, cards: c.cards.filter((x) => x.id !== card.id) }
        : c.status === to ? { ...c, count: c.count + 1, cards: [card, ...c.cards] }
          : c));
  }

  function commit(card: DragCard, from: string, to: string, reason: string | null) {
    setError(null);
    shift(card, from, to);
    setLanded(card.id);
    setTimeout(() => setLanded((id) => (id === card.id ? null : id)), 700);
    startTransition(async () => {
      const r = await moveLeadAction(card.id, to, reason);
      if (r.error) {
        shift(card, to, from);
        setError(r.error);
      } else router.refresh();
    });
  }

  return (
    <>
      {error && <p className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p>}
      <p className="mb-2 hidden text-xs text-zinc-500 md:block">Drag a card by its handle to move it to another stage.</p>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        <div className="flex min-w-max gap-3">
          {columns.map((col) => {
            const target = drag && drag.over === col.status && drag.from !== col.status;
            return (
              <section
                key={col.status}
                data-col={col.status}
                aria-label={col.title}
                className={`flex w-72 shrink-0 flex-col rounded-lg border bg-zinc-50 transition-all duration-200 ${target ? "scale-[1.01] border-violet-400 bg-violet-50 shadow-md" : "border-zinc-200"}`}
              >
                <header className={`rounded-t-lg border-b px-3 py-2.5 ${TONES[col.tone] ?? ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">{col.title}</h2>
                    <span className="rounded-full bg-white/70 px-2 text-xs font-semibold leading-5 text-zinc-800">{col.count}</span>
                  </div>
                </header>
                <div className="grid max-h-[70vh] min-h-24 content-start gap-2 overflow-y-auto p-2">
                  {col.cards.length === 0 && <p className="px-2 py-6 text-center text-sm text-zinc-500">{target ? "Drop here" : col.empty}</p>}
                  {col.cards.map((card) => {
                    const lifted = drag?.card.id === card.id;
                    return (
                      <div
                        key={card.id}
                        data-card
                        className={`card relative flex text-sm transition-all duration-300 ease-out motion-reduce:transition-none ${lifted ? "opacity-30" : ""} ${landed === card.id ? "lead-landed" : ""}`}
                      >
                        <button
                          type="button"
                          aria-label={`Move ${card.title}`}
                          title="Drag to another stage"
                          className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing"
                          onPointerDown={(e) => start(e, card, col.status)}
                          onPointerMove={moveTo}
                          onPointerUp={end}
                          onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
                        >
                          <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true" fill="currentColor">
                            <circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" /><circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" />
                          </svg>
                        </button>
                        <Link href={`/admin/leads/${card.id}`} className="block min-w-0 flex-1 p-3 pl-1.5 hover:bg-zinc-50">
                          <CardBody card={card} />
                        </Link>
                      </div>
                    );
                  })}
                  {col.count > col.cards.length && <p className="px-2 py-1 text-center text-xs text-zinc-500">Showing the newest {col.cards.length}</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {drag && (
        <div
          aria-hidden="true"
          className="card pointer-events-none fixed z-50 rotate-2 p-3 text-sm shadow-xl ring-2 ring-violet-400"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }}
        >
          <CardBody card={drag.card} />
        </div>
      )}

      {askLost && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="lost-title">
          <form
            className="card w-full max-w-sm p-5"
            onSubmit={(e) => {
              e.preventDefault();
              const reason = new FormData(e.currentTarget).get("reason") as string;
              commit(askLost.card, askLost.from, "lost", reason);
              setAskLost(null);
            }}
          >
            <h2 id="lost-title" className="font-semibold">Why was {askLost.card.title} lost?</h2>
            <select className="input mt-3" name="reason" required defaultValue="" autoFocus>
              <option value="" disabled>Choose a reason</option>
              {lostReasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setAskLost(null)}>Cancel</button>
              <button type="submit" className="btn">Move to Lost</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function CardBody({ card }: { card: DragCard }) {
  return (
    <>
      <p className="truncate font-semibold">{card.title}</p>
      {card.owner && <p className="truncate text-zinc-600">{card.owner}</p>}
      <p className="text-xs text-zinc-600">{card.when}</p>
      {(card.badge || card.phone) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {card.badge && <span className="badge">{card.badge}</span>}
          {card.phone && <span className="text-xs tabular-nums text-zinc-600">{card.phone}</span>}
        </div>
      )}
    </>
  );
}
