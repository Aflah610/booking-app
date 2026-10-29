import Link from "next/link";
import { app } from "@/features/container";
import { EDIT_SECTIONS } from "@/features/case-history/case-history.dto";
import { clientReference } from "@/features/clients/clients.dto";
import { dateLabel } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { PageHeader } from "@/components/Shell";
import { Notice } from "@/components/Notice";
import { reviewIntakeEditAction } from "../case-histories/actions";

export default async function EditRequestsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireStaff();
  const review = app().caseHistory.canReviewEdits(me);
  const [rows, settings, sp] = await Promise.all([app().caseHistory.editRequests(me), app().settings.get(), searchParams]);
  return <>
    <PageHeader title={review ? "Case history edit requests" : "My edit requests"} subtitle="Managers approve corrections. Psychologists make the approved change; admins can see the request and decision history." />
    <Notice ok={sp.ok} error={sp.error} />
    {!rows.length && <p className="card p-6 text-zinc-600">No edit requests yet.</p>}
    <div className="grid gap-4">
      {rows.map((r) => <section key={r.id} className="card grid gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{r.clientName} <span className="font-mono text-xs text-zinc-600">{clientReference(r.clientNumber)}</span></h2><span className="badge">{r.status}</span></div>
        <p className="text-sm text-zinc-600">{r.requesterName} · {EDIT_SECTIONS[r.step]} · {dateLabel(r.createdAt, settings.timezone)}</p>
        <p className="whitespace-pre-wrap text-sm">{r.reason}</p>
        {r.reviewerName && <p className="text-sm text-zinc-600">{r.reviewerName}: {r.decisionReason}{r.expiresAt && r.status === "approved" ? ` · approval expires ${r.expiresAt.toLocaleString("en-GB", { timeZone: settings.timezone })}` : ""}</p>}
        {review && r.status === "pending" && <form action={reviewIntakeEditAction.bind(null, r.id)} className="grid max-w-xl gap-3">
          <label className="label" htmlFor={`decision-${r.id}`}>Decision reason</label>
          <input className="input" id={`decision-${r.id}`} name="reason" required maxLength={1000} placeholder="Explain the approval or rejection. Do not copy clinical notes." />
          <div className="flex gap-2"><button className="btn" name="decision" value="approve">Approve one correction</button><button className="btn-ghost" name="decision" value="reject">Reject</button></div>
        </form>}
        {!review && r.status === "approved" && <Link className="btn-ghost justify-self-start" href={`/admin/case-histories/${r.clientId}/intake?step=${r.step}`}>Make approved correction</Link>}
      </section>)}
    </div>
    <p className="mt-4 text-xs text-zinc-500">Pending requests appear first. Up to 200 requests are shown. Clinical records and previous clinical values are kept out of this queue.</p>
  </>;
}
