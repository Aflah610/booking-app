import { z } from "zod";
import { timeOfDay } from "@/features/shared/validation";

export const workingRange = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: timeOfDay,
    endTime: timeOfDay,
  })
  .refine((r) => r.startTime < r.endTime, { message: "Start must be before end", path: ["endTime"] });

export const timeOffInput = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().trim().max(200).nullish(),
  })
  .refine((r) => r.startsAt < r.endsAt, { message: "Start must be before end", path: ["endsAt"] });
