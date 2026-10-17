import { z } from "zod";
import { clientContactInput } from "@/features/clients/clients.schemas";

const start = z.coerce.date().refine((d) => d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0, "Start must be on a whole minute");

export const createBookingInput = z.object({
  serviceId: z.string().uuid(),
  /** Leave out to let the system pick whoever is free (spreading work evenly). */
  staffId: z.string().uuid().nullish(),
  start,
  client: clientContactInput,
  holdToken: z.string().min(10).max(200).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  formAnswers: z.record(z.string(), z.unknown()).default({}),
  /** Pay with the client's package session or wallet money when they have any. Send false to leave them untouched. */
  useCredits: z.boolean().default(true),
});
export type CreateBookingInput = z.input<typeof createBookingInput>;

export const holdInput = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().nullish(),
  start,
});

export const rescheduleInput = z.object({
  start,
  staffId: z.string().uuid().nullish(),
  holdToken: z.string().min(10).max(200).nullish(),
});

export const cancelInput = z.object({ reason: z.string().trim().max(500).nullish() });

export const idempotencyKey = z.string().trim().min(8).max(200);

export const bookingListQuery = z.object({
  view: z.enum(["upcoming", "past", "cancelled", "all"]).default("upcoming"),
  staffId: z.string().uuid().nullish(),
  clientId: z.string().uuid().nullish(),
  from: z.coerce.date().nullish(),
  to: z.coerce.date().nullish(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type BookingListQuery = z.input<typeof bookingListQuery>;
