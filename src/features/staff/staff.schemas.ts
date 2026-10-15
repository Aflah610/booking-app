import { z } from "zod";
import { timezone } from "@/features/shared/validation";

export const staffInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "manager", "staff"]).default("staff"),
  timezone: timezone.default("UTC"),
  active: z.boolean().default(true),
});
export type StaffInput = z.input<typeof staffInput>;
export type StaffData = z.output<typeof staffInput>;
