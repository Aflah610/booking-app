import { describe, expect, it } from "vitest";
import { poolConfig } from "@/db/pool-config";
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

  it("leaves TLS to the URL when sslmode is given", () => {
    expect(poolConfig(`${neon}?sslmode=require`, 5, {}).ssl).toBeUndefined();
  });

  it("uses plain connections for other hosts unless DATABASE_SSL=true", () => {
    const local = "postgres://u:p@localhost:5432/db";
    expect(poolConfig(local, 5, {}).ssl).toBeUndefined();
    expect(poolConfig(local, 5, { DATABASE_SSL: "true" }).ssl).toEqual({ rejectUnauthorized: true });
  });
});
