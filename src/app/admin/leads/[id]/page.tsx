import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/features/container";
import { LEAD_SOURCE_LABEL, LEAD_STATUSES, LEAD_STATUS_LABEL, LOST_REASONS, LOST_REASON_LABEL } from "@/features/leads/leads.dto";
import { isDomainError } from "@/features/shared/errors";
import { dateLabel, dayLabel, phoneLabel, timeLabel } from "@/lib/format";
import { allowed, requireStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { reassignLeadAction, updateLeadAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead" };

/** The client books on the website; this is the link a salesperson sends them on WhatsApp. */
const BOOKING_LINK = process.env.WEBSITE_BOOKING_URL ?? "https://mindlap.in/book/";

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const l = await app().leads.get(me, id).catch((err) => {
    if (isDomainError(err)) notFound();
    throw err;
  });
  const manager = allowed(me, "leads.all");
  const [team, s] = await Promise.all([manager ? app().leads.assignable() : Promise.resolve([]), app().settings.get()]);
  const tz = s.timezone;
  const first = l.clientName.split(/\s+/)[0];
  const chat = (text?: string) => `https://wa.me/${l.clientPhone.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  const closed = l.status === "converted" || l.status === "lost";

  return (
    <>
      <Link href="/admin/leads" className="text-sm text-zinc-600 hover:text-black">← Leads</Link>
      <div className="mb-6 mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{l.clientName}</h1>
            <span className="badge">{LEAD_STATUS_LABEL[l.status]}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            {phoneLabel(l.clientPhone)} · {LEAD_SOURCE_LABEL[l.source]} · came in {dayLabel(l.createdAt, tz)}, {timeLabel(l.createdAt, tz)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href={chat()} target="_blank" rel="noopener">Open WhatsApp chat</a>
          <a className="btn-ghost" href={`tel:${l.clientPhone}`}>Call</a>
          <a className="btn-ghost" href={chat(`Hi ${first}, you can choose a psychologist and a time that suits you here: ${BOOKING_LINK}`)} target="_blank" rel="noopener">Send booking link</a>
        </div>
      </div>
      <Notice error={sp.error} ok={sp.ok} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form action={updateLeadAction.bind(null, l.id)} className="card grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select className="input" id="status" name="status" defaultValue={l.status}>
              {LEAD_STATUSES.map((st) => <option key={st} value={st}>{LEAD_STATUS_LABEL[st]}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="followUpOn">Follow up on</label>
            <input className="input" id="followUpOn" name="followUpOn" type="date" defaultValue={l.followUpOn ?? ""} />
          </div>
          <div>
            <label className="label" htmlFor="lostReason">If lost, why</label>
            <select className="input" id="lostReason" name="lostReason" defaultValue={l.lostReason ?? ""}>
              <option value="">–</option>
              {LOST_REASONS.map((r) => <option key={r} value={r}>{LOST_REASON_LABEL[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="dealAmount">If converted, amount (₹)</label>
            <input className="input" id="dealAmount" name="dealAmount" type="number" min={0} step="1" inputMode="numeric"
              defaultValue={l.dealAmountPaise != null ? Math.round(l.dealAmountPaise / 100) : ""} placeholder={l.dealWhat ? "Filled in from the booking" : "e.g. 5400"} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="dealNote">If converted, what they bought</label>
            <input className="input" id="dealNote" name="dealNote" defaultValue={l.dealNote ?? ""} placeholder={l.dealWhat ?? "e.g. 4-session package, paid by UPI"} />
            <p className="mt-1.5 text-xs text-zinc-600">A booking or payment on the website converts the lead and fills this in by itself. Use these for deals closed by phone or cash.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">Notes</label>
            <textarea className="input" id="notes" name="notes" rows={5} defaultValue={l.notes ?? ""} placeholder="What they are looking for, what was offered, when to call back" />
          </div>
          <div className="sm:col-span-2"><button className="btn" type="submit">Save</button></div>
        </form>

        <aside className="grid content-start gap-4">
          <dl className="card grid gap-3 p-5 text-sm">
            <div><dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Assigned to</dt><dd className="mt-1 font-medium">{l.assignedName ?? "Nobody yet"}</dd></div>
            {l.adHeadline && <div><dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Ad</dt><dd className="mt-1">{l.adUrl ? <a className="underline" href={l.adUrl} target="_blank" rel="noopener">{l.adHeadline}</a> : l.adHeadline}</dd></div>}
            {l.lastMessageAt && <div><dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Last message</dt><dd className="mt-1">{dayLabel(l.lastMessageAt, tz)}, {timeLabel(l.lastMessageAt, tz)}</dd></div>}
            {closed && l.closedAt && <div><dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Closed</dt><dd className="mt-1">{dateLabel(l.closedAt, tz)}</dd></div>}
            {l.status === "converted" && (l.dealWhat || l.dealAmountPaise != null) && (
              <div><dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Deal</dt><dd className="mt-1">{[l.dealWhat ?? l.dealNote, l.dealAmountPaise != null ? `₹${(l.dealAmountPaise / 100).toLocaleString("en-IN")}` : null].filter(Boolean).join(" · ")}</dd></div>
            )}
            {l.status === "lost" && l.lostReason && <div><dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Lost because</dt><dd className="mt-1">{LOST_REASON_LABEL[l.lostReason]}</dd></div>}
            {manager && <div><Link className="underline" href={`/admin/clients/${l.clientId}`}>Client record →</Link></div>}
          </dl>
          {manager && (
            <form action={reassignLeadAction.bind(null, l.id)} className="card grid gap-3 p-5">
              <label className="label" htmlFor="staffId">Reassign to</label>
              <select className="input" id="staffId" name="staffId" defaultValue={l.assignedTo ?? ""} required>
                <option value="" disabled>Choose someone</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}{m.designation ? ` · ${m.designation}` : ""}</option>)}
              </select>
              <button className="btn-ghost" type="submit">Reassign</button>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
