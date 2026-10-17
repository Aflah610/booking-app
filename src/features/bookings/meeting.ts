/**
 * Whether a booking is an online session. The firm's switch must be on; then the service decides ("Google Meet" or
 * in person), and staff can override that for one booking ("on" or "off").
 */
export function isOnlineSession(b: { meetingType: "in_person" | "google_meet"; meetingOverride: string | null }, firmEnabled: boolean): boolean {
  if (!firmEnabled) return false;
  if (b.meetingOverride === "on") return true;
  if (b.meetingOverride === "off") return false;
  return b.meetingType === "google_meet";
}

/** What clients see: a ready link, one on its way, or nothing (in-person). */
export type MeetingState = "none" | "ready" | "pending";
export function meetingState(b: { meetingUrl: string | null; online: boolean }): MeetingState {
  if (b.meetingUrl) return "ready";
  return b.online ? "pending" : "none";
}
