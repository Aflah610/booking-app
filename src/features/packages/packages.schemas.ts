import { z } from "zod";
import { DEFAULT_CREDIT_VALUE_PAISE, DEFAULT_PACKAGE_VALIDITY_DAYS } from "./packages.dto";

export const packageInput = z.object({
  name: z.string().trim().min(1, "Give the package a name").max(120),
  serviceIds: z.array(z.string().uuid()).default([]),
  /** How many credits the client gets. */
  sessions: z.number().int().min(1, "At least one credit").max(500),
  /** How much service price one credit covers (₹1,000 means a ₹1,500 service takes 1.5 credits). */
  creditValuePaise: z.number().int().min(100, "A credit must cover at least ₹1").max(100_000_000).default(DEFAULT_CREDIT_VALUE_PAISE),
  /** How many days the client has to use it after buying. Null = never expires. */
  validityDays: z.number().int().min(1).max(3650).nullable().default(DEFAULT_PACKAGE_VALIDITY_DAYS),
  pricePaise: z.number().int().min(0).max(100_000_000),
  active: z.boolean().default(true),
});
export type PackageInput = z.input<typeof packageInput>;
export type PackageData = z.output<typeof packageInput>;

export const sellInput = z.object({
  packageId: z.string().uuid(),
  /** How it was paid (cash, UPI reference ...), for the firm's own records. */
  paymentNote: z.string().trim().max(500).nullish(),
});

export const topUpInput = z.object({
  amountPaise: z.number().int().min(100, "Enter at least ₹1").max(100_000_000),
  note: z.string().trim().max(500).nullish(),
});
