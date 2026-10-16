import { app } from "@/features/container";
import { requireStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import { updateSettingsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requireStaff("admin");
  const { error, ok } = await searchParams;
  const s = await app().settings.get();
  return (
    <>
      <PageHeader title="Settings" subtitle="Firm-wide defaults. A service can override the booking rules." />
      <Notice error={error} ok={ok} />
      <form action={updateSettingsAction} className="grid max-w-3xl gap-6">
        <section className="card grid gap-4 p-6 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Firm</h2>
          <div><label className="label" htmlFor="name">Firm name</label><input className="input" id="name" name="name" defaultValue={s.name} required /></div>
          <div><label className="label" htmlFor="timezone">Time zone</label><TimezoneSelect value={s.timezone} /></div>
          <div><label className="label" htmlFor="currency">Currency</label><input className="input" id="currency" name="currency" defaultValue={s.currency} maxLength={3} required /></div>
          <div><label className="label" htmlFor="bookingPrefix">Booking number prefix</label><input className="input" id="bookingPrefix" name="bookingPrefix" defaultValue={s.bookingPrefix} /></div>
        </section>
        <section className="card grid gap-4 p-6 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Booking rules</h2>
          <div><label className="label" htmlFor="slotIntervalMin">Start times every (minutes)</label><input className="input" id="slotIntervalMin" name="slotIntervalMin" type="number" min={5} max={240} defaultValue={s.slotIntervalMin} /></div>
          <div><label className="label" htmlFor="minNoticeMin">Minimum notice for online bookings (minutes)</label><input className="input" id="minNoticeMin" name="minNoticeMin" type="number" min={0} defaultValue={s.minNoticeMin} /></div>
          <div><label className="label" htmlFor="maxNoticeDays">Clients can book up to (days ahead)</label><input className="input" id="maxNoticeDays" name="maxNoticeDays" type="number" min={1} defaultValue={s.maxNoticeDays} /></div>
          <div><label className="label" htmlFor="clientCutoffHours">Online cancel or move allowed until (hours before)</label><input className="input" id="clientCutoffHours" name="clientCutoffHours" type="number" min={0} step={0.5} defaultValue={s.clientCutoffMin / 60} /></div>
        </section>
        <div><button className="btn" type="submit">Save settings</button></div>
      </form>
    </>
  );
}
