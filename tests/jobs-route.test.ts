import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { reset } from "./helpers";
import { GET, POST } from "@/app/api/internal/jobs/run/route";
import { refuseUnlessCron } from "@/lib/cron";

beforeEach(reset);
const saved = process.env.CRON_SECRET;
afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
});
const call = (method: string, token?: string) =>
  new NextRequest("http://localhost/api/internal/jobs/run", { method, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("background jobs endpoint", () => {
  it("stays closed when no CRON_SECRET is set, and refuses a wrong or missing one", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(call("GET", "anything"))).status).toBe(403);
    process.env.CRON_SECRET = "s".repeat(32);
    expect((await GET(call("GET"))).status).toBe(403);
    expect((await GET(call("GET", "wrong"))).status).toBe(403);
    expect((await GET(call("GET", "s".repeat(31)))).status).toBe(403);
  });

  it("runs every job for a caller with the secret, by GET (Vercel Cron) or POST", async () => {
    process.env.CRON_SECRET = "s".repeat(32);
    for (const [method, fn] of [["GET", GET], ["POST", POST]] as const) {
      const res = await fn(call(method, "s".repeat(32)));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toMatchObject({ expired: { failed: 0, cancelled: 0 }, messages: expect.any(Number), calendarWrites: expect.any(Number), busyRefreshed: expect.any(Number) });
    }
  });

  it("compares the secret without caring about its length", () => {
    expect(refuseUnlessCron(new Request("http://x", { headers: { authorization: "Bearer a" } }), { CRON_SECRET: "abcdef" })).not.toBeNull();
    expect(refuseUnlessCron(new Request("http://x", { headers: { authorization: "Bearer abcdef" } }), { CRON_SECRET: "abcdef" })).toBeNull();
  });
});
