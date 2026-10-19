import type { PunctualityResult } from "../performance.dto";
import { inWindow, isHeld } from "../performance.engine";
import type { Kpi } from "./kpi";

/** Joining up to this many minutes after the scheduled start still counts as on time. */
export const ON_TIME_GRACE_MIN = 3;

/**
 * How promptly the therapist joined the video call, from join times an attendance source supplies (Google Meet's REST API
 * once it is connected). With no join times it reports "no_data" instead of a number that would mean nothing.
 */
export const punctualityKpi: Kpi<PunctualityResult> = {
  id: "punctuality",
  label: "Punctuality",
  compute({ journeys, window, now, attendance }) {
    let sessions = 0;
    let measured = 0;
    let onTime = 0;
    let lateMinutes = 0;
    for (const j of journeys) {
      for (const s of j.sessions) {
        if (!isHeld(s, now) || !inWindow(s.startsAt, window)) continue;
        sessions += 1;
        const seen = attendance.get(s.id);
        if (!seen) continue;
        measured += 1;
        const late = Math.max(0, (seen.joinedAt.getTime() - s.startsAt.getTime()) / 60_000);
        lateMinutes += late;
        if (late <= ON_TIME_GRACE_MIN) onTime += 1;
      }
    }
    if (measured === 0) return { kind: "punctuality", status: "no_data" };
    return { kind: "punctuality", status: "ok", measured, sessions, onTimeRate: onTime / measured, avgMinutesLate: lateMinutes / measured };
  },
};
