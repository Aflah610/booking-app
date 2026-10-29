import { can, type AccessHolder } from "@/features/access/permissions";

/**
 * Blanks clients' phone and email for people whose role may not see contact details ("clients.contact"), such as
 * psychologists. Done on the data, before it reaches any component, so no table or page can show it by accident.
 */
export function withoutContact<T extends { clientPhone?: string; clientEmail?: string | null }>(viewer: AccessHolder, rows: T[]): T[] {
  if (can(viewer, "clients.contact")) return rows;
  return rows.map((r) => ({ ...r, ...("clientPhone" in r ? { clientPhone: "" } : {}), ...("clientEmail" in r ? { clientEmail: null } : {}) }));
}

/** Apply the same contact permission to performance pages and their CSV download. */
export function withoutPerformanceContact(viewer: AccessHolder, detail: import("@/features/performance/performance.dto").TherapistDetail) {
  if (can(viewer, "clients.contact")) return detail;
  return { ...detail, sessions: withoutContact(viewer, detail.sessions), clients: detail.clients.map((c) => ({ ...c, phone: "" })) };
}
