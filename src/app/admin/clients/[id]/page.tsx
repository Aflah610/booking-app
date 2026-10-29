import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/features/container";
import { clientStatus, type ClientStatus } from "@/features/clients/client-status";
import { clientAge, clientReference, type ClientDTO } from "@/features/clients/clients.dto";
import { isDomainError } from "@/features/shared/errors";
import { allowed, isFrontDesk } from "@/lib/session";
import { requireClientAccess } from "@/lib/client-access";
import { BookingRow } from "@/components/BookingRow";
import { ClientCredits } from "@/components/ClientCredits";
import { Notice } from "@/components/Notice";
import { assignTherapistAction } from "../../actions";
import { RiskBadge, StatusBadge } from "@/components/CaseBadges";
import type { CaseHistoryService } from "@/features/case-history/case-history.service";
import { LABEL } from "@/features/case-history/choices";
import { dateLabel, dayLabel, isoDay, phoneLabel, timeLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const TABS = { case: "Case history", bookings: "Bookings", credits: "Credits" } as const;
const BOOKING_VIEWS = { upcoming: "Upcoming", past: "Past", cancelled: "Cancelled" } as const;
const STATUS_LABEL: Record<ClientStatus, string> = { not_started: "Not started", in_therapy: "In therapy", concluded: "Concluded" };

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; tab?: string; bookings?: string }>;
}) {
  const { id } = await params;
  const me = await requireClientAccess(id);
  // Psychologists open their own clients read-only, without contact details.
  const manages = allowed(me, "clients.view");
  const contact = allowed(me, "clients.contact");
  const canCredits = allowed(me, "packages.manage");
  const sp = await searchParams;
  const tab = sp.tab && sp.tab in TABS && (sp.tab !== "credits" || canCredits) ? (sp.tab as keyof typeof TABS) : "case";
  const view = sp.bookings && sp.bookings in BOOKING_VIEWS ? (sp.bookings as keyof typeof BOOKING_VIEWS) : "upcoming";
  const { clients, bookings, settings, staff } = app();
  const c = await clients.get(id).catch((err) => {
    if (isDomainError(err)) notFound();
    throw err;
  });
  const [history, s, periods, team, caseView, therapistRoles] = await Promise.all([
    bookings.list({ view: "all", clientId: id, staffId: isFrontDesk(me) ? undefined : me.id, limit: 200 }),
    settings.get(),
    clients.therapistHistory(id),
    staff.list(),
    app().caseHistory.overview(me, id),
    app().access.rolesWith("casenotes.write"),
  ]);
  const tz = s.timezone;
  const now = new Date();
  const byView = {
    upcoming: history.filter((b) => b.status === "upcoming" && b.startsAt >= now),
    past: history.filter((b) => b.status !== "cancelled" && b.startsAt < now).reverse(),
    cancelled: history.filter((b) => b.status === "cancelled").reverse(),
  };
  const next = byView.upcoming[0];
  const current = periods[0] && !periods[0].endsAt ? periods[0] : null;
  // The reason and who made a change are stored on the period that replaced the old one (the next newer row).
  const previous = periods.slice(current ? 1 : 0).map((p) => ({ ...p, replacedBy: periods[periods.indexOf(p) - 1] ?? null }));
  const registeredBy = c.registeredBy ? team.find((m) => m.id === c.registeredBy)?.name : null;
  const assignable = team.filter((m) => m.active && m.id !== current?.staffId && therapistRoles.includes(m.accessRole));
  // Anyone with the clients list may assign the first psychologist; changing one is for managers.
  const canAssign = allowed(me, "clients.reassign");
  const age = clientAge(c, isoDay(now, tz));

  const keyRows: [string, string | null][] = [
    ["Age · gender", [age !== null ? String(age) : null, c.gender].filter(Boolean).join(" · ") || null],
    ["Occupation", c.occupation],
    ["Location", c.location],
    ...(contact ? ([["Email", c.email], ["Emergency", emergency(c)]] as [string, string | null][]) : []),
  ];
  const moreRows: [string, string | null][] = [
    ["Date of birth", c.dateOfBirth ? dateLabel(new Date(`${c.dateOfBirth}T12:00:00Z`), "UTC") : null],
    ["Marital status", c.maritalStatus],
    ["Education", c.education],
    ...(contact ? ([["Address", c.address]] as [string, string | null][]) : []),
    ["Languages", c.languages],
    ["WhatsApp", c.whatsappOptIn ? "Updates on" : "Updates off"],
    ["Registered", `${dateLabel(c.createdAt, tz)}${registeredBy ? ` by ${registeredBy}` : ""}`],
    ["Found us via", c.referralSource],
    // Shown only when it differs from the client ID (MCH clients keep their MCH number as the ID).
    ["MCH code", c.mchCode && c.mchCode !== clientReference(c.number) ? c.mchCode : null],
    ["Consent", c.consentSignedAt ? `Signed ${dateLabel(c.consentSignedAt, tz)}` : null],
    ["Notes", c.notes],
  ];

  return (
    <>
      <Link href="/admin/clients" className="text-sm text-zinc-600 hover:text-black">← Clients</Link>
      <div className="mt-4">
        <Notice error={sp.error} ok={sp.ok} />
      </div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section className="min-w-0">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
                <span className="badge">{STATUS_LABEL[clientStatus(history, now)]}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-600">
                Client since {dateLabel(c.createdAt, tz)}
                {next && <> · next session {dayLabel(next.startsAt, tz)}, {timeLabel(next.startsAt, tz)}</>}
              </p>
            </div>
            {allowed(me, "bookings.create") && <Link href={`/admin/bookings/new?${new URLSearchParams({ client: id, ...(current ? { staff: current.staffId } : {}) })}`} className="btn">New booking</Link>}
          </div>

          <nav className="tabs" aria-label="Client sections">
            {Object.entries(TABS).filter(([key]) => key !== "credits" || canCredits).map(([key, label]) => (
              <Link key={key} href={`?tab=${key}`} className={`tab ${tab === key ? "tab-active" : ""}`} aria-current={tab === key ? "page" : undefined}>{label}</Link>
            ))}
          </nav>

          {tab === "case" && <CaseOverview view={caseView} clientId={id} tz={tz} />}

          {tab === "bookings" && (
            <>
              <nav className="mb-4 flex gap-6 border-b border-zinc-200 text-sm" aria-label="Which bookings">
                {Object.entries(BOOKING_VIEWS).map(([key, label]) => (
                  <Link key={key} href={`?tab=bookings&bookings=${key}`} aria-current={view === key ? "page" : undefined}
                    className={`-mb-px border-b-2 pb-2.5 ${view === key ? "border-black font-medium text-black" : "border-transparent text-zinc-600 hover:text-black"}`}>
                    {label} <span className="tabular-nums text-zinc-500">{byView[key as keyof typeof byView].length}</span>
                  </Link>
                ))}
              </nav>
              <div className="card divide-y divide-zinc-100 overflow-hidden">
                {byView[view].length === 0 && <p className="p-8 text-center text-sm text-zinc-600">No {BOOKING_VIEWS[view].toLowerCase()} bookings.</p>}
                {byView[view].map((b) => <BookingRow key={b.id} b={b} tz={tz} prefix={s.bookingPrefix} showClient={false} />)}
              </div>
            </>
          )}

          {tab === "credits" && canCredits && <ClientCredits clientId={id} tz={tz} bookingPrefix={s.bookingPrefix} />}
        </section>

        <aside className="grid content-start gap-8 lg:border-l lg:border-zinc-200 lg:pl-8">
          <dl className="grid grid-cols-2 gap-3">
            <div className="card px-4 py-3">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Client ID</dt>
              <dd className="mt-1 font-mono text-[15px] font-semibold">{clientReference(c.number)}</dd>
            </div>
            <div className="card px-4 py-3">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Phone</dt>
              <dd className="mt-1 whitespace-nowrap text-[15px] font-semibold tabular-nums">{contact ? c.phoneAsEntered ?? phoneLabel(c.phoneE164) : <span className="font-normal text-zinc-500">Hidden</span>}</dd>
            </div>
          </dl>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">General info</h2>
              {manages && <Link href={`/admin/clients/${id}/edit`} className="text-sm text-black underline-offset-4 hover:underline">Edit</Link>}
            </div>
            <InfoRows rows={keyRows} />
            <details className="group mt-3">
              <summary className="cursor-pointer list-none text-sm font-medium underline underline-offset-4 group-open:mb-3">
                <span className="group-open:hidden">Show all details</span>
                <span className="hidden group-open:inline">Show less</span>
              </summary>
              <InfoRows rows={moreRows} />
            </details>
          </section>

          <section className="border-t border-zinc-200 pt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Assigned psychologist</h2>
            </div>
            {current ? (
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black text-xs font-semibold text-white">{initials(current.staffName)}</span>
                <div className="min-w-0">
                  <p className="font-semibold">{current.staffName}</p>
                  <p className="text-sm text-zinc-600">{current.designation ? `${current.designation} · ` : ""}since {dateLabel(current.startsAt, tz)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-600">No psychologist assigned yet.</p>
            )}

            {!canAssign && manages && <p className="mt-3 text-xs text-zinc-500">Only admins and managers can assign or change the psychologist.</p>}
            {canAssign && <details className="mt-4">
              <summary className="cursor-pointer list-none text-sm font-medium underline underline-offset-4">{current ? "Reassign" : "Assign a psychologist"}</summary>
              <form action={assignTherapistAction.bind(null, id)} className="mt-3 grid gap-3 rounded-lg border border-zinc-200 p-3">
                <div>
                  <label className="label" htmlFor="staffId">Psychologist</label>
                  <select className="input" id="staffId" name="staffId" required>
                    {assignable.map((m) => <option key={m.id} value={m.id}>{m.name}{m.designation ? ` · ${m.designation}` : ""}</option>)}
                  </select>
                </div>
                {current && (
                  <div>
                    <label className="label" htmlFor="reason">Reason</label>
                    <input className="input" id="reason" name="reason" required placeholder="e.g. psychologist left the firm" />
                  </div>
                )}
                <div><button className="btn" type="submit" disabled={assignable.length === 0}>{current ? "Reassign" : "Assign"}</button></div>
              </form>
            </details>}

            {previous.length > 0 && (
              <div className="mt-6">
                <p className="mb-2.5 text-xs text-zinc-500">Previously</p>
                <ol className="grid gap-3 border-l border-zinc-300 pl-3.5">
                  {previous.map((p) => (
                    <li key={p.id}>
                      <p className="text-sm font-medium">{p.staffName}{!p.staffActive && <span className="font-normal text-zinc-500"> · former staff</span>}</p>
                      <p className="text-sm text-zinc-600">{dateLabel(p.startsAt, tz)} – {p.endsAt ? dateLabel(p.endsAt, tz) : "now"} · {p.sessions} session{p.sessions === 1 ? "" : "s"}</p>
                      {p.replacedBy && (
                        <p className="text-sm text-zinc-600">
                          Reassigned{p.replacedBy.assignedByName ? ` by ${p.replacedBy.assignedByName}` : ""}{p.replacedBy.reason ? `: ${p.replacedBy.reason}` : ""}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function InfoRows({ rows }: { rows: [string, string | null][] }) {
  return (
    <dl className="grid gap-2.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
          <dt className="text-zinc-600">{label}</dt>
          <dd className={`break-words ${value ? "" : "text-zinc-400"}`}>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function emergency(c: ClientDTO): string | null {
  const who = [c.emergencyName, c.emergencyRelation ? `(${c.emergencyRelation})` : null].filter(Boolean).join(" ");
  return [who, c.emergencyPhone ? phoneLabel(c.emergencyPhone) : null].filter(Boolean).join(" · ") || null;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

function CaseOverview({ view, clientId, tz }: { view: Awaited<ReturnType<CaseHistoryService["overview"]>>; clientId: string; tz: string }) {
  const link = `/admin/case-histories/${clientId}`;
  if (view.restricted) {
    return (
      <div className="card grid gap-3 p-5">
        {view.status ? (
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={view.status} />{view.risk && <RiskBadge risk={view.risk} prefix="Risk: " />}</div>
        ) : (
          <p className="font-medium">No case history has been started yet</p>
        )}
        <p className="text-sm text-zinc-600">Diagnosis and session notes are visible only to the client&apos;s therapist and clinical admins.</p>
      </div>
    );
  }
  const r = view.record;
  if (!r || (!r.presentingComplaints && !r.diagnosisLabel && r.notes.length === 0)) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="font-medium">No case history yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-600">Start with the intake: presenting problem, history, mental status, risk, diagnosis and plan.</p>
        <Link href={`${link}/intake?step=1`} className="btn mt-4">Start intake</Link>
      </div>
    );
  }
  const last = r.notes[0];
  return (
    <section className="card grid gap-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h2 className="font-semibold">{LABEL[r.status]}</h2>{r.risk && <RiskBadge risk={r.risk} prefix="Risk: " />}</div>
          <p className="text-sm text-zinc-600">{r.notes.length} session note{r.notes.length === 1 ? "" : "s"}{r.intakeCompletedAt ? ` · intake completed ${dateLabel(r.intakeCompletedAt, tz)}` : " · intake in progress"}</p>
        </div>
        <Link href={link} className="btn-ghost">View case history →</Link>
      </div>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div><dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Diagnosis</dt><dd className="mt-1 text-sm font-medium">{r.diagnosisLabel ?? "Not yet"}{r.diagnosisCode && <span className="ml-1.5 font-normal text-zinc-600">{r.diagnosisCode}</span>}</dd></div>
        <div><dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Approach</dt><dd className="mt-1 text-sm font-medium">{[r.approach, r.frequency].filter(Boolean).join(", ") || "Not set"}</dd></div>
        <div><dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Cooperation</dt><dd className="mt-1 text-sm font-medium">{r.mseCooperation ? LABEL[r.mseCooperation] : "Not recorded"}</dd></div>
      </dl>
      {last && (
        <div className="rounded-lg bg-zinc-50 px-4 py-3 text-sm">
          <p className="mb-1 text-xs text-zinc-600">Last note · session {last.number} · {dateLabel(last.sessionAt, tz)} · {last.authorName}</p>
          <p className="line-clamp-2">{last.summary}</p>
        </div>
      )}
    </section>
  );
}
