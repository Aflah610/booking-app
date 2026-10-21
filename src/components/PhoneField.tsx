"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRIES, PINNED, countryName, flag, splitE164 } from "./countries";

/**
 * A phone number as two parts: the country (flag and code, with a searchable list) and the number itself. The form
 * receives one international number in `name` (e.g. +919876543210), which the server checks as before. Typing or pasting
 * a number that starts with "+" picks the country by itself.
 */
export function PhoneField({
  name, id, label, required = false, defaultValue, value, onChange, placeholder,
}: {
  name: string;
  id: string;
  label: string;
  required?: boolean;
  /** An international number to start with (uncontrolled). */
  defaultValue?: string | null;
  /** Controlled use: the international number, and a callback with the new one. */
  value?: string;
  onChange?: (e164: string) => void;
  placeholder?: string;
}) {
  const start = splitE164(value ?? defaultValue);
  const [iso, setIso] = useState(start.iso);
  const [national, setNational] = useState(start.national);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const lastSent = useRef(value);

  // A controlled value changed from outside (e.g. a client picked from search): show it. Our own updates coming back
  // are ignored, so typing a leading 0 isn't undone.
  useEffect(() => {
    if (value === undefined || value === lastSent.current) return;
    lastSent.current = value;
    const next = splitE164(value);
    setIso(next.iso);
    setNational(next.national);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const dial = COUNTRIES.find((c) => c.iso === iso)?.dial ?? "91";
  // A leading 0 is the local trunk prefix, not part of the international number.
  const e164 = national ? `+${dial}${national.replace(/^0+/, "")}` : "";
  const emit = (nextIso: string, nextNational: string) => {
    const d = COUNTRIES.find((c) => c.iso === nextIso)?.dial ?? dial;
    const next = nextNational ? `+${d}${nextNational.replace(/^0+/, "")}` : "";
    lastSent.current = next;
    onChange?.(next);
  };

  const named = useMemo(() => COUNTRIES.map((c) => ({ ...c, name: countryName(c.iso) })), []);
  const q = query.trim().toLowerCase().replace(/^\+/, "");
  const shown = useMemo(() => {
    const match = named.filter((c) => !q || c.name.toLowerCase().includes(q) || c.dial.startsWith(q) || c.iso.toLowerCase() === q);
    const pinned = q ? [] : PINNED.map((p) => match.find((c) => c.iso === p)!).filter(Boolean);
    const rest = match.filter((c) => !pinned.includes(c)).sort((a, b) => a.name.localeCompare(b.name));
    return { pinned, rest };
  }, [named, q]);

  const choose = (next: string) => {
    setIso(next);
    setOpen(false);
    setQuery("");
    emit(next, national);
  };

  const typed = (raw: string) => {
    if (raw.trim().startsWith("+")) {
      const parsed = splitE164(raw, iso);
      setIso(parsed.iso);
      setNational(parsed.national);
      emit(parsed.iso, parsed.national);
      return;
    }
    const digits = raw.replace(/\D/g, "").slice(0, 15);
    setNational(digits);
    emit(iso, digits);
  };

  const Row = ({ c }: { c: (typeof named)[number] }) => (
    <li role="option" aria-selected={c.iso === iso}>
      <button type="button" onClick={() => choose(c.iso)}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100 ${c.iso === iso ? "bg-zinc-100 font-medium" : ""}`}>
        <span aria-hidden="true" className="text-lg leading-none">{flag(c.iso)}</span>
        <span className="flex-1 truncate">{c.name}</span>
        <span className="tabular-nums text-zinc-500">+{c.dial}</span>
      </button>
    </li>
  );

  return (
    <div ref={box} className="relative">
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex items-stretch rounded-md border border-zinc-300 bg-white focus-within:border-black">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
          aria-label={`Country: ${countryName(iso)} +${dial}. Change country`}
          className="flex shrink-0 items-center gap-1.5 border-r border-zinc-200 px-2.5 text-sm font-medium hover:bg-zinc-50">
          <span aria-hidden="true" className="text-base leading-none">{flag(iso)}</span>
          <span>{iso}</span>
          <span className="text-zinc-500">+{dial}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" required={required} value={national}
          onChange={(e) => typed(e.target.value)} placeholder={placeholder ?? (iso === "IN" ? "98765 43210" : "Mobile number")}
          className="min-w-0 flex-1 rounded-r-md bg-transparent px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:outline-none" />
      </div>
      <input type="hidden" name={name} value={e164} />

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-zinc-200 bg-white p-1.5 shadow-lg">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-2 pb-2 pt-1">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search country or code" aria-label="Search country or code"
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter") { e.preventDefault(); const first = shown.pinned[0] ?? shown.rest[0]; if (first) choose(first.iso); }
              }}
              className="w-full bg-transparent py-1 text-sm focus:outline-none" />
          </div>
          <ul role="listbox" aria-label="Countries" className="mt-1 max-h-72 overflow-y-auto">
            {shown.pinned.map((c) => <Row key={c.iso} c={c} />)}
            {shown.pinned.length > 0 && <li aria-hidden="true" className="my-1 border-t border-zinc-100" />}
            {shown.rest.map((c) => <Row key={c.iso} c={c} />)}
            {shown.pinned.length + shown.rest.length === 0 && <li className="px-3 py-2 text-sm text-zinc-600">No country matches.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
