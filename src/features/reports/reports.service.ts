import { z } from "zod";
import { addDays, localDate } from "@/features/availability/slots";
import type { SettingsRepository } from "@/features/settings/settings.repository";
import { bookingReference } from "@/features/bookings/bookings.dto";
import { zonedToUtc } from "@/lib/time";
import { toCsv } from "./csv";
import type { ReportDTO, ReportsRepository } from "./reports.repository";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const RANGES = { "7": 7, "30": 30, "90": 90 } as const;

/** Booking numbers and counts for the dashboard, over days counted on the firm's clock. */
export function createReportsService({ reportsRepo, settingsRepo }: { reportsRepo: ReportsRepository; settingsRepo: SettingsRepository }) {
  /** `from` and `to` are local days; `to` is included. Defaults to the last 30 days up to today. */
  async function range(input: { from?: string; to?: string }, now = new Date()) {
    const { timezone } = await settingsRepo.get();
    const today = localDate(now.getTime(), timezone);
    const to = isoDay.safeParse(input.to).success ? (input.to as string) : today;
    let from = isoDay.safeParse(input.from).success ? (input.from as string) : addDays(to, -29);
    if (from > to) from = to;
    // A year is plenty for a screen, and bounds the work a single request can ask for.
    if (addDays(from, 366) < to) from = addDays(to, -366);
    return { from, to, timeZone: timezone, window: { from: zonedToUtc(`${from}T00:00`, timezone), to: zonedToUtc(`${addDays(to, 1)}T00:00`, timezone), timeZone: timezone } };
  }

  return {
    range,

    async summary(input: { from?: string; to?: string }, now = new Date()): Promise<ReportDTO & { from: string; to: string }> {
      const r = await range(input, now);
      const s = await reportsRepo.summary(r.window);
      const perDay: ReportDTO["perDay"] = [];
      for (let d = r.from; d <= r.to; d = addDays(d, 1)) perDay.push({ date: d, count: s.perDay.get(d) ?? 0 });
      return { ...s, perDay, from: r.from, to: r.to };
    },

    async bookingsCsv(input: { from?: string; to?: string }, now = new Date()) {
      const [r, firm] = [await range(input, now), await settingsRepo.get()];
      const rows = await reportsRepo.exportBookings(r.window);
      // "2026-10-19 10:00" on the firm's clock: sorts correctly and needs no quoting in a spreadsheet.
      const clock = new Intl.DateTimeFormat("en-GB", { timeZone: firm.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      const local = { format: (d: Date) => `${localDate(d.getTime(), firm.timezone)} ${clock.format(d)}` };
      const csv = toCsv(
        ["Booking ID", "Starts", "Ends", "Service", "Staff", "Client", "Phone", "Email", "Meeting status", "Payment", "Amount due (INR)", "Amount paid (INR)", "Razorpay payment ID", "Paid at", "No-show by", "Booked", "Notes", "Answers"],
        rows.map((x) => [
          bookingReference(firm.bookingPrefix, x.reference),
          local.format(x.startsAt),
          local.format(x.endsAt),
          x.service,
          x.staff,
          x.client,
          x.phone,
          x.email,
          x.status === "upcoming" ? "scheduled" : x.status,
          x.payment,
          x.amountDuePaise === null ? "" : x.amountDuePaise / 100,
          x.amountPaidPaise === null ? "" : x.amountPaidPaise / 100,
          x.razorpayPaymentId,
          x.paidAt ? local.format(new Date(x.paidAt)) : "",
          x.noShowBy,
          x.source === "web" ? "online" : "by staff",
          x.notes,
          Object.entries(x.answers).map(([q, a]) => `${q}: ${a}`).join(" | "),
        ]),
      );
      return { csv, filename: `bookings-${r.from}-to-${r.to}.csv` };
    },

    async clientsCsv() {
      const rows = await reportsRepo.exportClients();
      return toCsv(
        ["Name", "Phone", "Email", "WhatsApp updates", "Bookings", "Last completed visit", "Notes"],
        rows.map((x) => [x.name, x.phone, x.email, x.whatsappOptIn ? "yes" : "no", x.bookings, x.lastVisit ? new Date(x.lastVisit) : "", x.notes]),
      );
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
