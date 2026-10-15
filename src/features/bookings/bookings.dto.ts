export type BookingStatus = "upcoming" | "completed" | "cancelled" | "no_show";
export type BookingSource = "web" | "staff";

export type BookingDTO = {
  id: string;
  number: number;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  source: BookingSource;
  notes: string | null;
  cancellationReason: string | null;
  cancelledBy: string | null;
  rescheduledFromId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
};

/** What the firm's website gets back. No staff emails or internal notes. */
export type PublicBookingDTO = {
  id: string;
  reference: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  start: string;
  end: string;
  status: BookingStatus;
  rescheduledFromId: string | null;
};

/** "BK-" + 5-digit number, e.g. BK-00012. */
export const bookingReference = (prefix: string, n: number) => `${prefix}${String(n).padStart(5, "0")}`;

export const toPublicBooking = (b: BookingDTO, prefix: string): PublicBookingDTO => ({
  id: b.id,
  reference: bookingReference(prefix, b.number),
  serviceId: b.serviceId,
  serviceName: b.serviceName,
  staffId: b.staffId,
  staffName: b.staffName,
  start: b.startsAt.toISOString(),
  end: b.endsAt.toISOString(),
  status: b.status,
  rescheduledFromId: b.rescheduledFromId,
});

export type HoldDTO = { token: string; staffId: string; start: Date; end: Date; expiresAt: Date };
