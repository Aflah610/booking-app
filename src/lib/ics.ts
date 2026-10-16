/** A one-event calendar file (RFC 5545) that Google, Apple and Outlook calendars all open. */
export function bookingIcs(e: { uid: string; start: Date; end: Date; title: string; description?: string | null; location?: string | null; now?: Date }): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\;").replace(/,/g, "\\,");
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
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@bookings`,
    `DTSTAMP:${stamp(e.now ?? new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
