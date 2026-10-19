import { z } from "zod";

export const sendOtpInput = z.object({
  /** Any common format; "98765 43210" is read as an Indian number unless countryCode says otherwise. */
  phone: z.string().trim().min(1, "Send the client's WhatsApp number as phone").max(30),
  /** Digits only, without "+", e.g. "91". Used when phone has no country code of its own. */
  countryCode: z.string().trim().regex(/^[1-9]\d{0,3}$/, "countryCode is digits only, e.g. 91").optional(),
});

export const verifyOtpInput = z.object({
  reference: z.string().trim().min(1, "Send the reference you got when the code was sent").max(64),
  code: z.string().trim().regex(/^\d{6}$/, "code is the 6 digits the client received"),
  /** Optional extra check that the code is being verified for the same number it was sent to. */
  phone: z.string().trim().max(30).optional(),
});

export type SendOtpInput = z.infer<typeof sendOtpInput>;
export type VerifyOtpInput = z.infer<typeof verifyOtpInput>;
