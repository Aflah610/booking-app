/**
 * Prices are stored as display text so the firm can write "From ₹1,500" or "Free". A plain number
 * typed in the form becomes a rupee amount ("1500" → "₹1,500").
 */
export function normalizePrice(text: string | null | undefined): string | null {
  const t = text?.trim();
  if (!t) return null;
  const plain = t.replace(/^(₹|rs\.?|inr)\s*/i, "").replace(/,/g, "");
  if (/^\d+(\.\d{1,2})?$/.test(plain)) {
    return `₹${Number(plain).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return t;
}
