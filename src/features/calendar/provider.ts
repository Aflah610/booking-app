import type { CalendarBookingDTO, ExternalBusy } from "./calendar.dto";

/** Google refused our credentials (revoked access, deleted account). Retrying won't help until the person reconnects. */
export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderAuthError";
  }
}

export interface ProviderTokens {
  refreshToken: string;
  accessToken: string;
  accessExpiresAt: number;
  accountEmail: string | null;
}

/**
 * What the booking app needs from an external calendar. Google is the first implementation; another calendar
 * (Outlook, Zoho) means a new file with this shape, not changes to the sync rules.
 */
export interface CalendarProvider {
  readonly id: "google";
  configured(): boolean;
  authUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens>;
  refresh(refreshToken: string): Promise<{ accessToken: string; accessExpiresAt: number }>;
  revoke(token: string): Promise<void>;
  /** Busy events in the window, skipping the ones this app wrote itself. */
  listBusy(accessToken: string, calendarId: string, from: Date, to: Date, timeZone: string): Promise<ExternalBusy[]>;
  /** Creates the event, or updates it when `eventId` is given. Returns the provider's event id. */
  upsertEvent(accessToken: string, calendarId: string, eventId: string | null, booking: CalendarBookingDTO, inviteClient: boolean): Promise<string>;
  /** Deleting an event that is already gone is not an error. */
  deleteEvent(accessToken: string, calendarId: string, eventId: string, notifyGuests: boolean): Promise<void>;
}
