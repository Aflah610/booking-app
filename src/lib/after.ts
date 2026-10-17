import { after } from "next/server";

/**
 * Runs work once the response has been sent, without making the person wait for it. On Vercel, `after` keeps the function
 * alive until the work is done; anywhere else (no request in progress) the work simply starts in the background.
 * Failures are logged, never thrown: this is for follow-up work, like writing a booking to Google Calendar.
 */
export function defer(task: () => Promise<unknown>): void {
  const run = () =>
    task().catch((err) => {
      console.error("Deferred work failed", err);
    });
  try {
    after(run);
  } catch {
    void run();
  }
}
