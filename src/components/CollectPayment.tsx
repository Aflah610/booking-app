"use client";
import { useState } from "react";
type CheckoutResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type Order = { order_id: string; key_id: string; amount: number; currency: string; booked?: boolean; error?: string };
declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, fn: () => void): void } } }
export function CollectPayment({ id, token, amount }: { id: string; token: string; amount: number }) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  async function call(op: string, extra: Record<string, unknown> = {}) {
    const r = await fetch(`/api/collect/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, op, ...extra }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Unable to start payment. Please try again.");
    return data;
  }
  async function pay() {
    setBusy(true); setNotice("");
    try {
      if (!window.Razorpay) throw new Error("Secure payment is still loading. Please try again in a moment.");
      const order: Order = await call("order");
      if (order.booked) { window.location.reload(); return; }
      const checkout = new window.Razorpay({ key: order.key_id, order_id: order.order_id, amount: order.amount, currency: order.currency, name: "Mindlap", description: "Session payment", theme: { color: "#64718b" },
        handler: async (result: CheckoutResult) => {
          try { const verified = await call("verify", result); if (verified.success) window.location.reload(); else setNotice(verified.error || "Payment is being confirmed. Refresh shortly; do not pay again."); }
          catch { setNotice("Payment is being confirmed. Refresh shortly; do not pay again. Your coordinator can check its status."); }
          finally { setBusy(false); }
        }, modal: { ondismiss: () => setBusy(false) },
      });
      checkout.on("payment.failed", () => { setNotice("Payment was not completed. You can try again."); setBusy(false); });
      checkout.open();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Payment unavailable"); setBusy(false); }
  }
  return <div className="grid gap-3"><button type="button" className="w-full rounded-full bg-slate-500 px-6 py-4 font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50" onClick={pay} disabled={busy}>{busy ? "Confirming payment…" : `Pay ₹${(amount/100).toLocaleString("en-IN")}`}</button><p className="text-sm text-zinc-600" role="status">{notice}</p></div>;
}
