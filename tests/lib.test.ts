import { describe, expect, it, vi } from "vitest";
import { poolConfig } from "@/db/pool-config";
import { missingEnv } from "@/lib/env";
import { enabledLoginProviders } from "@/lib/login-providers";
import { formatDayRanges, parseDayRanges } from "@/lib/hours-form";
import { formatInZone, zonedToUtc } from "@/lib/time";

describe("hours form", () => {
  it("parses and formats ranges", () => {
    const r = parseDayRanges(1, " 9:00-13:00 , 14:00 - 18:30");
    expect(r).toEqual([
      { weekday: 1, startTime: "09:00", endTime: "13:00" },
      { weekday: 1, startTime: "14:00", endTime: "18:30" },
    ]);
    expect(formatDayRanges(r, 1)).toBe("09:00-13:00, 14:00-18:30");
    expect(parseDayRanges(0, "")).toEqual([]);
    expect(() => parseDayRanges(2, "nine to five")).toThrow(/Tuesday/);
  });
});

describe("time zones", () => {
  it("converts wall-clock time to UTC", () => {
    expect(zonedToUtc("2026-10-20T09:00", "Asia/Kolkata").toISOString()).toBe("2026-10-20T03:30:00.000Z");
    expect(zonedToUtc("2026-07-01T09:00", "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedToUtc("2026-12-01T09:00", "Europe/London").toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });

  it("round-trips through formatInZone", () => {
    const d = zonedToUtc("2026-03-29T14:15", "Europe/London");
    expect(formatInZone(d, "Europe/London")).toBe("2026-03-29 14:15");
  });
});

describe("database pool config", () => {
  const neon = "postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/db";

  it("turns on TLS for Neon when the URL has no sslmode", () => {
    expect(poolConfig(neon, 5, {}).ssl).toEqual({ rejectUnauthorized: true });
  });

  it("treats a bare ?sslmode (value cut off by the host console) as no sslmode, so Neon still gets TLS", () => {
    const cfg = poolConfig(`${neon}?sslmode`, 5, {});
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true });
    expect(cfg.connectionString).not.toContain("sslmode");
  });

  it("leaves TLS to the URL when sslmode is given", () => {
    expect(poolConfig(`${neon}?sslmode=require`, 5, {}).ssl).toBeUndefined();
    expect(poolConfig(`${neon}?sslmode=require`, 5, {}).connectionString).toContain("sslmode=verify-full");
  });

  it("uses plain connections for other hosts unless DATABASE_SSL=true", () => {
    const local = "postgres://u:p@localhost:5432/db";
    expect(poolConfig(local, 5, {}).ssl).toBeUndefined();
    expect(poolConfig(local, 5, { DATABASE_SSL: "true" }).ssl).toEqual({ rejectUnauthorized: true });
  });
});

describe("login settings", () => {
  const base = { DATABASE_URL: "postgres://u:p@localhost/db", AUTH_SECRET: "x".repeat(32) };

  it("needs at least one way for staff to sign in", () => {
    expect(missingEnv(base)).toEqual(["AUTH_GOOGLE_ID+AUTH_GOOGLE_SECRET or AUTH_ZOHO_ID+AUTH_ZOHO_SECRET"]);
    expect(missingEnv({ ...base, AUTH_ZOHO_ID: "id", AUTH_ZOHO_SECRET: "s" })).toEqual([]);
    expect(missingEnv({ ...base, AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s" })).toEqual([]);
  });

  it("turns on only the providers whose keys are set", () => {
    expect(enabledLoginProviders({}).map((p) => p.id)).toEqual([]);
    expect(enabledLoginProviders({ AUTH_ZOHO_ID: "id", AUTH_ZOHO_SECRET: "s" }).map((p) => p.id)).toEqual(["zoho"]);
    const both = { AUTH_GOOGLE_ID: "g", AUTH_GOOGLE_SECRET: "s", AUTH_ZOHO_ID: "z", AUTH_ZOHO_SECRET: "s" };
    expect(enabledLoginProviders(both).map((p) => p.id)).toEqual(["google", "zoho"]);
  });

  it("uses the India Zoho data centre unless told otherwise, and maps the Zoho profile", () => {
    const [india] = enabledLoginProviders({ AUTH_ZOHO_ID: "id", AUTH_ZOHO_SECRET: "s" });
    const p = india.provider as unknown as { token: string; profile: (raw: object) => object };
    expect(p.token).toBe("https://accounts.zoho.in/oauth/v2/token");
    expect(p.profile({ ZUID: 42, Email: "a@firm.com", First_Name: "Asha", Last_Name: "Rao" })).toEqual({
      id: "42",
      name: "Asha Rao",
      email: "a@firm.com",
      image: null,
    });
    const [us] = enabledLoginProviders({
      AUTH_ZOHO_ID: "id",
      AUTH_ZOHO_SECRET: "s",
      AUTH_ZOHO_ACCOUNTS_URL: "https://accounts.zoho.com/",
    });
    expect((us.provider as unknown as { token: string }).token).toBe("https://accounts.zoho.com/oauth/v2/token");
  });

  it("asks Zoho for the profile with Zoho's token header", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ZUID: 1, Email: "a@firm.com" })));
    vi.stubGlobal("fetch", fetchMock);
    const [zoho] = enabledLoginProviders({ AUTH_ZOHO_ID: "id", AUTH_ZOHO_SECRET: "s" });
    const userinfo = (zoho.provider as unknown as {
      userinfo: { request: (ctx: { tokens: { access_token: string } }) => Promise<unknown> };
    }).userinfo;
    await expect(userinfo.request({ tokens: { access_token: "t" } })).resolves.toEqual({ ZUID: 1, Email: "a@firm.com" });
    expect(fetchMock).toHaveBeenCalledWith("https://accounts.zoho.in/oauth/user/info", {
      headers: { Authorization: "Zoho-oauthtoken t" },
    });
    vi.unstubAllGlobals();
  });
});
