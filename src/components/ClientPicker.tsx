"use client";

import { useState } from "react";

/** A client list with a search box above it, for pickers that can run to hundreds of names. */
export function ClientPicker({ name, options, defaultValue }: { name: string; options: { id: string; label: string }[]; defaultValue?: string }) {
  const [q, setQ] = useState("");
  const [value, setValue] = useState(defaultValue ?? "");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Keep the chosen client in the list even when the search no longer matches it, so the form still sends it.
  const shown = options.filter((o) => o.id === value || words.every((w) => o.label.toLowerCase().includes(w)));
  return (
    <div className="grid gap-2">
      <input
        className="input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or client ID"
        aria-label="Search clients"
        autoComplete="off"
      />
      <select className="input" id={name} name={name} required size={Math.min(8, Math.max(shown.length, 2))} value={value} onChange={(e) => setValue(e.target.value)}>
        {shown.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {shown.length === 0 && <p className="text-xs text-zinc-500">No client matches “{q}”.</p>}
    </div>
  );
}
