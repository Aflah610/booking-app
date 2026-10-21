import Link from "next/link";
import { app } from "@/features/container";
import type { CaseListFilters, CaseStatus } from "@/features/case-history/case-history.dto";
import { LABEL, RISK, type Risk } from "@/features/case-history/choices";
import { clientReference } from "@/features/clients/clients.dto";
import { dateLabel } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { Initials, RiskBadge, StatusBadge } from "@/components/CaseBadges";

export const dynamic = "force-dynamic";
export const metadata = { title: "Case histories" };

const CHIPS: [string, string][] = [["", "All"], ["intake_pending", "Intake pending"], ["in_treatment", "In treatment"], ["concluded", "Concluded"], ["high_risk", "High risk"]];

export default async function CaseHistoriesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; therapist?: string; risk?: string }> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const risk = RISK.includes(sp.risk as Risk) ? (sp.risk as Risk) : undefined;
  const base: CaseListFilters = { q: sp.q, therapist: sp.therapist || undefined, risk };
  const [rows, team, s] = await Promise.all([app().caseHistory.list(me, base), app().staff.list(), app().settings.get()]);
  const statusOf = (key: string) => (r: (typeof rows)[number]) => !key || (key === "high_risk" ? r.risk === "high" : r.status === (key as CaseStatus));
  const status = CHIPS.some(([k]) => k === sp.status) ? sp.status ?? "" : "";
  const shown = rows.filter(statusOf(status));
  const href = (patch: Record<string, string>) => `?${new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Case histories</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Intake, diagnosis, risk and session notes. {me.clinicalAdmin ? "As a clinical admin you see every record." : "You can open the records of the clients you treat."}
        </p>
      </div>

      <nav className="tabs" aria-label="Status">
        {CHIPS.map(([key, label]) => (
          <Link key={key} href={href({ status: key })} className={`tab ${status === key ? "tab-active" : ""}`} aria-current={status === key ? "page" : undefined}>
            {label} <span className="tabular-nums text-zinc-500">{rows.filter(statusOf(key)).length}</span>
          </Link>
        ))}
      </nav>

      <form className="mb-4 flex flex-wrap gap-2.5" action="">
        {status && <input type="hidden" name="status" value={status} />}
        <input className="input max-w-sm flex-1" name="q" defaultValue={sp.q ?? ""} placeholder="Search name, client ID or phone" aria-label="Search" />
        <select className="input w-auto" name="therapist" defaultValue={sp.therapist ?? ""} aria-label="Therapist">
          <option value="">All therapists</option>
          <option value="unassigned">Unassigned</option>
          <optgroup label="Active">{team.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>
          {team.some((m) => !m.active) && <optgroup label="Former">{team.filter((m) => !m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
        </select>
        <select className="input w-auto" name="risk" defaultValue={risk ?? ""} aria-label="Risk">
          <option value="">Any risk</option>
          {[...RISK].reverse().map((r) => <option key={r} value={r}>{LABEL[r]}</option>)}
        </select>
        <button className="btn-ghost" type="submit">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="table min-w-[56rem]">
          <thead>
            <tr><th>Client</th><th>Status</th><th>Primary diagnosis</th><th>Risk</th><th>Therapist</th><th>Last session note</th><th><span className="sr-only">Open</span></th></tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-zinc-600">No clients match.</td></tr>}
            {shown.map((r) => (
              <tr key={r.clientId}>
                <td>
                  <p className="font-medium">{r.clientName}</p>
                  <p className="font-mono text-xs text-zinc-600">{clientReference(r.clientNumber)}</p>
                </td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  {r.restricted ? <span className="text-zinc-500">Restricted</span> : r.diagnosisLabel ? (
                    <>
                      <p>{r.diagnosisLabel}</p>
                      {r.diagnosisCode && <p className="text-xs text-zinc-600">{r.diagnosisCode}</p>}
                    </>
                  ) : <span className="text-zinc-500">Not yet assessed</span>}
                </td>
                <td><RiskBadge risk={r.risk} /></td>
                <td>
                  {r.therapistName ? (
                    <span className="flex items-center gap-2">
                      <Initials name={r.therapistName} muted={!r.therapistActive} />
                      {r.therapistName}
                      {!r.therapistActive && <span className="badge border-red-300 text-red-700">Former</span>}
                    </span>
                  ) : <span className="text-zinc-500">Unassigned</span>}
                </td>
                <td>
                  <p className="tabular-nums">{r.notes === 0 ? "No notes" : `${r.notes} session${r.notes === 1 ? "" : "s"}`}</p>
                  {r.lastNoteAt && <p className="text-xs text-zinc-600">{dateLabel(r.lastNoteAt, s.timezone)}{r.lastNoteAuthor ? ` · by ${r.lastNoteAuthor}` : ""}</p>}
                </td>
                <td className="text-right">
                  {r.restricted ? <Link className="btn-ghost" href={`/admin/clients/${r.clientId}`}>Client</Link> : <Link className="btn-ghost" href={`/admin/case-histories/${r.clientId}`}>Open</Link>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-600">Showing {shown.length} of {rows.length}. Diagnosis and notes are shown only to the client&apos;s therapist and clinical admins.</p>
    </>
  );
}
