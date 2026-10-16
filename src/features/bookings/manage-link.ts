import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A client's "manage my booking" link. The token is derived from the booking id and the app's secret, so the
 * same link can be rebuilt for emails and WhatsApp messages without storing anything, and it is useless for
 * any other booking. (The random token returned to the website API at booking time keeps working too.)
 */
export const manageToken = (bookingId: string, secret: string) =>
  createHmac("sha256", secret).update(`manage:${bookingId}`).digest("base64url");

export function isValidManageToken(bookingId: string, token: string, secret: string): boolean {
  const want = Buffer.from(manageToken(bookingId, secret));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}
