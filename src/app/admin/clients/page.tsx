import Link from "next/link";
import { app } from "@/features/container";
import { clientAge, clientReference } from "@/features/clients/clients.dto";
import { dayRange } from "@/lib/day-range";
import { dateLabel, isoDay, phoneLabel } from "@/lib/format";
import { allowed, requirePermission } from "@/lib/session";
import { StatusBadge } from "@/components/CaseBadges";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients" };

const LIMIT = 500;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; therapist?: string; from?: string; to?: string; error?: string }> }) {
  const me = await requirePermission("clients.view", "clients.own");
  const sp = await searchParams;
  // Psychologists see only the clients they treat or have treated, read-only and without contact details.
  const everyone = allowed(me, "clients.view");
  const contact = allowed(me, "clients.contact");
  const caseStatus = me.clinicalAdmin || (["casenotes.write", "casenotes.read_all", "casenotes.pending"] as const).some((p) => allowed(me, p));
  const tz = (await app().settings.get()).timezone;
  const range = dayRange(sp.from, sp.to, tz);
  const [rows, team, therapistRoles] = await Promise.all([
    app().clients.directory({ q: sp.q, therapist: everyone ? sp.therapist : undefined, treatedBy: everyone ? undefined : me.id, ...range }),
    everyone ? app().staff.list() : Promise.resolve([]),
    app().access.rolesWith("casenotes.write"),
  ]);
  const therapists = team.filter((m) => therapistRoles.includes(m.accessRole) || rows.some((r) => r.therapistId === m.id));
  const filters = [sp.therapist, range.from || range.to].filter(Boolean).length;
  const today = isoDay(new Date(), tz);
  const href = (patch: Record<string, string>) => `?${new URLSearchParams(Object.entries({ ...sp, error: "", ...patch }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader
        title={everyone ? "Clients" : "My clients"}
        subtitle={everyone
          ? "Registered clients and their psychologists. Unpaid online booking attempts are kept in Bookings."
          : "The clients you treat or have treated. Contact details are kept with the front desk."}
        action={everyone && <Link href="/admin/clients/new" className="btn">Register new client</Link>}
      />
      <Notice error={sp.error} />
      <div className="mb-6 flex flex-wrap items-start gap-2">
        <form className="flex max-w-md flex-1 gap-2" action="/admin/clients">
          {Object.entries({ therapist: sp.therapist, from: sp.from, to: sp.to }).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
          <input className="input" name="q" defaultValue={sp.q} placeholder={contact ? "Search name, client ID, phone or email" : "Search name or client ID"} aria-label="Search clients" />
          <button className="btn-ghost" type="submit">Search</button>
        </form>
        {everyone && (
          // Used less often than search, so folded away; it stays open while a filter is on.
          <details open={filters > 0}>
            <summary className="btn-ghost cursor-pointer list-none select-none">
              Filters{filters > 0 && <span className="rounded-full bg-black px-1.5 text-[11px] font-medium text-white">{filters}</span>}
            </summary>
            <form action="/admin/clients" className="card mt-2 flex flex-wrap items-end gap-3 p-4">
              {sp.q && <input type="hidden" name="q" value={sp.q} />}
              <div>
                <label className="label" htmlFor="therapist">Psychologist</label>
                <select className="input w-auto" id="therapist" name="therapist" defaultValue={sp.therapist ?? ""}>
                  <option value="">All psychologists</option>
                  <option value="unassigned">Unassigned clients</option>
                  <optgroup label="Active">{therapists.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>
                  {therapists.some((m) => !m.active) && <optgroup label="Former">{therapists.filter((m) => !m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>}
                </select>
              </div>
              <fieldset className="flex flex-wrap items-end gap-2">
                <legend className="label">Registered between</legend>
                <input className="input w-auto" name="from" type="date" defaultValue={sp.from ?? ""} aria-label="From" />
                <span className="pb-2 text-sm text-zinc-500">to</span>
                <input className="input w-auto" name="to" type="date" defaultValue={sp.to ?? ""} aria-label="To" />
              </fieldset>
              <button className="btn" type="submit">Apply</button>
              {filters > 0 && <Link className="btn-ghost" href={href({ therapist: "", from: "", to: "" })}>Clear</Link>}
            </form>
          </details>
        )}
      </div>
      <div className="card overflow-x-auto">
        <table className="table min-w-[64rem]">
          <thead>
            <tr>
              <th>Client ID</th>
              <th>Name</th>
              <th>Occupation · location</th>
              <th>Education · marital status</th>
              <th>Registered</th>
              {contact && <th>Phone · email</th>}
              <th>Psychologist</th>
              {caseStatus && <th>Case history</th>}
              <th className="text-right">Bookings</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-zinc-600">No clients{sp.q || filters ? " match these filters" : everyone ? " yet" : " assigned to you yet"}.</td></tr>
            )}
            {rows.map((c) => {
              const age = clientAge(c, today);
              return (
                <tr key={c.id} className="row-link">
                  <td className="whitespace-nowrap font-mono text-xs text-zinc-600">{clientReference(c.number)}</td>
                  <td>
                    <Link className="row-link-target font-medium" href={`/admin/clients/${c.id}`}>{c.name}</Link>
                    <p className="text-xs text-zinc-600">{[age !== null ? `${age} yrs` : null, c.gender].filter(Boolean).join(" · ") || "—"}</p>
                  </td>
                  <td>
                    <p>{c.occupation ?? "—"}</p>
                    <p className="text-xs text-zinc-600">{c.location ?? "—"}</p>
                  </td>
                  <td>
                    <p>{c.education ?? "—"}</p>
                    <p className="text-xs text-zinc-600">{c.maritalStatus ?? "—"}</p>
                  </td>
                  <td className="whitespace-nowrap">
                    <p className="tabular-nums">{dateLabel(c.createdAt, tz)}</p>
                    <p className="text-xs text-zinc-600">{c.registeredByName ? `by ${c.registeredByName}` : "Booked online"}</p>
                  </td>
                  {contact && (
                    <td className="whitespace-nowrap">
                      <p className="tabular-nums">{c.phoneAsEntered ?? phoneLabel(c.phoneE164)}</p>
                      <p className="text-xs text-zinc-600">{c.email ?? "—"}</p>
                    </td>
                  )}
                  <td className="whitespace-nowrap">
                    {c.therapistName ? (
                      <>
                        <p>{c.therapistName}{!c.therapistActive && <span className="badge ml-1.5 border-red-300 text-red-700">Former</span>}</p>
                        {c.assignedByName && <p className="text-xs text-zinc-600">assigned by {c.assignedByName}</p>}
                      </>
                    ) : <span className="text-zinc-500">Unassigned</span>}
                  </td>
                  {caseStatus && <td>{c.caseStatus ? <StatusBadge status={c.caseStatus} /> : <span className="badge border-dashed border-zinc-300 text-zinc-500">Not started</span>}</td>}
                  <td className="text-right tabular-nums">{c.bookings}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-600">
        Showing {rows.length} client{rows.length === 1 ? "" : "s"}{rows.length === LIMIT ? `, the newest ${LIMIT}; search to find older ones` : ""}.
        {!contact && " Phone numbers and emails are hidden for your role."}
      </p>
    </>
  );
}
