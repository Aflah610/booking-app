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
  /** Public booking page look. */
  logoUrl: string | null;
  brandColor: string;
  welcomeText: string | null;
  /** Page on the firm's website where clients finish an unpaid booking. */
  resumeUrl: string | null;
  /** Website bookings of priced services must be paid online: held 15 minutes, then failed. */
  onlinePayment: boolean;
};
