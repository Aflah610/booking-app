import { punctualityKpi } from "./punctuality";
import { retentionKpi } from "./retention";
import { stoppedKpi } from "./stopped";
import { volumeKpi } from "./volume";

/** Every KPI the calculator knows. The service runs each one; the page reads their labels. Adding a metric: a file here, a line in the service, a column on the page. */
export const KPIS = [volumeKpi, retentionKpi, stoppedKpi, punctualityKpi] as const;
export { punctualityKpi, retentionKpi, stoppedKpi, volumeKpi };
export { ON_TIME_GRACE_MIN } from "./punctuality";
export { RETENTION_STEPS } from "./retention";
