import type { ConclusionResult } from "../performance.dto";
import { inWindow, isHeld, lastHeld, olderThan, ratio } from "../performance.engine";
import type { Kpi } from "./kpi";

/**
 * Of the clients seen in the window, how many have ended treatment: nothing booked ahead and the last session is older than
 * the grace period. That covers a successful completion and an early exit alike; the app cannot yet tell them apart
 * (that needs an outcome the therapist records), so this is the honest total of both.
 */
export const conclusionKpi: Kpi<ConclusionResult> = {
  id: "conclusion",
  label: "Termination",
  compute({ journeys, window, now, graceDays }) {
    let activeClients = 0;
    let concluded = 0;
    for (const j of journeys) {
      if (!j.sessions.some((s) => isHeld(s, now) && inWindow(s.startsAt, window))) continue;
      activeClients += 1;
      const last = lastHeld(j, now);
      if (last && !last.followedBySession && olderThan(last.session.startsAt, graceDays, now)) concluded += 1;
    }
    return { kind: "conclusion", activeClients, concluded, ongoing: activeClients - concluded, rate: ratio(concluded, activeClients) };
  },
};
