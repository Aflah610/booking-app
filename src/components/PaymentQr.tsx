"use client";
import Image from "next/image";
import { useState } from "react";
export function PaymentQr({ url, image, reference, expiry }: { url: string; image: string; reference: string; expiry: string }) {
  const [notice, setNotice] = useState("");
  return <section className="card mb-6 grid gap-5 p-5 sm:grid-cols-[180px_1fr]">
    <Image src={image} alt={`Payment QR for ${reference}`} width={180} height={180} unoptimized />
    <div className="grid content-center gap-3"><div><h2 className="font-semibold">Send payment to the client</h2><p className="mt-1 text-sm text-zinc-600">Scan this QR or open the link to pay for {reference}. Payment updates automatically after verification. No OTP needed.</p></div>
      <p className="text-xs text-zinc-500">Link expires {expiry}. Creating or sharing it does not mark the booking paid.</p>
      <div className="flex flex-wrap gap-2"><a href={image} download={`${reference}-payment-qr.png`} className="btn-ghost">Download QR</a>
        <button className="btn-ghost" type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setNotice("Payment link copied"); } catch { setNotice("Select and copy the link below"); } }}>Copy payment link</button>
        <button className="btn-ghost" type="button" onClick={async () => { try { if (navigator.share) await navigator.share({ title: `Mindlap ${reference}`, url }); else { await navigator.clipboard.writeText(url); setNotice("Payment link copied"); } } catch { setNotice("Use Copy payment link or Download QR"); } }}>Share</button></div>
      <input className="input text-xs" value={url} readOnly aria-label="Client payment link" onFocus={e => e.currentTarget.select()} />
      <p className="text-sm text-zinc-600" role="status">{notice}</p>
    </div>
  </section>;
}
