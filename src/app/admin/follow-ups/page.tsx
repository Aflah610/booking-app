import Link from "next/link";
import { redirect } from "next/navigation";
import { app } from "@/features/container";
import { canUseFollowUps, seesAllFollowUps } from "@/features/follow-up-desk/follow-up-desk.service";
import { requireStaff } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { FOLLOW_UP_VIEWS, FollowUpList, type FollowUpView } from "./FollowUpList";

export const dynamic = "force-dynamic";
export const metadata = { title: "Follow-ups" };

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ view?: string; error?: string; ok?: string }> }) {
  const me = await requireStaff();
  if (!canUseFollowUps(me)) redirect("/?error=forbidden");
  const sp = await searchParams;
  const view: FollowUpView = sp.view && sp.view in FOLLOW_UP_VIEWS ? (sp.view as FollowUpView) : "open";
  const all = seesAllFollowUps(me);
  const [rows, s] = await Promise.all([app().followUps.list(me, { view }), app().settings.get()]);
  return (
    <>
      <AutoRefresh />
      <PageHeader
        title="Follow-ups"
        subtitle={all
          ? "Psychologists ask here for a client's next session. Talk it through in each client's thread, then book it."
          : "Ask the coordinators to arrange a client's next session, and talk it through in the client's thread."}
        action={<Link href="/admin/follow-ups/new" className="btn">New follow-up</Link>}
      />
      <Notice error={sp.error} ok={sp.ok} />
      <div className="grid gap-6 lg:h-[calc(100vh-13rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <FollowUpList rows={rows} view={view} tz={s.timezone} showPsychologist={all} />
        <div className="card hidden place-items-center p-10 text-center text-sm text-zinc-600 lg:grid">
          <div>
            <p className="font-medium text-black">Choose a client on the left</p>
            <p className="mt-1">Each client has one thread with everything said about their follow-up.</p>
          </div>
        </div>
      </div>
    </>
  );
}
