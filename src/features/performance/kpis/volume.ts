import type { VolumeResult } from "../performance.dto";
import { inWindow, isHeld } from "../performance.engine";
import type { Kpi } from "./kpi";

/** How many sessions the therapist held in the window, and with how many different clients. */
export const volumeKpi: Kpi<VolumeResult> = {
  id: "volume",
  label: "Sessions",
  compute({ journeys, window, now }) {
    let sessions = 0;
    let clients = 0;
    for (const j of journeys) {
      const n = j.sessions.filter((s) => isHeld(s, now) && inWindow(s.startsAt, window)).length;
      sessions += n;
      if (n > 0) clients += 1;
    }
    return { kind: "volume", sessions, clients };
  },
};
