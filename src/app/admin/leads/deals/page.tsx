import Link from "next/link";
import { redirect } from "next/navigation";
import { app } from "@/features/container";
import { DEAL_PENDING_HOURS, DEAL_STAGES, DEAL_STAGE_LABEL, type DealStage } from "@/features/leads/leads.dto";
import { canUseLeads } from "@/features/leads/leads.service";
import { dayLabel, phoneLabel, timeLabel } from "@/lib/format";
import { allowed, requireStaff } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Board, type BoardColumn } from "@/components/Board";
import { PageHeader } from "@/components/Shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deals" };

const TONE: Record<DealStage, BoardColumn["tone"]> = { pending: "amber", won: "emerald", lost: "red" };
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** Website visitors who tried to book: Payment pending for 48 hours, then Closed lost; paid = Closed won. */
export default async function DealsPage() {
  const me = await requireStaff();
  if (!canUseLeads(me)) redirect("/?error=forbidden");
  const [deals, s] = await Promise.all([app().leads.websiteDeals(me), app().settings.get()]);
  const tz = s.timezone;
  const contact = allowed(me, "clients.contact");
  const bookings = allowed(me, "bookings.all");
  const columns = DEAL_STAGES.map((stage) => {
    const rows = deals.filter((d) => d.stage === stage);
    return {
      key: stage,
      title: DEAL_STAGE_LABEL[stage],
      tone: TONE[stage],
      count: rows.length,
      total: rupees(rows.reduce((sum, d) => sum + (d.amountPaise ?? 0), 0)),
      empty: stage === "pending" ? "Nobody is waiting to pay." : "Nothing here.",
      cards: rows.slice(0, 150).map((d) => {
        const href = bookings ? `/admin/bookings/${d.bookingId}` : d.leadId ? `/admin/leads/${d.leadId}` : null;
        const body = (
          <>
            <p className="truncate font-semibold">{d.clientName || phoneLabel(d.clientPhone)}</p>
            <p className="truncate text-zinc-600">{d.serviceName} · {d.staffName}</p>
            <p className="font-medium tabular-nums">{d.amountPaise != null ? rupees(d.amountPaise) : "–"}</p>
            <p className="text-xs text-zinc-600">Tried {dayLabel(d.createdAt, tz)}, {timeLabel(d.createdAt, tz)}</p>
            {contact && <p className="text-xs tabular-nums text-zinc-600">{phoneLabel(d.clientPhone)}</p>}
          </>
        );
        return href
          ? <Link key={d.bookingId} href={href} className="card block p-3 text-sm hover:border-zinc-400">{body}</Link>
          : <div key={d.bookingId} className="card p-3 text-sm">{body}</div>;
      }),
    };
  });
  return (
    <>
      <Link href="/admin/leads" className="text-sm text-zinc-600 hover:text-black">← Leads</Link>
      <div className="mt-4">
        <PageHeader title="Deals" subtitle={`People who tried to book on the website. Not paid: Payment pending for ${DEAL_PENDING_HOURS} hours, then Closed lost. Paid: Closed won.`} />
      </div>
      <AutoRefresh seconds={60} />
      <Board columns={columns} />
    </>
  );
}
