import { app } from "@/features/container";
import { refuseUnlessCron } from "@/lib/cron";

export const dynamic = "force-dynamic";
// A run is short, but give a busy backlog room to finish.
export const maxDuration = 60;

/**
 * One call does all the background work: fail unpaid bookings (10 minutes) and cancel stale ones (24 hours), send due
 * workflow messages, write queued bookings to calendars, and refresh calendar busy times. On a host that can't keep
 * a timer running (Vercel), a scheduler calls this every minute or so instead of the built-in worker.
 * Safe to call as often as you like, and from several places at once: each job is claimed by one caller only.
 */
async function run(req: Request) {
  const refused = refuseUnlessCron(req);
  if (refused) return refused;
  const { payments, workflows, calendar } = app();
  const started = Date.now();
  // Payments first, so a booking that just failed gets its "complete your payment" message in this same run.
  const expired = await payments.expire();
  const messages = await workflows.processDue();
  const calendarWrites = await calendar.processDue();
  const busyRefreshed = await calendar.syncBusy();
  return Response.json({ data: { expired, messages, calendarWrites, busyRefreshed, ms: Date.now() - started } });
}

export const GET = run;
export const POST = run;
