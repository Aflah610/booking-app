import { sellPackageAction, topUpWalletAction } from "@/app/admin/packages/actions";
import { app } from "@/features/container";
import { longDayLabel } from "@/lib/format";

/** The client's wallet and package credits, with selling a package and adding wallet money. */
export async function ClientCredits({ clientId, tz, bookingPrefix }: { clientId: string; tz: string; bookingPrefix: string }) {
  const { packages } = app();
  const now = new Date();
  const [credit, onSale, allPackages, uses] = await Promise.all([
    packages.summary(clientId, now),
    packages.list(),
    packages.allPackages(clientId),
    packages.usesForClient(clientId, 20),
  ]);
  const num = (n: number) => String(Number(n.toFixed(3)));
  const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const oldPackages = allPackages.filter((p) => !credit.packages.some((c) => c.id === p.id));
  return (
    <div className="card grid gap-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-600">Wallet</p>
          <p className="mt-1 text-2xl font-semibold">{rupees(credit.totalPaise)}</p>
          <p className="text-xs text-zinc-600">{rupees(credit.packageValuePaise)} in packages · {rupees(credit.walletPaise)} added as wallet money</p>
          {credit.lots.map((l) => (
            <p key={l.id} className="text-xs text-zinc-600">{rupees(l.remainingPaise)} of {rupees(l.amountPaise)}, expires {longDayLabel(l.expiresAt, tz)}{l.note ? ` · ${l.note}` : ""}</p>
          ))}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-600">Package credits</p>
          <p className="mt-1 text-2xl font-semibold">{num(credit.packages.reduce((n, p) => n + p.creditsLeft, 0))}</p>
          {credit.packages.map((p) => (
            <p key={p.id} className="text-xs text-zinc-600">{p.packageName}: {num(p.creditsLeft)} of {num(p.creditsTotal)} left ({rupees(p.valueLeftPaise)}){p.expiresAt ? `, expires ${longDayLabel(p.expiresAt, tz)}` : ""}{p.paymentNote ? ` · ${p.paymentNote}` : ""}</p>
          ))}
          {credit.packages.length === 0 && <p className="text-xs text-zinc-600">None left.</p>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <form action={sellPackageAction.bind(null, clientId)} className="grid gap-2 rounded-lg border border-zinc-200 p-3">
          <p className="text-sm font-medium">Sell a package</p>
          <select className="input" name="packageId" required aria-label="Package">
            {onSale.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} · {rupees(p.pricePaise)}</option>)}
          </select>
          <input className="input" name="paymentNote" placeholder="How it was paid (cash, UPI ref …)" />
          <div><button className="btn-ghost" type="submit" disabled={onSale.every((p) => !p.active)}>Sell</button></div>
        </form>
        <form action={topUpWalletAction.bind(null, clientId)} className="grid gap-2 rounded-lg border border-zinc-200 p-3">
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
                <span className="flex-1">Booking {bookingPrefix}{String(u.bookingNumber).padStart(5, "0")} · {u.kind === "package" ? `${num(u.credits)} credit${u.credits === 1 ? "" : "s"} of ${u.label} (${rupees(u.valuePaise)})` : `${rupees(u.amountPaise)} from wallet`}</span>
                {u.returnedAt ? <span className="font-medium text-green-700">Given back</span> : <span className="text-zinc-600">Used</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {oldPackages.length > 0 && <p className="text-xs text-zinc-600">Used up or expired: {oldPackages.map((p) => p.packageName).join(", ")}.</p>}
    </div>
  );
}
