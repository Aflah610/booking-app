/** Placeholders a workflow message may use, shown to the admin as "Insert variable". */
export const PLACEHOLDERS = [
  ["client_name", "Client's name"],
  ["client_phone", "Client's mobile number"],
  ["service", "Service name"],
  ["staff", "Staff member's name"],
  ["date", "Date, e.g. Tuesday, 20 October 2026"],
  ["time", "Start time, e.g. 9:00 am"],
  ["booking_id", "Booking number, e.g. BK-00012"],
  ["location", "Where it happens (address or meeting link)"],
  ["manage_link", "Link for the client to reschedule or cancel"],
  ["meeting_link", "Link to join the online session (empty for in-person)"],
  ["add_to_google", "Link that adds the appointment to Google Calendar"],
  ["add_to_outlook", "Link that adds the appointment to Outlook Calendar"],
  ["add_to_calendar", "Link to download the appointment for any calendar (Apple, Outlook app)"],
  ["amount", "Amount to pay, e.g. ₹1,500"],
  ["resume_link", "Link to your website page where the client finishes paying"],
  ["firm_name", "Your firm's name"],
  ["cancel_reason", "Reason given when cancelled"],
] as const;

const KNOWN = new Set<string>(PLACEHOLDERS.map(([k]) => k));
const TAG = /\{\{\s*([a-z_]+)\s*\}\}/g;

export type TemplateVars = Record<(typeof PLACEHOLDERS)[number][0], string>;

/** Names used in `text` that we can't fill, so a typo is caught when saving instead of sent to a client. */
export function unknownPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(TAG)].map((m) => m[1]).filter((k) => !KNOWN.has(k)))];
}

export function render(text: string, vars: TemplateVars): string {
  return text.replace(TAG, (_, key: string) => (KNOWN.has(key) ? vars[key as keyof TemplateVars] : ""));
}
