import { z } from "zod";
import { PARTS_OF_DAY, REQUEST_STATUSES } from "./follow-up-desk.dto";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-03");

export const requestInput = z.object({
  clientId: z.string().uuid("Choose the client"),
  psychologistId: z.string().uuid("Choose the psychologist"),
  suggestedOn: day.nullable().or(z.literal("").transform(() => null)),
  partOfDay: z.enum(PARTS_OF_DAY).nullable().or(z.literal("").transform(() => null)),
  message: z.string().trim().min(1, "Write a short message for the coordinator").max(2000),
});

export const messageInput = z.object({ body: z.string().trim().min(1, "Write a message").max(2000) });

export const statusInput = z.object({ status: z.enum(REQUEST_STATUSES) });
