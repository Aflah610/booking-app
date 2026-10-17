import Link from "next/link";
import { app } from "@/features/container";
import { requireStaff } from "@/lib/session";
import { BookingPrefixField } from "@/components/BookingPrefixField";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import { sendTestEmailAction, updateSettingsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireStaff("admin");
  const { error, ok } = await searchParams;
  const mail = app().mail.status();
  const [s, nextNumber] = await Promise.all([app().settings.get(), app().bookings.nextNumber()]);
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Firm-wide defaults. A service can override the booking rules."
        action={
          <span className="flex gap-2">
            <Link className="btn-ghost" href="/admin/settings/holidays">Holidays</Link>
            <Link className="btn-ghost" href="/admin/settings/api">API keys</Link>
          </span>
        }
      />
      <Notice error={error} ok={ok} />
      <form action={updateSettingsAction} className="grid max-w-3xl gap-6">
        <section className="card grid gap-4 p-6 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Firm</h2>
          <div><label className="label" htmlFor="name">Firm name</label><input className="input" id="name" name="name" defaultValue={s.name} required /></div>
          <div><label className="label" htmlFor="timezone">Time zone</label><TimezoneSelect value={s.timezone} /></div>
          <div><label className="label" htmlFor="currency">Currency</label><input className="input" id="currency" name="currency" defaultValue={s.currency} maxLength={3} required /></div>
          <BookingPrefixField initial={s.bookingPrefix} nextNumber={nextNumber} />
        </section>
        <section className="card grid gap-4 p-6 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Booking rules</h2>
          <div><label className="label" htmlFor="slotIntervalMin">Start times every (minutes)</label><input className="input" id="slotIntervalMin" name="slotIntervalMin" type="number" min={5} max={240} defaultValue={s.slotIntervalMin} /></div>
          <div><label className="label" htmlFor="minNoticeMin">Minimum notice for online bookings (minutes)</label><input className="input" id="minNoticeMin" name="minNoticeMin" type="number" min={0} defaultValue={s.minNoticeMin} /></div>
          <div><label className="label" htmlFor="maxNoticeDays">Clients can book up to (days ahead)</label><input className="input" id="maxNoticeDays" name="maxNoticeDays" type="number" min={1} defaultValue={s.maxNoticeDays} /></div>
          <div><label className="label" htmlFor="clientCutoffHours">Online cancel or move allowed until (hours before)</label><input className="input" id="clientCutoffHours" name="clientCutoffHours" type="number" min={0} step={0.5} defaultValue={s.clientCutoffMin / 60} /></div>
        </section>
        <section className="card grid gap-4 p-6">
          <h2 className="font-semibold">Online sessions</h2>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="toggle mt-0.5" name="meetEnabled" defaultChecked={s.meetEnabled} />
            <span>Use Google Meet for online sessions<span className="block text-zinc-600">Services set to &ldquo;Online with Google Meet&rdquo; get a Meet link in the therapist&apos;s calendar event, and clients get a join link in their messages. Each therapist must have Google Calendar connected (Staff, their name, Google Calendar).</span></span>
          </label>
        </section>
        <section className="card grid gap-4 p-6">
          <h2 className="font-semibold">Online payment</h2>
          <p className="text-sm text-zinc-600">
            Your website takes the payment with Razorpay and reports it here. When this is on, a website booking of a priced service is held for 15 minutes.
            If no payment arrives it shows &ldquo;Payment failed&rdquo; and the time goes back on offer. The client can still come back within 24 hours to choose a time and pay; after that the booking is cancelled.
          </p>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="toggle" name="onlinePayment" defaultChecked={s.onlinePayment} /> Website bookings must be paid online</label>
          <div>
            <label className="label" htmlFor="resumeUrl">Page on your website to finish payment</label>
            <input className="input" id="resumeUrl" name="resumeUrl" defaultValue={s.resumeUrl ?? ""} placeholder="https://yourfirm.com/my-bookings" />
            <p className="mt-1 text-xs text-zinc-600">Used for <code>{"{{resume_link}}"}</code> in &ldquo;complete your payment&rdquo; messages. We add the booking and a secure token to it.</p>
          </div>
        </section>
        <section className="card grid gap-4 p-6 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Booking page</h2>
          <p className="text-sm text-zinc-600 sm:col-span-2">
            Clients book at <Link className="underline" href="/book" target="_blank">/book</Link>. Share that link, or embed it on your website with an iframe.
          </p>
          <div><label className="label" htmlFor="logoUrl">Logo web address</label><input className="input" id="logoUrl" name="logoUrl" defaultValue={s.logoUrl ?? ""} placeholder="https://yourfirm.com/logo.png" /></div>
          <div><label className="label" htmlFor="brandColor">Brand colour</label><input className="h-10 w-full cursor-pointer rounded-md border border-zinc-300 bg-white p-1" id="brandColor" name="brandColor" type="color" defaultValue={s.brandColor} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="welcomeText">Welcome message</label><textarea className="input" id="welcomeText" name="welcomeText" rows={2} defaultValue={s.welcomeText ?? ""} placeholder="Book an appointment with us. We confirm by WhatsApp." /></div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="embed">Embed on your website</label>
            <input className="input font-mono text-xs" id="embed" readOnly value={`<iframe src="${process.env.AUTH_URL?.replace(/\/$/, "") || "http://localhost:3000"}/book?embed=1" style="width:100%;height:760px;border:0"></iframe>`} />
          </div>
        </section>
        <div><button className="btn" type="submit">Save settings</button></div>
      </form>

      <section className="card mt-8 grid max-w-3xl gap-4 p-6">
        <h2 className="font-semibold">Email</h2>
        <p className="text-sm text-zinc-600">
          Every email the app sends (confirmations, reminders, cancellations, payment and staff alerts) goes out from one mailbox. Each workflow only changes the subject and the text.
        </p>
        {mail.configured ? (
          <p className="text-sm">
            <span className="badge border-[var(--forest-line)] text-[var(--forest)]">Connected</span>{" "}
            Sending from <strong>{mail.from}</strong> through {mail.host}
            {mail.replyTo ? <>; replies go to <strong>{mail.replyTo}</strong></> : null}.
          </p>
        ) : (
          <p className="text-sm font-medium text-red-700">
            Not connected yet. Add {mail.missing.join(", ") || "the email settings"} in your host&apos;s environment settings (see docs/deploy-vercel.md), then redeploy.
          </p>
        )}
        {mail.configured && mail.missing.length > 0 && (
          <p className="text-sm text-zinc-600">Still empty: {mail.missing.join(", ")}. Most mail providers need a login too.</p>
        )}
        <form action={sendTestEmailAction} className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className="label" htmlFor="to">Send a test email to</label>
            <input className="input" id="to" name="to" type="email" defaultValue={me.email} required />
          </div>
          <button className="btn-ghost" type="submit">Send test email</button>
        </form>
      </section>
    </>
  );
}
