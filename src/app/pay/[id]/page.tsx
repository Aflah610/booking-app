import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { headers } from "next/headers";
import { app } from "@/features/container";
import { bookingReference } from "@/features/bookings/bookings.dto";
import { isDomainError } from "@/features/shared/errors";
import { longDayLabel, timeLabel } from "@/lib/format";
import { CollectPayment } from "@/components/CollectPayment";
export const dynamic = "force-dynamic";
export const metadata = { title: "Pay for your session", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params, { t = "" } = await searchParams;
  let b;
  try { b = await app().bookings.paymentRequest(id, t); } catch (error) {
    if (!isDomainError(error)) throw error;
    return <main className="mx-auto max-w-lg p-8"><h1 className="text-2xl font-semibold">This payment link is unavailable</h1><p className="mt-4 text-zinc-600">It may have expired or the booking has changed. Ask your coordinator for a new link.</p><Link className="btn mt-6" href="https://mindlap.in/">Back to site</Link></main>;
  }
  const s = await app().settings.get();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <div className="min-h-dvh bg-white"><header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6"><Image src="/brand/mindlap-logo.png" alt="Mindlap" width={160} height={44} unoptimized /><Link className="text-sm text-zinc-600" href="https://mindlap.in/">Back to site</Link></header>
    <main className="mx-auto grid max-w-lg gap-6 px-6 py-8"><div><p className="text-sm text-zinc-500">{bookingReference(s.bookingPrefix, b.number)}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Your session, almost confirmed</h1><p className="mt-3 text-zinc-600">Your coordinator has arranged this session. Complete payment securely below.</p></div>
      <section className="card grid gap-4 p-5"><h2 className="font-semibold">{b.serviceName}</h2><p>With {b.staffName}</p><p className="text-zinc-600">{longDayLabel(b.startsAt, s.timezone)} · {timeLabel(b.startsAt, s.timezone)} ({s.timezone})</p><div className="flex justify-between border-t border-zinc-100 pt-4"><span>Total to pay</span><strong>₹{((b.amountPaise ?? 0)/100).toLocaleString("en-IN")}</strong></div></section>
      {b.paymentStatus === "paid" ? <p className="rounded-xl bg-emerald-50 p-5 text-emerald-800">Payment received. Your session is confirmed.</p> : <><Script src="https://checkout.razorpay.com/v1/checkout.js" nonce={nonce} strategy="afterInteractive" /><CollectPayment id={id} token={t} amount={b.amountPaise ?? 0} /></>}
      <p className="text-center text-xs text-zinc-500">Only this booking can be paid from this link. Your account and booking history stay private.</p>
    </main></div>;
}
