import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { app } from "@/features/container";
import { PARTS_OF_DAY, REQUEST_STATUSES, REQUEST_STATUS_LABEL } from "@/features/follow-up-desk/follow-up-desk.dto";
import { canUseFollowUps, seesAllFollowUps } from "@/features/follow-up-desk/follow-up-desk.service";
import { isDomainError } from "@/features/shared/errors";
import { dateLabel, dayLabel, phoneLabel, timeLabel } from "@/lib/format";
import { allowed, requireStaff } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Notice } from "@/components/Notice";
import { postFollowUpMessageAction, setFollowUpStatusAction } from "../actions";
import { FOLLOW_UP_VIEWS, FollowUpList, type FollowUpView } from "../FollowUpList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Follow-up" };

const PART_LABEL: Record<(typeof PARTS_OF_DAY)[number], string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

export default async function FollowUpPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; error?: string; ok?: string }> }) {
  const me = await requireStaff();
  if (!canUseFollowUps(me)) redirect("/?error=forbidden");
  const { id } = await params;
  const sp = await searchParams;
  const view: FollowUpView = sp.view && sp.view in FOLLOW_UP_VIEWS ? (sp.view as FollowUpView) : "open";
  const all = seesAllFollowUps(me);
  const { request: r, messages } = await app().followUps.open(me, id).catch((err) => {
    if (isDomainError(err)) notFound();
    throw err;
  });
  const [rows, s] = await Promise.all([app().followUps.list(me, { view }), app().settings.get()]);
  const tz = s.timezone;
  const closed = r.status === "booked" || r.status === "declined";
  const when = [r.suggestedOn && dateLabel(new Date(`${r.suggestedOn}T12:00:00Z`), "UTC"), r.partOfDay && PART_LABEL[r.partOfDay]].filter(Boolean).join(" · ");
  const bookHref = `/admin/bookings/new?${new URLSearchParams({ client: r.clientId, staff: r.psychologistId, ...(r.suggestedOn ? { date: r.suggestedOn } : {}) })}`;

  return (
    <>
      <AutoRefresh />
      <Link href={`/admin/follow-ups?view=${view}`} className="text-sm text-zinc-600 hover:text-black lg:hidden">← Follow-ups</Link>
      <div className="mt-4 grid gap-6 lg:mt-0 lg:h-[calc(100vh-8rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="hidden min-h-0 lg:flex lg:flex-col">
          <FollowUpList rows={rows} view={view} activeId={r.id} tz={tz} showPsychologist={all} />
        </div>

        <section className="card flex min-h-[32rem] flex-col overflow-hidden" aria-label={`Follow-up for ${r.clientName}`}>
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{r.clientName}</h1>
              <p className="text-sm text-zinc-600">
                {allowed(me, "clients.contact") && <>{phoneLabel(r.clientPhone)} · </>}with {r.psychologistName}
                {when && <> · suggested {when}</>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {all ? (
                <form action={setFollowUpStatusAction.bind(null, r.id)} className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="status">Status</label>
                  <select className="input w-auto py-1.5 text-sm" id="status" name="status" defaultValue={r.status}>
                    {REQUEST_STATUSES.map((st) => <option key={st} value={st}>{REQUEST_STATUS_LABEL[st]}</option>)}
                  </select>
                  <button className="btn-ghost text-sm" type="submit">Update</button>
                </form>
              ) : (
                <span className="badge">{REQUEST_STATUS_LABEL[r.status]}</span>
              )}
              {r.bookingId ? (
                <Link className="btn-ghost text-sm" href={`/admin/bookings/${r.bookingId}`}>View booking</Link>
              ) : (
                allowed(me, "bookings.create") && !closed && <Link className="btn text-sm" href={bookHref}>Book session</Link>
              )}
            </div>
          </header>

          <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-zinc-50 px-5 py-4" aria-label="Messages">
            {messages.map((m) => {
              const mine = m.authorId === me.id;
              return (
                <li key={m.id} className={`flex max-w-[85%] flex-col ${mine ? "self-end items-end" : "self-start items-start"}`}>
                  <span className="mb-1 text-xs text-zinc-500">
                    {mine ? "You" : m.authorName}{m.authorDesignation ? ` · ${m.authorDesignation}` : ""} · {dayLabel(m.createdAt, tz)}, {timeLabel(m.createdAt, tz)}
                  </span>
                  <p className={`whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${mine ? "bg-black text-white" : "border border-zinc-200 bg-white"}`}>{m.body}</p>
                </li>
              );
            })}
            {r.status === "booked" && <li className="self-center text-xs text-zinc-500">Session booked. This follow-up is closed.</li>}
          </ol>

          <form action={postFollowUpMessageAction.bind(null, r.id)} className="border-t border-zinc-200 p-3">
            <Notice error={sp.error} />
            <div className="flex items-end gap-2">
              <label className="sr-only" htmlFor="body">Message</label>
              <textarea className="input min-h-[2.75rem] flex-1 resize-y" id="body" name="body" rows={2} maxLength={2000} required placeholder="Write about times and arrangements…" />
              <button className="btn" type="submit">Send</button>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">Only scheduling here. Clinical details stay in the case history, which coordinators can&apos;t see.</p>
          </form>
        </section>
      </div>
    </>
  );
}
