import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import config from "../next.config";
import { proxy } from "@/proxy";

it("sets a browser protection baseline on all responses", async () => {
  const rules = await config.headers!();
  const headers = Object.fromEntries(rules[0].headers.map(({ key, value }) => [key, value]));
  expect(headers).toMatchObject({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Strict-Transport-Security": "max-age=31536000" });
});
it("uses fresh script nonces and passes the exact policy to Next's renderer", () => {
  vi.stubEnv("NODE_ENV", "production");
  try {
    const first = proxy(new NextRequest("https://book.mindlap.in/login"));
    const second = proxy(new NextRequest("https://book.mindlap.in/login"));
    const policy = first.headers.get("Content-Security-Policy")!;
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy.split(";").find((s) => s.trim().startsWith("script-src"))).not.toContain("'unsafe-inline'");
    expect(policy).not.toBe(second.headers.get("Content-Security-Policy"));
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(first.headers.get("X-Frame-Options")).toBe("DENY");
  } finally { vi.unstubAllEnvs(); }
});
it.each(["/admin/case-histories/example", "/admin/settings/whatsapp", "/login", "/reset-password"])("refuses framing of private page %s", (path) => {
  expect(proxy(new NextRequest(`https://book.mindlap.in${path}`)).headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
});
it.each(["/book", "/book/example"])("preserves booking embeds on the Mindlap website: %s", (path) => {
  const response = proxy(new NextRequest(`https://book.mindlap.in${path}`));
  expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'self' https://mindlap.in https://www.mindlap.in");
  expect(response.headers.has("X-Frame-Options")).toBe(false);
});
