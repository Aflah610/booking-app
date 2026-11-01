import { z } from "zod";
import { ACCESS_ROLES } from "@/features/access/permissions";
import { DESIGNATIONS } from "./staff.dto";
import { toE164 } from "@/features/shared/phone";
import { timezone } from "@/features/shared/validation";

export const staffInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "manager", "staff"]).default("staff"),
  // When left out it follows role and designation (see accessRoleFrom); when given, role follows it.
  accessRole: z.enum(ACCESS_ROLES).optional(),
  // No default: an update that does not mention it must leave it as it is (the database column starts as null).
  designation: z.enum(DESIGNATIONS).nullable().optional(),
  timezone: timezone.default("Asia/Kolkata"),
  active: z.boolean().default(true),
  // Like designation: left alone by an update that does not mention it.
  clinicalAdmin: z.boolean().optional(),
  // WhatsApp number for staff reminders: blank clears it, left out leaves it as it is.
  phoneE164: z.string().trim().max(30).transform((v, ctx) => {
    if (!v) return null;
    const e164 = toE164(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "Enter a valid WhatsApp number, e.g. +91 98765 43210" });
      return z.NEVER;
    }
    return e164;
  }).nullable().optional(),
});
export type StaffInput = z.input<typeof staffInput>;
export type StaffData = z.output<typeof staffInput>;
