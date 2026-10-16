export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/** IANA time zones for pickers, with India first since that's where the firm is. */
export function timezoneOptions(current?: string): string[] {
  const all = Intl.supportedValuesOf("timeZone");
  const rest = all.filter((z) => z !== DEFAULT_TIMEZONE);
  // Keep a stored zone selectable even if this runtime's list doesn't include it (e.g. "UTC").
  if (current && current !== DEFAULT_TIMEZONE && !all.includes(current)) rest.unshift(current);
  return [DEFAULT_TIMEZONE, ...rest];
}
