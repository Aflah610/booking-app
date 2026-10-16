export interface IcsEvent {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description?: string | null;
  location?: string | null;
  now?: Date;
  /**
   * PUBLISH is a plain file to open. REQUEST / CANCEL are invitations sent by email: Gmail and Outlook recognise
   * them and offer to add (or remove) the event, which needs the organiser and attendee below.
   */
  method?: "PUBLISH" | "REQUEST" | "CANCEL";
  organizer?: { name?: string; email: string };
  attendee?: { name?: string; email: string };
  /** Rises each time the same event (same uid) changes, so calendars know to replace the older copy. */
  sequence?: number;
}

/** A one-event calendar file (RFC 5545) that Google, Apple and Outlook calendars all open. */
export function bookingIcs(e: IcsEvent): string {
  const method = e.method ?? "PUBLISH";
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const person = (key: "ORGANIZER" | "ATTENDEE", p: { name?: string; email: string }) =>
    `${key}${p.name ? `;CN=${JSON.stringify(p.name.replace(/["\r\n]/g, ""))}` : ""}${key === "ATTENDEE" ? ";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE" : ""}:mailto:${p.email}`;
  // Lines over 75 bytes must be folded: a CRLF and one space continue the previous line.
  const fold = (line: string) => {
    const bytes = Buffer.from(line);
    if (bytes.length <= 75) return line;
    const parts: string[] = [];
    let chunk = "";
    for (const ch of line) {
      if (Buffer.byteLength(chunk + ch) > (parts.length ? 74 : 75)) {
        parts.push(chunk);
        chunk = "";
      }
      chunk += ch;
    }
    parts.push(chunk);
    return parts.join("\r\n ");
  };
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bookings//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}@bookings`,
    `DTSTAMP:${stamp(e.now ?? new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.organizer ? [person("ORGANIZER", e.organizer)] : []),
    ...(e.attendee ? [person("ATTENDEE", e.attendee)] : []),
    ...(e.sequence !== undefined ? [`SEQUENCE:${e.sequence}`] : []),
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** "Add to calendar" web links: they open the person's own calendar with the event filled in, no file needed. */
export function addToCalendarLinks(e: { start: Date; end: Date; title: string; description?: string | null; location?: string | null }) {
  const compact = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const google = new URL("https://calendar.google.com/calendar/render");
  google.search = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${compact(e.start)}/${compact(e.end)}`,
    details: e.description ?? "",
    location: e.location ?? "",
  }).toString();
  const outlook = new URL("https://outlook.live.com/calendar/0/deeplink/compose");
  outlook.search = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.title,
    startdt: e.start.toISOString(),
    enddt: e.end.toISOString(),
    body: e.description ?? "",
    location: e.location ?? "",
  }).toString();
  return { google: google.toString(), outlook: outlook.toString() };
}
