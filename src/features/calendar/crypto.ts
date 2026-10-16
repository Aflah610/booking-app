import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Refresh tokens let anyone read and write a person's calendar, so they are stored encrypted (AES-256-GCM).
 * The key comes from CALENDAR_ENCRYPTION_KEY; falling back to AUTH_SECRET keeps setup short, but then rotating
 * AUTH_SECRET disconnects every calendar.
 */
function key(secret: string) {
  return createHash("sha256").update(`calendar-tokens:${secret}`).digest();
}

export function encrypt(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(stored: string, secret: string): string {
  const [iv, tag, body] = stored.split(".").map((p) => Buffer.from(p ?? "", "base64url"));
  if (!iv || !tag || !body) throw new Error("Stored calendar tokens are malformed");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

const STATE_MINUTES = 10;

/** The `state` sent to Google: proves the callback belongs to a connect request this app started for this person. */
export function signState(staffId: string, secret: string, now = new Date()): string {
  const payload = `${staffId}.${now.getTime() + STATE_MINUTES * 60_000}`;
  const mac = createHmac("sha256", secret).update(`calendar-state:${payload}`).digest("base64url");
  return `${payload}.${mac}`;
}

/** The staff id inside a valid, unexpired state, or null. */
export function readState(state: string, secret: string, now = new Date()): string | null {
  const [staffId, expires, mac] = state.split(".");
  if (!staffId || !expires || !mac) return null;
  const expected = createHmac("sha256", secret).update(`calendar-state:${staffId}.${expires}`).digest("base64url");
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return Number(expires) > now.getTime() ? staffId : null;
}
