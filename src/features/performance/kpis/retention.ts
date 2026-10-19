import type { RetentionResult, RetentionStep } from "../performance.dto";
import { inWindow, nthHeld, olderThan, ratio } from "../performance.engine";
import type { Kpi } from "./kpi";

export const RETENTION_STEPS = 6;

/**
 * Of the clients whose Nth session with this therapist fell in the window, how many came back for another?
 * "Came back" means any later session, held or already booked. A client who has not booked yet is "waiting" while the
 * session is newer than the grace period (they may still book), and "lost" after it. Waiting clients are left out of the rate.
 */
export const retentionKpi: Kpi<RetentionResult> = {
  id: "retention",
  label: "Came back after session",
  compute({ journeys, window, now, graceDays }) {
    const steps: RetentionStep[] = [];
    for (let after = 1; after <= RETENTION_STEPS; after++) {
      let returned = 0;
      let lost = 0;
      let waiting = 0;
      for (const j of journeys) {
        const nth = nthHeld(j, after, now);
        if (!nth || !inWindow(nth.session.startsAt, window)) continue;
        if (nth.followedBySession) returned += 1;
        else if (olderThan(nth.session.startsAt, graceDays, now)) lost += 1;
        else waiting += 1;
      }
      steps.push({ after, cohort: returned + lost + waiting, returned, lost, waiting, rate: ratio(returned, returned + lost) });
    }
    return { kind: "retention", steps };
  },
};
