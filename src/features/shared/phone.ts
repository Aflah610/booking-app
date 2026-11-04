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
  // Anything else without a country code is a typo (a digit short or extra), not a foreign number.
  else return null;
  // An Indian mobile is +91 and ten digits from 6 to 9. "+9100…" is the placeholder for imported clients with no phone.
  if (e164.startsWith("+91") && !e164.startsWith("+9100") && !/^\+91[6-9]\d{9}$/.test(e164)) return null;
  return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}
