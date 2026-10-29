import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/** Public booking embeds are intentional; staff and clinical screens must never be framed. */
export function proxy(request: NextRequest) {
  const nonce = randomBytes(24).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const embedded = request.nextUrl.pathname === "/book" || request.nextUrl.pathname.startsWith("/book/");
  const payment = request.nextUrl.pathname.startsWith("/pay/");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.facebook.com https://connect.facebook.net${payment ? " https://*.razorpay.com wss://*.razorpay.com" : ""}${dev ? " ws: wss:" : ""}`,
    `frame-src 'self' https://www.facebook.com https://web.facebook.com${payment ? " https://*.razorpay.com" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com https://login.microsoftonline.com https://www.facebook.com",
    embedded ? "frame-ancestors 'self' https://mindlap.in https://www.mindlap.in" : "frame-ancestors 'none'",
    ...(!dev ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  const headers = new Headers(request.headers);
  // Next extracts this nonce from the request CSP and applies it to its runtime and inline hydration scripts.
  headers.set("Content-Security-Policy", csp);
  headers.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  if (payment) { response.headers.set("Referrer-Policy", "no-referrer"); response.headers.set("Cache-Control", "no-store"); }
  if (!embedded) response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = { matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|brand/).*)"] };
