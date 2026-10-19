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

export type KpiId = "volume" | "retention" | "termination" | "punctuality";

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
export type TerminationResult = {
  kind: "termination";
  /** Clients with at least one session in the window. */
  activeClients: number;
  /** Treatment has ended: nothing booked and the last session is past the grace period (a successful completion or an early termination). */
  terminated: number;
  ongoing: number;
  rate: number | null;
};
export type PunctualityResult =
  | { kind: "punctuality"; status: "no_data" }
  | { kind: "punctuality"; status: "ok"; measured: number; sessions: number; onTimeRate: number; avgMinutesLate: number };

export type KpiResult = VolumeResult | RetentionResult | TerminationResult | PunctualityResult;

export type TherapistReport = {
  staffId: string;
  name: string;
  designation: string | null;
  volume: VolumeResult;
  retention: RetentionResult;
  termination: TerminationResult;
  punctuality: PunctualityResult;
};

export type PerformanceReport = {
  period: PeriodKey;
  label: string;
  from: Date;
  to: Date;
  /** Days after a session without a next booking before a client counts as lost or terminated. */
  graceDays: number;
  therapists: TherapistReport[];
};

/** What happened to a client after a session: came back (or is booked), is still within the grace period, or did not return. */
export type SessionOutcome = "came_back" | "waiting" | "not_back";

/** One session on a therapist's own page. */
export type SessionRow = {
  id: string;
  /** The booking's number, for its reference such as BK-00012. */
  number: number;
  startsAt: Date;
  endsAt: Date;
  clientId: string;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  /** False for a session still booked ahead. */
  held: boolean;
  /** Which session this is with this therapist (1st, 2nd ...); null while booked ahead. */
  ordinal: number | null;
  /** Only for sessions that have happened. */
  outcome: SessionOutcome | null;
};

/** Where one client stands with this therapist. */
export type ClientRow = {
  clientId: string;
  name: string;
  phone: string;
  /** Sessions held inside the period, and in all. */
  sessionsInPeriod: number;
  sessionsTotal: number;
  firstAt: Date;
  lastAt: Date | null;
  nextAt: Date | null;
  /** "new": nothing held yet; "ongoing": something booked ahead; "recent": last session within the grace period; "terminated": treatment has ended. */
  status: "new" | "ongoing" | "recent" | "terminated";
};

/** Everything on one therapist's own page. */
export type TherapistDetail = {
  therapist: TherapistReport;
  period: PeriodKey;
  label: string;
  from: Date;
  to: Date;
  graceDays: number;
  clients: ClientRow[];
  sessions: SessionRow[];
};

/** Names attached to a booking, looked up for the sessions on a therapist's page. */
export type SessionLabel = { number: number; clientId: string; clientName: string; clientPhone: string; serviceName: string };
