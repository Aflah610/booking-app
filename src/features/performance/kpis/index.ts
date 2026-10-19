import { punctualityKpi } from "./punctuality";
import { retentionKpi } from "./retention";
import { conclusionKpi } from "./conclusion";
import { volumeKpi } from "./volume";

/** Every KPI the calculator knows. The service runs each one; the page reads their labels. Adding a metric: a file here, a line in the service, a column on the page. */
export const KPIS = [volumeKpi, retentionKpi, conclusionKpi, punctualityKpi] as const;
export { punctualityKpi, retentionKpi, conclusionKpi, volumeKpi };
export { ON_TIME_GRACE_MIN } from "./punctuality";
export { RETENTION_STEPS } from "./retention";
