/** A staff member's linked external calendar, without the secrets. */
export interface CalendarConnectionDTO {
  staffId: string;
  provider: "google";
  accountEmail: string | null;
  calendarId: string;
  pushBookings: boolean;
  blockBusy: boolean;
  inviteClients: boolean;
  /** Create a Google Meet link on events for online sessions. */
  createMeetLinks: boolean;
  lastSyncedAt: Date | null;
  /** Failures since the last success; the worker stops retrying a connection that Google has rejected. */
  errorCount: number;
  lastError: string | null;
}

export interface CalendarStatusDTO {
  /** False until the firm adds Google credentials to the environment. */
  providerConfigured: boolean;
  connection: CalendarConnectionDTO | null;
}

/** Tokens as stored (encrypted) in calendar_connection.encrypted_tokens. */
export interface CalendarTokens {
  refreshToken: string;
  accessToken: string;
  accessExpiresAt: number;
}

/** What the worker needs to write one booking to a calendar. */
export interface CalendarBookingDTO {
  id: string;
  staffId: string;
  status: "upcoming" | "completed" | "cancelled" | "no_show";
  slotReleased: boolean;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  location: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  notes: string | null;
  /** Staff time zone, for the event's own zone field. */
  timezone: string;
  /** Online session settings: the firm's switch, the service's type, this booking's override and the link so far. */
  meetEnabled: boolean;
  meetingType: "in_person" | "google_meet";
  meetingOverride: "on" | "off" | null;
  meetingUrl: string | null;
  meetingSource: "google" | "manual" | null;
}

export interface ExternalBusy {
  externalId: string;
  start: Date;
  end: Date;
}

export const BUSY_WINDOW_DAYS = 90;
export const BUSY_REFRESH_MIN = 5;
