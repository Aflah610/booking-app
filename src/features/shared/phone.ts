/**
 * Normalises a phone number to E.164, assuming India (+91) when no country code is given:
 * "98765 43210", "098765-43210" and "+91 98765 43210" all become "+919876543210".
 * Returns null when the result isn't a plausible E.164 number.
 */
export function toE164(raw: string, defaultCountryCode = "91"): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  let e164: string;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (trimmed.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (digits.length === 10) e164 = `+${defaultCountryCode}${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) e164 = `+${defaultCountryCode}${digits.slice(1)}`;
  else if (digits.length === 12 && digits.startsWith(defaultCountryCode)) e164 = `+${digits}`;
  else e164 = `+${digits}`;
  return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}
