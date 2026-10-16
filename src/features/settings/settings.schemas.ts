import { z } from "zod";
import { timezone } from "@/features/shared/validation";

export const settingsInput = z.object({
  name: z.string().trim().min(1).max(120),
  timezone,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code like INR"),
  bookingPrefix: z.string().trim().max(10),
  slotIntervalMin: z.coerce.number().int().min(5).max(240),
  minNoticeMin: z.coerce.number().int().min(0).max(60 * 24 * 30),
  maxNoticeDays: z.coerce.number().int().min(1).max(730),
  clientCutoffMin: z.coerce.number().int().min(0).max(60 * 24 * 14),
});
export type SettingsInput = z.input<typeof settingsInput>;
