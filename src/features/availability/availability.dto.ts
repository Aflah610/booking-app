/** One start time and who can take it. */
export type SlotDTO = { start: Date; end: Date; staffIds: string[] };

/** "client": the website's rules (minimum notice, booking window). "staff": a staff member booking for a client. */
export type BookingMode = "client" | "staff";
