import { z } from "zod";
import { normalizePrice } from "@/features/shared/money";

const optionalMinutes = (max: number) => z.coerce.number().int().min(0).max(max).nullish();

export const serviceInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  durationMin: z.coerce.number().int().min(5).max(24 * 60),
  bufferBeforeMin: z.coerce.number().int().min(0).max(240).default(0),
  bufferAfterMin: z.coerce.number().int().min(0).max(240).default(0),
  priceDisplay: z.string().trim().max(60).nullish().transform(normalizePrice),
  slotIntervalMin: z.coerce.number().int().min(5).max(240).nullish(),
  minNoticeMin: optionalMinutes(60 * 24 * 30),
  maxNoticeDays: z.coerce.number().int().min(1).max(730).nullish(),
  active: z.boolean().default(true),
});
export type ServiceInput = z.input<typeof serviceInput>;
export type ServiceData = z.output<typeof serviceInput>;
