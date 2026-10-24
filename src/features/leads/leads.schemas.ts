import { z } from "zod";
import { toE164 } from "@/features/shared/phone";
import { LEAD_STATUSES } from "./leads.dto";

const phone = z.string().transform((raw, ctx) => {
  const e164 = toE164(raw);
  if (!e164) {
    ctx.addIssue({ code: "custom", message: `"${raw}" is not a valid phone number` });
    return z.NEVER;
  }
  return e164;
});

const text = (max: number) => z.string().trim().max(max).transform((s) => s || null);

/** A message that arrived (or a lead typed in by staff). The ad fields come from WhatsApp's referral on the first message. */
export const captureInput = z.object({
  phone,
  name: z.string().trim().max(120).transform((s) => s || "WhatsApp contact"),
  source: z.enum(["whatsapp_ad", "whatsapp", "manual"]),
  adId: text(100).nullish(),
  adHeadline: text(300).nullish(),
  adUrl: text(1000).nullish(),
  notes: text(4000).nullish(),
  at: z.date().optional(),
});
export type CaptureInput = z.input<typeof captureInput>;

export const leadUpdateInput = z.object({
  status: z.enum(LEAD_STATUSES),
  followUpOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-03").nullable().or(z.literal("").transform(() => null)),
  notes: text(4000).nullable(),
});
