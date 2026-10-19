import type { StoppedResult } from "../performance.dto";
import { inWindow, isHeld, lastHeld, olderThan, ratio } from "../performance.engine";
import type { Kpi } from "./kpi";

/**
 * Of the clients seen in the window, how many have stopped coming: nothing booked ahead and the last session is older
 * than the grace period. The app cannot yet tell "healed" from "dropped out" (that needs an outcome the therapist records),
 * so this is the honest superset of both.
 */
export const stoppedKpi: Kpi<StoppedResult> = {
  id: "stopped",
  label: "Stopped coming",
  compute({ journeys, window, now, graceDays }) {
    let activeClients = 0;
    let stopped = 0;
    for (const j of journeys) {
      if (!j.sessions.some((s) => isHeld(s, now) && inWindow(s.startsAt, window))) continue;
      activeClients += 1;
      const last = lastHeld(j, now);
      if (last && !last.followedBySession && olderThan(last.session.startsAt, graceDays, now)) stopped += 1;
    }
    return { kind: "stopped", activeClients, stopped, ongoing: activeClients - stopped, rate: ratio(stopped, activeClients) };
  },
};
