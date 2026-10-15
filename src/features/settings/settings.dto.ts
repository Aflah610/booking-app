/** Business-wide settings (one row). Per-service values override the booking rules when set. */
export type BusinessSettingsDTO = {
  name: string;
  timezone: string;
  currency: string;
  bookingPrefix: string;
  slotIntervalMin: number;
  minNoticeMin: number;
  maxNoticeDays: number;
  /** Clients can't cancel or reschedule through the website closer than this to the start. */
  clientCutoffMin: number;
};
