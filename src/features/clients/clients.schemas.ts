import { z } from "zod";
import { toE164 } from "@/features/shared/phone";

export const phone = z
  .string()
  .trim()
  .min(6)
  .max(30)
  .transform((v, ctx) => {
    const e164 = toE164(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, e.g. +91 98765 43210" });
      return z.NEVER;
    }
    return e164;
  });

export const clientContactInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone,
  email: z.string().trim().toLowerCase().email().max(200).nullish().or(z.literal("").transform(() => null)),
  whatsappOptIn: z.boolean().default(false),
});
export type ClientContactInput = z.input<typeof clientContactInput>;

export const clientUpdateInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200).nullish().or(z.literal("").transform(() => null)),
  whatsappOptIn: z.boolean(),
  notes: z.string().trim().max(5000).nullish(),
});
