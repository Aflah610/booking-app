import { addDays } from "@/features/availability/slots";

/** The quick date ranges on the Reports page. Looking forward matters: appointments are counted by their date, so upcoming ones sit after today. */
export const REPORT_RANGES = [
  ["month", "This month"],
  ["next30", "Next 30 days"],
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
] as const;

export type ReportRangeKey = (typeof REPORT_RANGES)[number][0];

export function isReportRangeKey(key: string | undefined): key is ReportRangeKey {
  return REPORT_RANGES.some(([k]) => k === key);
}

/** First and last day (YYYY-MM-DD) of a quick range, counted from `today` on the firm's clock. */
export function presetRange(key: ReportRangeKey, today: string): { from: string; to: string } {
  if (key === "month") {
    const first = `${today.slice(0, 7)}-01`;
    const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    return { from: first, to: addDays(nextMonth, -1) };
  }
  if (key === "next30") return { from: today, to: addDays(today, 29) };
  return { from: addDays(today, -(Number(key) - 1)), to: today };
}
