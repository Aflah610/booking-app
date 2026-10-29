import { createHmac, timingSafeEqual } from "node:crypto";

/** Payment-only capability: no phone or client details in the URL, no account or booking-management access. */
export function paymentToken(id: string, amount: number, expires: number, secret: string) {
  return `${expires}.${createHmac("sha256", secret).update(`collect:${id}:${amount}:${expires}`).digest("base64url")}`;
}
export function validPaymentToken(id: string, amount: number, token: string, secret: string, now: Date) {
  if (!/^\d{13}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const expires = Number(token.split(".")[0]);
  if (expires <= now.getTime()) return false;
  const expected = Buffer.from(paymentToken(id, amount, expires, secret));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
