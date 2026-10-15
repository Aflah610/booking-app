import { describe, expect, it } from "vitest";
import {
  cutSlots,
  mergeIntervals,
  offsetMs,
  staffSlots,
  subtractIntervals,
  unionSlots,
  workingIntervals,
  type SlotRequest,
} from "@/features/availability/slots";
import { zonedToUtc } from "@/lib/time";

const IST = "Asia/Kolkata";
const at = (local: string, tz = IST) => zonedToUtc(local, tz).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const ist = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);

// 2026-10-19 is a Monday.
const monday9to5 = [{ weekday: 1, startTime: "09:00", endTime: "17:00" }];

function request(over: Partial<SlotRequest> = {}): SlotRequest {
  return {
    weekly: monday9to5,
    overrides: [],
    timeZone: IST,
    busy: [],
    from: at("2026-10-19T00:00"),
    to: at("2026-10-20T00:00"),
    durationMin: 60,
    intervalMin: 60,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    earliest: 0,
    latest: Number.MAX_SAFE_INTEGER,
    ...over,
  };
}

describe("interval maths", () => {
  it("merges overlapping and touching ranges", () => {
    expect(mergeIntervals([{ start: 5, end: 8 }, { start: 1, end: 3 }, { start: 3, end: 4 }, { start: 7, end: 10 }])).toEqual([
      { start: 1, end: 4 },
      { start: 5, end: 10 },
    ]);
  });

  it("subtracts in one sweep, including partial and spanning cuts", () => {
    const base = [{ start: 0, end: 10 }, { start: 20, end: 30 }];
    const cut = [{ start: -5, end: 2 }, { start: 4, end: 5 }, { start: 8, end: 22 }, { start: 29, end: 40 }];
    expect(subtractIntervals(base, cut)).toEqual([
      { start: 2, end: 4 },
      { start: 5, end: 8 },
      { start: 22, end: 29 },
    ]);
    expect(subtractIntervals(base, [])).toEqual(base);
    expect(subtractIntervals(base, [{ start: -1, end: 100 }])).toEqual([]);
  });
});

describe("working intervals", () => {
  it("turns weekly hours in the staff zone into UTC", () => {
    const w = workingIntervals({ weekly: monday9to5, overrides: [], timeZone: IST, from: at("2026-10-19T00:00"), to: at("2026-10-26T00:00") });
    expect(w).toEqual([{ start: at("2026-10-19T09:00"), end: at("2026-10-19T17:00") }]);
    expect(iso(w[0].start)).toBe("2026-10-19T03:30:00.000Z");
  });

  it("lets a date override replace the weekly hours, or close the day", () => {
    const opts = { weekly: monday9to5, timeZone: IST, from: at("2026-10-19T00:00"), to: at("2026-10-27T00:00") };
    const w = workingIntervals({
      ...opts,
      overrides: [
        { date: "2026-10-19", ranges: [{ startTime: "12:00", endTime: "14:00" }] },
        { date: "2026-10-24", ranges: [{ startTime: "10:00", endTime: "11:00" }] }, // a Saturday, normally off
        { date: "2026-10-26", ranges: [] }, // next Monday, off
      ],
    });
    expect(w).toEqual([
      { start: at("2026-10-19T12:00"), end: at("2026-10-19T14:00") },
      { start: at("2026-10-24T10:00"), end: at("2026-10-24T11:00") },
    ]);
  });

  it("clips to the requested window", () => {
    const w = workingIntervals({ weekly: monday9to5, overrides: [], timeZone: IST, from: at("2026-10-19T10:30"), to: at("2026-10-19T12:00") });
    expect(w).toEqual([{ start: at("2026-10-19T10:30"), end: at("2026-10-19T12:00") }]);
  });
});

describe("slots", () => {
  it("cuts the day on the interval grid", () => {
    const s = staffSlots(request({ durationMin: 30, intervalMin: 30 }));
    expect(s.length).toBe(16);
    expect(ist(s[0])).toBe("09:00");
    expect(ist(s.at(-1)!)).toBe("16:30");
  });

  it("aligns starts to the wall clock, not to when a gap begins", () => {
    const busy = [{ start: at("2026-10-19T09:00"), end: at("2026-10-19T09:10") }];
    const s = staffSlots(request({ busy, durationMin: 30, intervalMin: 15 }));
    expect(ist(s[0])).toBe("09:15");
  });

  it("aligns in zones with a 30-minute offset", () => {
    expect(offsetMs(at("2026-10-19T09:00"), IST)).toBe(5.5 * 3600_000);
    const s = cutSlots({
      free: [{ start: at("2026-10-19T09:07"), end: at("2026-10-19T10:00") }],
      durationMin: 15,
      intervalMin: 15,
      timeZone: IST,
      earliest: 0,
      latest: Number.MAX_SAFE_INTEGER,
    });
    expect(s.map(ist)).toEqual(["09:15", "09:30", "09:45"]);
  });

  it("removes busy time, including partial overlaps", () => {
    const busy = [{ start: at("2026-10-19T10:30"), end: at("2026-10-19T11:15") }];
    const s = staffSlots(request({ busy, durationMin: 60, intervalMin: 30 }));
    expect(s.map(ist)).toEqual([
      "09:00", "09:30", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00",
    ]);
  });

  it("keeps the new booking's buffers clear of busy time", () => {
    const busy = [{ start: at("2026-10-19T12:00"), end: at("2026-10-19T13:00") }];
    const s = staffSlots(request({ busy, durationMin: 60, intervalMin: 60, bufferBeforeMin: 15, bufferAfterMin: 15 }));
    // 11:00-12:00 would need 15 minutes after it, and 13:00 needs 15 minutes before it.
    expect(s.map(ist)).toEqual(["09:00", "10:00", "14:00", "15:00", "16:00"]);
  });

  it("respects minimum notice and the booking window", () => {
    const s = staffSlots(request({ earliest: at("2026-10-19T10:20"), latest: at("2026-10-19T14:00") }));
    expect(s.map(ist)).toEqual(["11:00", "12:00", "13:00", "14:00"]);
  });

  it("never returns a slot that runs past the end of the working day", () => {
    const s = staffSlots(request({ durationMin: 90, intervalMin: 60 }));
    expect(ist(s.at(-1)!)).toBe("15:00");
  });

  it("only returns starts inside [from, to)", () => {
    const s = staffSlots(request({ from: at("2026-10-19T12:00"), to: at("2026-10-19T14:00"), durationMin: 60, intervalMin: 60 }));
    expect(s.map(ist)).toEqual(["12:00", "13:00"]);
  });

  it("handles daylight-saving changes on the wall-clock grid", () => {
    const tz = "Europe/London"; // clocks go back at 02:00 on 2026-10-25
    const s = staffSlots({
      ...request(),
      weekly: [{ weekday: 0, startTime: "00:00", endTime: "04:00" }],
      timeZone: tz,
      from: at("2026-10-25T00:00", tz),
      to: at("2026-10-26T00:00", tz),
      durationMin: 60,
      intervalMin: 60,
    });
    // The 00:00 to 04:00 wall-clock day lasts five real hours that night.
    expect(s.map(iso)).toEqual([
      "2026-10-24T23:00:00.000Z",
      "2026-10-25T00:00:00.000Z",
      "2026-10-25T01:00:00.000Z",
      "2026-10-25T02:00:00.000Z",
      "2026-10-25T03:00:00.000Z",
    ]);
  });

  it("unions staff into one list of who is free when", () => {
    expect(unionSlots([{ staffId: "a", starts: [3, 1] }, { staffId: "b", starts: [1, 2] }])).toEqual([
      { start: 1, staffIds: ["a", "b"] },
      { start: 2, staffIds: ["b"] },
      { start: 3, staffIds: ["a"] },
    ]);
  });
});
