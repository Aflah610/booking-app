/** The windows the Therapist Performance Calculator offers. Rolling: "30d" is the 30 days up to now. */
export const PERIODS = [
  { key: "10d", label: "Last 10 days", days: 10 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "6m", label: "Last 6 months", days: 183 },
  { key: "1y", label: "Last year", days: 365 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];
export const DEFAULT_PERIOD: PeriodKey = "30d";

/** One booking that counts toward a person's treatment: not cancelled, not a no-show, not a slot given back after failed payment. */
export type SessionFact = {
  id: string;
  staffId: string;
  clientId: string;
  startsAt: Date;
  endsAt: Date;
  /** "completed" was marked by staff; "upcoming" is anything not marked, so one in the past is treated as held. */
  status: "upcoming" | "completed";
};

/** Everything one client has had (or has booked) with one therapist, oldest first. */
export type Journey = {
  staffId: string;
  clientId: string;
  sessions: SessionFact[];
};

/** When the therapist actually joined the video call, supplied by whatever integration knows (Google Meet later). */
export type Attendance = { joinedAt: Date };
export interface AttendanceSource {
  /** Join times for the given bookings; bookings the source knows nothing about are simply absent from the map. */
  forBookings(bookingIds: string[]): Promise<Map<string, Attendance>>;
}

export type KpiId = "volume" | "retention" | "stopped" | "punctuality";

export type VolumeResult = { kind: "volume"; sessions: number; clients: number };
export type RetentionStep = {
  /** "After the 1st session", and so on. */
  after: number;
  /** Clients whose Nth session with this therapist fell in the window. */
  cohort: number;
  returned: number;
  /** Did not come back, and the grace period has passed. */
  lost: number;
  /** Did not book yet, but it is too soon to call them lost. */
  waiting: number;
  /** returned / (returned + lost); null when nobody in the cohort can be judged yet. */
  rate: number | null;
};
export type RetentionResult = { kind: "retention"; steps: RetentionStep[] };
export type StoppedResult = {
  kind: "stopped";
  /** Clients with at least one session in the window. */
  activeClients: number;
  stopped: number;
  ongoing: number;
  rate: number | null;
};
export type PunctualityResult =
  | { kind: "punctuality"; status: "no_data" }
  | { kind: "punctuality"; status: "ok"; measured: number; sessions: number; onTimeRate: number; avgMinutesLate: number };

export type KpiResult = VolumeResult | RetentionResult | StoppedResult | PunctualityResult;

export type TherapistReport = {
  staffId: string;
  name: string;
  designation: string | null;
  volume: VolumeResult;
  retention: RetentionResult;
  stopped: StoppedResult;
  punctuality: PunctualityResult;
};

export type PerformanceReport = {
  period: PeriodKey;
  label: string;
  from: Date;
  to: Date;
  /** Days after a session without a next booking before a client counts as lost or stopped. */
  graceDays: number;
  therapists: TherapistReport[];
};
