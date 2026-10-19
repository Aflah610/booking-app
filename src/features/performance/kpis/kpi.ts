import type { Attendance, Journey, KpiResult } from "../performance.dto";
import type { Window } from "../performance.engine";

/** What every KPI is given for one therapist. A new KPI needs nothing more than this to be added. */
export type KpiContext = {
  /** This therapist's journeys only (one per client). */
  journeys: Journey[];
  window: Window;
  now: Date;
  /** Days without a next booking before a client counts as lost or concluded. */
  graceDays: number;
  /** Join times known for bookings in the window (empty until an attendance source is connected). */
  attendance: Map<string, Attendance>;
};

export interface Kpi<R extends KpiResult = KpiResult> {
  id: R["kind"];
  label: string;
  compute(ctx: KpiContext): R;
}
