import Link from "next/link";
import { app } from "@/features/container";
import { NOTE_DUE_HOURS } from "@/features/case-history/case-history.dto";
import { dayLabel, timeLabel } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/Shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pending case notes" };

/** How long ago, in plain words: "5 h", "2 d". */
function since(from: Date, now: Date) {
  const hours = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 3600_000));
  return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

export default async function PendingCaseNotesPage({ searchParams }: { searchParams: Promise<{ staff?: string; show?: string }> }) {
  const me = await requirePermission("casenotes.pending", "casenotes.read_all");
  const sp = await searchParams;
  const now = new Date();
  const [all, s] = await Promise.all([app().caseHistory.pendingNotes(me, {}, now), app().settings.get()]);
  const tz = s.timezone;
  const onlyLate = sp.show !== "all";

  // One line per psychologist: how many notes are late and how many are still within their 24 hours.
  const people = new Map<string, { name: string; overdue: number; due: number; oldest: Date | null }>();
  for (const p of all) {
    const row = people.get(p.staffId) ?? { name: p.staffName, overdue: 0, due: 0, oldest: null };
    if (p.overdue) {
      row.overdue += 1;
      if (!row.oldest || p.dueAt < row.oldest) row.oldest = p.dueAt;
    } else row.due += 1;
    people.set(p.staffId, row);
  }
  const summary = [...people.entries()].sort((a, b) => b[1].overdue - a[1].overdue || a[1].name.localeCompare(b[1].name));
  const rows = all.filter((p) => (!sp.staff || p.staffId === sp.staff) && (!onlyLate || p.overdue));
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ staff: sp.staff, show: sp.show, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin/case-histories/pending${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Pending case notes"
        subtitle={`Psychologists write a session note within ${NOTE_DUE_HOURS} hours of each session. Sessions still without one are listed here. The notes themselves stay private to the psychologist.`}
      />

      {summary.length === 0 ? (
        <p className="card p-6 text-sm text-zinc-600">Every session has its note. Nothing pending.</p>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.map(([id, p]) => (
              <Link key={id} href={href({ staff: sp.staff === id ? undefined : id })} className={`card block p-4 hover:border-black ${sp.staff === id ? "border-black" : ""}`}>
                <p className="font-medium">{p.name}</p>
                <p className="mt-1 text-sm">
                  {p.overdue > 0 ? <span className="font-semibold text-red-700">{p.overdue} overdue</span> : <span className="text-green-700">Nothing overdue</span>}
                  {p.due > 0 && <span className="text-zinc-600"> · {p.due} due soon</span>}
                </p>
                {p.oldest && <p className="mt-0.5 text-xs text-zinc-500">Oldest late by {since(p.oldest, now)}</p>}
              </Link>
            ))}
          </div>

          <nav className="mb-4 flex gap-6 border-b border-zinc-200 text-sm" aria-label="Which sessions">
            {[["late", "Overdue"], ["all", "Overdue and due soon"]].map(([key, label]) => {
              const active = (key === "all") === !onlyLate;
              return (
                <Link key={key} href={href({ show: key === "all" ? "all" : undefined })} aria-current={active ? "page" : undefined}
                  className={`-mb-px border-b-2 pb-2.5 ${active ? "border-black font-medium text-black" : "border-transparent text-zinc-600 hover:text-black"}`}>{label}</Link>
              );
            })}
          </nav>

          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Psychologist</th><th>Client</th><th>Session</th><th>Service</th><th>Note was due</th><th>Status</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-zinc-600">Nothing {onlyLate ? "overdue" : "pending"}{sp.staff ? " for this psychologist" : ""}.</td></tr>}
                {rows.map((p) => (
                  <tr key={p.bookingId}>
                    <td className="font-medium">{p.staffName}</td>
                    <td>{p.clientName}</td>
                    <td className="whitespace-nowrap text-zinc-600">{dayLabel(p.startsAt, tz)}, {timeLabel(p.startsAt, tz)}</td>
                    <td className="text-zinc-600">{p.serviceName}</td>
                    <td className="whitespace-nowrap text-zinc-600">{dayLabel(p.dueAt, tz)}, {timeLabel(p.dueAt, tz)}</td>
                    <td>
                      {p.overdue
                        ? <span className="badge border-red-300 text-red-700">Overdue {since(p.dueAt, now)}</span>
                        : <span className="badge">Due in {since(now, p.dueAt)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
