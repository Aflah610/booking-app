import { notFound } from "next/navigation";
import { app } from "@/features/container";
import { DomainError } from "@/features/shared/errors";
import { requireStaff } from "@/lib/session";
import { BookingRow } from "@/components/BookingRow";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { updateClientAction } from "../../actions";
import { sellPackageAction, topUpWalletAction } from "../../packages/actions";
import { longDayLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireStaff("manager");
  const { id } = await params;
  const { error, ok } = await searchParams;
  const { clients, bookings, settings, packages } = app();
  const c = await clients.get(id).catch((err) => {
    if (err instanceof DomainError) notFound();
    throw err;
  });
  const now = new Date();
  const [history, s, credit, onSale, allPackages, uses] = await Promise.all([
    bookings.list({ view: "all", clientId: id, limit: 200 }),
    settings.get(),
    packages.summary(id, now),
    packages.list(),
    packages.allPackages(id),
    packages.usesForClient(id, 20),
  ]);
  const num = (n: number) => String(Number(n.toFixed(3)));
  const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const oldPackages = allPackages.filter((p) => !credit.packages.some((c) => c.id === p.id));
  return (
    <>
      <PageHeader title={c.name} subtitle={c.phoneE164} />
      <Notice error={error} ok={ok} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section>
          <h2 className="mb-3 font-semibold">Credits</h2>
          <div className="card mb-8 grid gap-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-600">Wallet</p>
                <p className="mt-1 text-2xl font-semibold">{rupees(credit.totalPaise)}</p>
                <p className="text-xs text-zinc-600">{rupees(credit.packageValuePaise)} in packages · {rupees(credit.walletPaise)} added as wallet money</p>
                {credit.lots.map((l) => (
                  <p key={l.id} className="text-xs text-zinc-600">{rupees(l.remainingPaise)} of {rupees(l.amountPaise)}, expires {longDayLabel(l.expiresAt, s.timezone)}</p>
                ))}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-600">Package credits</p>
                <p className="mt-1 text-2xl font-semibold">{num(credit.packages.reduce((n, p) => n + p.creditsLeft, 0))}</p>
                {credit.packages.map((p) => (
                  <p key={p.id} className="text-xs text-zinc-600">{p.packageName}: {num(p.creditsLeft)} of {num(p.creditsTotal)} left ({rupees(p.valueLeftPaise)}){p.expiresAt ? `, expires ${longDayLabel(p.expiresAt, s.timezone)}` : ""}</p>
                ))}
                {credit.packages.length === 0 && <p className="text-xs text-zinc-600">None left.</p>}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <form action={sellPackageAction.bind(null, id)} className="grid gap-2 rounded-lg border border-zinc-200 p-3">
                <p className="text-sm font-medium">Sell a package</p>
                <select className="input" name="packageId" required aria-label="Package">
                  {onSale.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} · {rupees(p.pricePaise)}</option>)}
                </select>
                <input className="input" name="paymentNote" placeholder="How it was paid (cash, UPI ref …)" />
                <div><button className="btn-ghost" type="submit" disabled={onSale.every((p) => !p.active)}>Sell</button></div>
              </form>
              <form action={topUpWalletAction.bind(null, id)} className="grid gap-2 rounded-lg border border-zinc-200 p-3">
                <p className="text-sm font-medium">Add wallet money</p>
                <input className="input" name="amount" inputMode="decimal" placeholder="Amount in ₹, e.g. 10000" required aria-label="Amount in rupees" />
                <input className="input" name="note" placeholder="How it was paid" />
                <div><button className="btn-ghost" type="submit">Add</button></div>
              </form>
            </div>
            <p className="text-xs text-zinc-600">Wallet money expires a year after it is added and cannot be paid back in cash. Bookings use package credits first (a ₹1,500 service takes 1.5 credits of a ₹1,000-credit package), then wallet money, then the rest is paid.</p>
            {uses.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Recent use</p>
                <ul className="divide-y divide-zinc-100 text-sm">
                  {uses.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center gap-x-4 py-1.5">
                      <span className="flex-1">Booking {s.bookingPrefix}{String(u.bookingNumber).padStart(5, "0")} · {u.kind === "package" ? `${num(u.credits)} credit${u.credits === 1 ? "" : "s"} of ${u.label} (${rupees(u.valuePaise)})` : `${rupees(u.amountPaise)} from wallet`}</span>
                      {u.returnedAt ? <span className="font-medium text-green-700">Given back</span> : <span className="text-zinc-600">Used</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {oldPackages.length > 0 && <p className="text-xs text-zinc-600">Used up or expired: {oldPackages.map((p) => p.packageName).join(", ")}.</p>}
          </div>
          <h2 className="mb-3 font-semibold">Bookings</h2>
          <div className="card divide-y divide-zinc-100 overflow-hidden">
            {history.length === 0 && <p className="p-8 text-center text-sm text-zinc-600">No bookings.</p>}
            {[...history].reverse().map((b) => <BookingRow key={b.id} b={b} tz={s.timezone} prefix={s.bookingPrefix} />)}
          </div>
        </section>
        <form action={updateClientAction.bind(null, id)} className="card grid content-start gap-4 p-5">
          <div><label className="label" htmlFor="name">Name</label><input className="input" id="name" name="name" defaultValue={c.name} required /></div>
          <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" defaultValue={c.email ?? ""} /></div>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="toggle" name="whatsappOptIn" defaultChecked={c.whatsappOptIn} /> WhatsApp updates</label>
          <div><label className="label" htmlFor="notes">Notes</label><textarea className="input" id="notes" name="notes" rows={4} defaultValue={c.notes ?? ""} /></div>
          <div><button className="btn" type="submit">Save</button></div>
        </form>
      </div>
    </>
  );
}
