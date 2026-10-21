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

/** A form box left empty means "not recorded". */
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable().default(null));

const dateOfBirth = z.preprocess(
  blank,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Not a real date")
    // Compared as text: YYYY-MM-DD sorts like the date it names.
    .refine((v) => v >= "1900-01-01", "Date of birth can't be before 1900")
    .refine((v) => v <= new Date().toISOString().slice(0, 10), "Date of birth can't be in the future")
    .nullable()
    .default(null),
);

/** Everything on the client's edit form. */
export const clientProfileInput = clientUpdateInput.extend({
  dateOfBirth,
  gender: text(40),
  maritalStatus: text(40),
  occupation: text(120),
  education: text(120),
  location: text(120),
  languages: text(120),
  emergencyName: text(120),
  emergencyRelation: text(60),
  emergencyPhone: z.preprocess(blank, phone.nullable().default(null)),
  referralSource: text(120),
  consentSignedAt: z.preprocess(blank, z.coerce.date().nullable().default(null)),
});

export const assignTherapistInput = z.object({
  staffId: z.string().uuid(),
  reason: z.preprocess(blank, z.string().trim().max(500).nullable().default(null)),
});
