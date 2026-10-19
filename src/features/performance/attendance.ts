import type { AttendanceSource } from "./performance.dto";

/** Used until a real source is connected: knows nothing, so the punctuality KPI reports "no data". */
export const noAttendanceSource: AttendanceSource = {
  async forBookings() {
    return new Map();
  },
};
