import type { Question } from "./questions";

export type ServiceDTO = {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  priceDisplay: string | null;
  /** The amount to charge online, in paise. Null when the price is text like "From ₹500" or empty. */
  pricePaise: number | null;
  slotIntervalMin: number | null;
  minNoticeMin: number | null;
  maxNoticeDays: number | null;
  maxPerDay: number | null;
  location: string | null;
  questions: Question[];
  active: boolean;
};

/** What the website may see about a service. */
export type PublicServiceDTO = Pick<ServiceDTO, "id" | "name" | "description" | "durationMin" | "priceDisplay" | "pricePaise" | "location" | "questions">;

export const toPublicService = (s: ServiceDTO): PublicServiceDTO => ({
  id: s.id,
  name: s.name,
  description: s.description,
  durationMin: s.durationMin,
  priceDisplay: s.priceDisplay,
  pricePaise: s.pricePaise,
  location: s.location,
  questions: s.questions,
});

/** "₹1,500" or "₹499.50" in paise; null for anything that isn't a plain rupee amount. */
export function paiseFromPrice(display: string | null | undefined): number | null {
  const m = display?.match(/^₹([0-9,]+)(?:\.([0-9]{1,2}))?$/);
  if (!m) return null;
  const rupees = Number(m[1].replace(/,/g, ""));
  const paise = Number((m[2] ?? "0").padEnd(2, "0"));
  const total = rupees * 100 + paise;
  return total > 0 && Number.isSafeInteger(total) ? total : null;
}

/** Whether a booking of this service has something to pay. "Free" and an empty price mean nothing is due. */
export const hasPrice = (s: Pick<ServiceDTO, "priceDisplay">) => Boolean(s.priceDisplay) && !/^(free|nil|none|0)$/i.test(s.priceDisplay ?? "");
