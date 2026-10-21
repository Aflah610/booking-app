"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneField } from "./PhoneField";

type Match = { id: string; name: string; phone: string; email: string | null; whatsappOptIn: boolean; bookings: number };
/** A client already chosen before the form opens, e.g. from "New booking" on their page. */
export type PickedClient = Omit<Match, "bookings">;

/**
 * The client's details on a new booking. Managers can search existing clients by name, phone or email and pick one to fill the
 * boxes in; anyone can still type a new client in. A phone number we already know is matched to that client when the booking is saved.
 */
export function ClientFields({ canSearch, initial }: { canSearch: boolean; initial?: PickedClient | null }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [picked, setPicked] = useState<PickedClient | null>(initial ?? null);
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsappOptIn ?? true);
  const latest = useRef(0);

  useEffect(() => {
    if (!canSearch || query.trim().length < 1) return;
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/clients/search?q=${encodeURIComponent(query.trim())}`);
        const body = res.ok ? ((await res.json()) as { data: Match[] }) : { data: [] };
        // Ignore an answer that arrives after the person has typed something newer.
        if (id === latest.current) setMatches(body.data);
      } catch {
        if (id === latest.current) setMatches([]);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query, canSearch]);

  // Nothing is shown for an empty box, whatever answer came back for an earlier search.
  const shown = canSearch && query.trim().length >= 1 ? matches : null;
  const pick = (m: Match) => {
    setPicked(m);
    setName(m.name);
    setPhone(m.phone);
    setEmail(m.email ?? "");
    setWhatsapp(m.whatsappOptIn);
    setQuery("");
    setMatches(null);
  };
  const clear = () => {
    setPicked(null);
    setName("");
    setPhone("");
    setEmail("");
    setWhatsapp(true);
  };

  return (
    <>
      {canSearch && (
        <div className="relative sm:col-span-2">
          <label className="label" htmlFor="clientSearch">Find an existing client</label>
          <input
            className="input"
            id="clientSearch"
            type="search"
            autoComplete="off"
            placeholder="Search by name, phone or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {shown && (
            <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg" role="listbox">
              {shown.length === 0 && <li className="px-3 py-2 text-sm text-zinc-600">No client found. Type the details below to add a new one.</li>}
              {shown.map((m) => (
                <li key={m.id} role="option" aria-selected={false}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-100" onClick={() => pick(m)}>
                    <span>
                      <span className="block font-medium">{m.name}</span>
                      <span className="block text-xs text-zinc-500">{m.phone}{m.email ? ` · ${m.email}` : ""}</span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">{m.bookings} booking{m.bookings === 1 ? "" : "s"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picked && (
            <p className="mt-2 flex items-center gap-2 text-sm text-zinc-600">
              Existing client: <span className="font-medium text-black">{picked.name}</span>
              <button type="button" className="underline" onClick={clear}>Clear</button>
            </p>
          )}
        </div>
      )}
      <div><label className="label" htmlFor="clientName">Client name</label><input className="input" id="clientName" name="clientName" required value={name} onChange={(e) => setName(e.target.value)} /></div>
      <PhoneField id="clientPhone" name="clientPhone" label="Mobile number" required value={phone} onChange={setPhone} />
      <div><label className="label" htmlFor="clientEmail">Email</label><input className="input" id="clientEmail" name="clientEmail" type="email" placeholder="Optional" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <label className="flex items-center gap-3 self-end pb-2 text-sm">
        <input type="checkbox" className="toggle" name="whatsappOptIn" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> Send WhatsApp updates
      </label>
    </>
  );
}
