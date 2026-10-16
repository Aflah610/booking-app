import { describe, expect, it } from "vitest";
import { bookingIcs } from "@/lib/ics";
import { callerKey, rateLimit } from "@/lib/rate-limit";
import { groupByDay, textOn } from "@/lib/public-slots";

describe("calendar file", () => {
  it("writes a valid single event with escaped text and CRLF line ends", () => {
    const ics = bookingIcs({
      uid: "abc",
      start: new Date("2026-10-19T04:30:00Z"),
      end: new Date("2026-10-19T05:00:00Z"),
      title: "Consult, with Asha; room 2",
      location: "12 MG Road\nBengaluru",
      now: new Date("2026-10-15T00:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20261019T043000Z\r\n");
    expect(ics).toContain("DTEND:20261019T050000Z\r\n");
    expect(ics).toContain("SUMMARY:Consult\\, with Asha\; room 2\r\n");
    expect(ics).toContain("LOCATION:12 MG Road\\nBengaluru\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long lines at 75 bytes", () => {
    const ics = bookingIcs({ uid: "x", start: new Date(0), end: new Date(60_000), title: "A".repeat(200) });
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});

describe("rate limit", () => {
  it("allows up to the limit, then says when to retry, then resets", () => {
    const k = "test:" + Math.random();
    for (let i = 0; i < 3; i++) expect(rateLimit(k, 3, 60_000, 1000).ok).toBe(true);
    const blocked = rateLimit(k, 3, 60_000, 1000);
    expect(blocked).toEqual({ ok: false, retryAfterSec: 60 });
    expect(rateLimit(k, 3, 60_000, 61_001).ok).toBe(true);
  });

  it("identifies a caller by a hash, never the address", () => {
    const key = callerKey(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }));
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(key).not.toContain("203");
    expect(callerKey(new Headers({ "x-forwarded-for": "203.0.113.9" }))).toBe(key);
  });
});

describe("public page helpers", () => {
  it("groups free times by the firm's local day", () => {
    const mk = (iso: string) => ({ start: new Date(iso), end: new Date(iso), staffIds: [] });
    const days = groupByDay([mk("2026-10-19T18:00:00Z"), mk("2026-10-19T19:00:00Z"), mk("2026-10-20T04:00:00Z")], "Asia/Kolkata");
    // 18:00Z and 19:00Z are 23:30 and 00:30 IST, so they fall on different local days.
    expect([...days.keys()]).toEqual(["2026-10-19", "2026-10-20"]);
    expect(days.get("2026-10-20")).toHaveLength(2);
  });

  it("picks readable text for a brand colour", () => {
    expect(textOn("#000000")).toBe("#ffffff");
    expect(textOn("#ffffff")).toBe("#000000");
    expect(textOn("#0f766e")).toBe("#ffffff");
    expect(textOn("#fde047")).toBe("#000000");
  });
});
