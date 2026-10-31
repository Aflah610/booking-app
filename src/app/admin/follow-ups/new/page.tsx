import Link from "next/link";
import { redirect } from "next/navigation";
import { app } from "@/features/container";
import { canUseFollowUps, seesAllFollowUps } from "@/features/follow-up-desk/follow-up-desk.service";
import { isUuid } from "@/features/shared/validation";
import { phoneLabel } from "@/lib/format";
import { allowed, requireStaff } from "@/lib/session";
import { ClientPicker } from "@/components/ClientPicker";
import { Notice } from "@/components/Notice";
import { clientReference } from "@/features/clients/clients.dto";
import { PageHeader } from "@/components/Shell";
import { requestFollowUpAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New follow-up" };

export default async function NewFollowUpPage({ searchParams }: { searchParams: Promise<{ client?: string; error?: string }> }) {
  const me = await requireStaff();
  if (!canUseFollowUps(me)) redirect("/?error=forbidden");
  const sp = await searchParams;
  const all = seesAllFollowUps(me);
  // Completed sessions only; psychologists remain scoped to their own sessions.
  const [clients, psychologists] = await Promise.all([
    app().followUps.clientsOf(all ? undefined : me.id),
    all ? app().followUps.psychologists() : Promise.resolve([]),
  ]);
  const chosen = sp.client && isUuid(sp.client) ? sp.client : "";
  return (
    <>
      <Link href="/admin/follow-ups" className="text-sm text-zinc-600 hover:text-black">← Follow-ups</Link>
      <div className="mt-4">
        <PageHeader
          title="New follow-up"
          subtitle={all ? "Open a thread about a client's next session with their psychologist." : "Ask the coordinators to arrange a client's next session. They'll reply in the client's thread."}
        />
      </div>
      <Notice error={sp.error} />
      {clients.length === 0 ? (
        <p className="card max-w-2xl p-6 text-sm text-zinc-600">Clients appear here after at least one completed session. Failed attempts and sessions still to be completed are excluded.</p>
      ) : (
        <form action={requestFollowUpAction} className="card grid max-w-2xl gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="clientId">Client</label>
            <ClientPicker
              name="clientId"
              defaultValue={chosen}
              options={clients.map((c) => ({ id: c.id, label: [c.name, clientReference(c.number), allowed(me, "clients.contact") ? phoneLabel(c.phoneE164) : null].filter(Boolean).join(" · ") }))}
            />
          </div>
          {all && (
            <div className="sm:col-span-2">
              <label className="label" htmlFor="psychologistId">Psychologist</label>
              <select className="input" id="psychologistId" name="psychologistId" required defaultValue="">
                <option value="" disabled>Choose the psychologist</option>
                {psychologists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="suggestedOn">Suggested date</label>
            <input className="input" id="suggestedOn" name="suggestedOn" type="date" />
          </div>
          <div>
            <label className="label" htmlFor="partOfDay">Time of day</label>
            <select className="input" id="partOfDay" name="partOfDay" defaultValue="">
              <option value="">Any time</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="message">Message for the coordinator</label>
            <textarea className="input" id="message" name="message" rows={3} required maxLength={2000} placeholder="e.g. Please book her next week, evenings suit her better." />
            <p className="mt-1 text-xs text-zinc-500">Scheduling only. Keep clinical details in the case history.</p>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn" type="submit">{all ? "Open follow-up" : "Send to coordinators"}</button>
            <Link href="/admin/follow-ups" className="btn-ghost">Cancel</Link>
          </div>
        </form>
      )}
    </>
  );
}
