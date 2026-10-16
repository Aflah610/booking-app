import { localDate } from "@/features/availability/slots";
import type { SlotDTO } from "@/features/availability/availability.dto";

/** Free times grouped by the firm's local day, soonest day first, for the day chips on public pages. */
export function groupByDay(slots: SlotDTO[], timeZone: string): Map<string, SlotDTO[]> {
  const days = new Map<string, SlotDTO[]>();
  for (const s of slots) {
    const d = localDate(s.start.getTime(), timeZone);
    const list = days.get(d);
    if (list) list.push(s);
    else days.set(d, [s]);
  }
  return days;
}

/** Black or white text, whichever reads better on the brand colour. */
export function textOn(hex: string): "#ffffff" | "#000000" {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.4 ? "#000000" : "#ffffff";
}
