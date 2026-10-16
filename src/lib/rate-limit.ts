import { createHash } from "node:crypto";

const windows = new Map<string, { n: number; resetAt: number }>();

/**
 * Fixed-window counter kept in this process's memory. Fine for one container; with several, each has its
 * own count, so the real limit is a little higher. Swap in a shared store if that ever matters.
 */
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  if (windows.size > 5000) for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { n: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  w.n += 1;
  return w.n <= max ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.ceil((w.resetAt - now) / 1000) };
}

/** A short stable id for the caller's IP address. The address itself is never stored or logged. */
export function callerKey(headers: Headers): string {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}
