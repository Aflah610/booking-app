import { describe, expect, it } from "vitest";
import { dayPart, groupByPart, hourIn } from "@/lib/day-parts";
import { zonedToUtc } from "@/lib/time";

const IST = "Asia/Kolkata";
const slot = (local: string) => ({ start: zonedToUtc(`2026-10-23T${local}`, IST) });

describe("day parts", () => {
  it("splits the day into morning, afternoon and night, counting the small hours as night", () => {
    expect([4, 5, 11, 12, 17, 18, 23, 0].map(dayPart)).toEqual(["night", "morning", "morning", "afternoon", "afternoon", "night", "night", "night"]);
  });

  it("reads the hour in the firm's zone, not the server's", () => {
    expect(hourIn(slot("09:00").start, IST)).toBe(9);
    expect(hourIn(slot("09:00").start, "UTC")).toBe(3);
  });

  it("groups free times, drops empty parts, and keeps the order inside each part", () => {
    const parts = groupByPart([slot("19:30"), slot("09:00"), slot("12:00"), slot("09:30"), slot("02:00"), slot("21:00")], IST);
    expect(parts.map((p) => p.id)).toEqual(["morning", "afternoon", "night"]);
    expect(parts[0].slots.map((s) => hourIn(s.start, IST))).toEqual([9, 9]);
    // Evening first, then the small hours of the same date.
    expect(parts[2].slots.map((s) => hourIn(s.start, IST))).toEqual([19, 21, 2]);
    expect(groupByPart([slot("10:00")], IST).map((p) => p.id)).toEqual(["morning"]);
    expect(groupByPart([], IST)).toEqual([]);
  });
});
