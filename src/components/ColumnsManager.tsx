"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetColumnsAction, saveColumnsAction } from "@/app/admin/columns-actions";
import type { BookingListKey, ColumnChoice } from "@/lib/booking-columns";

/**
 * A "Columns" button that opens a side panel: tick the columns to show, drag (or use the arrows) to reorder, Apply to save.
 * The choice is remembered per person. "Time" is always shown.
 */
export function ColumnsManager({ list, choices }: { list: BookingListKey; choices: ColumnChoice[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(choices);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setOpen(false);
    setItems(choices);
    setError(null);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setItems(next);
  };
  const toggle = (id: string) => setItems(items.map((i) => (i.id === id && !i.locked ? { ...i, checked: !i.checked } : i)));
  const count = items.filter((i) => i.checked).length;

  const apply = () => {
    if (count < 2) return setError("Select at least two fields");
    start(async () => {
      const res = await saveColumnsAction(list, items.filter((i) => i.checked).map((i) => i.id));
      if ("error" in res) return setError(res.error);
      setOpen(false);
      setError(null);
      router.refresh();
    });
  };
  const reset = () =>
    start(async () => {
      await resetColumnsAction(list);
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => { setItems(choices); setOpen(true); }}>Columns</button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={close}>
          <aside role="dialog" aria-modal="true" aria-label="Manage columns" className="flex h-full w-full max-w-md flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-5">
              <h2 className="text-lg font-semibold">Manage columns</h2>
              <button type="button" className="icon-btn" aria-label="Close" onClick={close}>×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${error ? "border-red-300 bg-red-50 text-red-700" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`} role={error ? "alert" : undefined}>
                {error ?? "Select at least two fields. Drag to change the order."}
              </p>
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {items.map((c, i) => (
                  <li
                    key={c.id}
                    draggable
                    onDragStart={() => setDragging(c.id)}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragging && dragging !== c.id) move(items.findIndex((x) => x.id === dragging), i);
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 ${dragging === c.id ? "bg-zinc-100" : "bg-white"}`}
                  >
                    <span className="cursor-grab select-none text-zinc-400" aria-hidden="true">⠿</span>
                    <label className="flex flex-1 items-center gap-3 text-sm">
                      <input type="checkbox" checked={c.checked} disabled={c.locked} onChange={() => toggle(c.id)} />
                      <span className={c.locked ? "text-zinc-500" : undefined}>{c.label}{c.caption && <span className="ml-1.5 text-xs text-zinc-500">{c.caption}</span>}{c.locked && " (always shown)"}</span>
                    </label>
                    <button type="button" className="icon-btn" aria-label={`Move ${c.label} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                    <button type="button" className="icon-btn" aria-label={`Move ${c.label} down`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center gap-3 border-t border-zinc-200 px-6 py-4">
              <button type="button" className="btn" disabled={pending} onClick={apply}>Apply</button>
              <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
              <button type="button" className="ml-auto text-sm text-zinc-600 underline" disabled={pending} onClick={reset}>Reset to default</button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
