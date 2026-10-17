/**
 * The columns a bookings list can show. To add one, add it here and give it a cell in components/BookingsTable.tsx;
 * the "Columns" panel, saving and the defaults pick it up by themselves.
 */
export const BOOKING_COLUMNS = [
  { id: "booking_id", label: "Booking ID" },
  { id: "time", label: "Time", locked: true },
  { id: "service", label: "Service" },
  { id: "staff", label: "Therapist" },
  // Name and phone share one cell: two columns for the same person used up too much width.
  { id: "client", label: "Customer (name and phone)" },
  { id: "email", label: "Customer email" },
  { id: "payment", label: "Payment status" },
  { id: "price", label: "Price" },
  { id: "status", label: "Status" },
  { id: "session", label: "Online or in person" },
  { id: "source", label: "Booked by" },
] as const satisfies readonly { id: string; label: string; locked?: boolean }[];

export type BookingColumnId = (typeof BOOKING_COLUMNS)[number]["id"];

/** Which list a choice belongs to: each screen remembers its own. */
export type BookingListKey = "bookings" | "today";

export const DEFAULT_COLUMNS: Record<BookingListKey, BookingColumnId[]> = {
  bookings: ["booking_id", "time", "service", "staff", "client", "payment", "status"],
  // Today is the person's own diary, so the therapist column would only repeat their name.
  today: ["booking_id", "time", "service", "client", "payment", "status"],
};

export const columnPrefKey = (list: BookingListKey) => `columns.${list}`;

const KNOWN = new Set<string>(BOOKING_COLUMNS.map((c) => c.id));
const LOCKED = BOOKING_COLUMNS.filter((c) => "locked" in c && c.locked).map((c) => c.id);

/** A saved choice made safe: only known columns, no repeats, locked ones always present, at least two columns. */
export function resolveColumns(saved: unknown, list: BookingListKey): BookingColumnId[] {
  if (!Array.isArray(saved)) return DEFAULT_COLUMNS[list];
  const seen = new Set<string>();
  const ids = saved.filter((x): x is BookingColumnId => typeof x === "string" && KNOWN.has(x) && !seen.has(x) && !!seen.add(x));
  for (const locked of LOCKED) if (!ids.includes(locked as BookingColumnId)) ids.unshift(locked as BookingColumnId);
  return ids.length >= 2 ? ids : DEFAULT_COLUMNS[list];
}

/** For saving: the same clean-up, but a choice that leaves fewer than two columns is refused instead of quietly replaced. */
export function checkColumns(input: unknown, list: BookingListKey): BookingColumnId[] {
  if (!Array.isArray(input)) throw new RangeError("Choose the columns to show");
  const ids = resolveColumns(input, list);
  const picked = new Set(input.filter((x) => typeof x === "string" && KNOWN.has(x)));
  for (const l of LOCKED) picked.add(l);
  if (picked.size < 2) throw new RangeError("Select at least two fields");
  return ids;
}

export type ColumnChoice = { id: string; label: string; locked: boolean; checked: boolean };

/** All columns for the panel: the shown ones in their order first, then the hidden ones. */
export function columnChoices(shown: BookingColumnId[]): ColumnChoice[] {
  const all: { id: string; label: string; locked?: boolean }[] = [...BOOKING_COLUMNS];
  const byId = new Map(all.map((c) => [c.id, c]));
  const picked = shown.map((id) => byId.get(id)!);
  const rest = all.filter((c) => !shown.includes(c.id as BookingColumnId));
  return [...picked, ...rest].map((c) => ({ id: c.id, label: c.label, locked: Boolean(c.locked), checked: shown.includes(c.id as BookingColumnId) }));
}
