"use client";

import { useState } from "react";

/** How the client pays for a desk booking: a QR afterwards, their own credit, or a package sold now. */
export function PaymentChoice({ packages }: { packages: { id: string; label: string }[] }) {
  const [pay, setPay] = useState("qr");
  const options = [
    { value: "qr", title: "Payment QR after booking", hint: "Share the QR from the booking page." },
    { value: "credit", title: "Use their package or wallet", hint: "Takes one credit (or wallet money) the client already has." },
    ...(packages.length ? [{ value: "package", title: "Sell a package and pay with it", hint: "Records the package, then this session uses its first credit." }] : []),
  ];
  return (
    <fieldset className="sm:col-span-2 grid gap-2">
      <legend className="label">Payment</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.value} className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${pay === o.value ? "border-violet-500 bg-violet-50" : "border-zinc-200 hover:border-zinc-400"}`}>
            <input type="radio" name="pay" value={o.value} checked={pay === o.value} onChange={() => setPay(o.value)} className="sr-only" />
            <span className="block font-medium">{o.title}</span>
            <span className="mt-0.5 block text-xs text-zinc-600">{o.hint}</span>
          </label>
        ))}
      </div>
      {pay === "package" && (
        <div className="grid gap-2 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="packageId">Package</label>
            <select className="input" id="packageId" name="packageId" required>
              {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="paymentNote">How they paid</label>
            <input className="input" id="paymentNote" name="paymentNote" required placeholder="e.g. UPI to the firm, ref 4521" />
          </div>
        </div>
      )}
    </fieldset>
  );
}
