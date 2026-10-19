import { describe, expect, it } from "vitest";
import { isReportRangeKey, presetRange } from "@/features/reports/ranges";

describe("report quick ranges", () => {
  it("this month runs from the 1st to the last day, including days still to come", () => {
    expect(presetRange("month", "2026-10-19")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(presetRange("month", "2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("next 30 days starts today and covers 30 days", () => {
    expect(presetRange("next30", "2026-10-19")).toEqual({ from: "2026-10-19", to: "2026-11-17" });
  });

  it("the last-N ranges end today and cover N days", () => {
    expect(presetRange("7", "2026-10-19")).toEqual({ from: "2026-10-13", to: "2026-10-19" });
    expect(presetRange("30", "2026-10-19")).toEqual({ from: "2026-09-20", to: "2026-10-19" });
  });

  it("only knows its own range names", () => {
    expect(isReportRangeKey("month")).toBe(true);
    expect(isReportRangeKey("next30")).toBe(true);
    expect(isReportRangeKey("999")).toBe(false);
    expect(isReportRangeKey(undefined)).toBe(false);
  });
});
