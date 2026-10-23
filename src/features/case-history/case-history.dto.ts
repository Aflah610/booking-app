import type { AFFECT, CASE_STATUS, COOPERATION, DELIVERY, INSIGHT, JUDGEMENT, ONSET, PART_OF_DAY, PROGRESS, RAPPORT, RESPONSE, Risk, SEVERITY } from "./choices";

export type CaseStatus = (typeof CASE_STATUS)[number];

/** The intake assessment, field by field. Every field is optional until the intake is marked complete. */
export type IntakeFields = {
  presentingComplaints: string | null;
  onset: (typeof ONSET)[number] | null;
  duration: string | null;
  severity: (typeof SEVERITY)[number] | null;
  historyPresent: string | null;
  pastPsychiatric: string | null;
  medicalHistory: string | null;
  medication: string | null;
  familyHistory: string | null;
  personalHistory: string | null;
  substanceUse: string | null;
  premorbidPersonality: string | null;
  mseAppearance: string | null;
  mseCooperation: (typeof COOPERATION)[number] | null;
  mseRapport: (typeof RAPPORT)[number] | null;
  mseSpeech: string | null;
  mseMood: string | null;
  mseAffect: (typeof AFFECT)[number] | null;
  mseThought: string | null;
  msePerception: string | null;
  mseCognition: string | null;
  mseInsight: (typeof INSIGHT)[number] | null;
  mseJudgement: (typeof JUDGEMENT)[number] | null;
  riskSuicide: Risk | null;
  riskSelfHarm: Risk | null;
  riskOthers: Risk | null;
  diagnosisCode: string | null;
  diagnosisLabel: string | null;
  diagnosisSecondary: string | null;
  diagnosisSpecifiers: string | null;
  formulation: string | null;
  goalsShort: string | null;
  goalsLong: string | null;
  approach: string | null;
  frequency: string | null;
  planNotes: string | null;
};

export type AddendumDTO = { id: string; authorName: string; text: string; createdAt: Date };

export type SessionNoteDTO = {
  id: string;
  number: number;
  bookingId: string | null;
  sessionAt: Date;
  authorId: string;
  authorName: string;
  summary: string;
  risk: Risk | null;
  response: (typeof RESPONSE)[number] | null;
  progress: (typeof PROGRESS)[number] | null;
  nextPlan: string | null;
  homework: string | null;
  /** YYYY-MM-DD. */
  followUpOn: string | null;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  addenda: AddendumDTO[];
};

export type Delivery = (typeof DELIVERY)[number];

/** A suggested next session sent to the client. It books nothing. */
export type FollowUpDTO = {
  id: string;
  /** YYYY-MM-DD. */
  suggestedOn: string;
  partOfDay: (typeof PART_OF_DAY)[number] | null;
  note: string | null;
  sentByName: string;
  whatsapp: Delivery;
  email: Delivery;
  createdAt: Date;
};

export type CaseRecordDTO = IntakeFields & {
  id: string;
  clientId: string;
  status: CaseStatus;
  /** The highest of the three risk ratings. */
  risk: Risk | null;
  intakeCompletedAt: Date | null;
  intakeCompletedByName: string | null;
  updatedAt: Date;
  /** Newest first. */
  notes: SessionNoteDTO[];
  /** Newest first. */
  followUps: FollowUpDTO[];
};

/** One row of the case histories list. Clinical fields are null when the reader may not see this client's record. */
export type CaseListRow = {
  clientId: string;
  clientName: string;
  clientNumber: number;
  clientPhone: string;
  status: CaseStatus;
  risk: Risk | null;
  restricted: boolean;
  diagnosisCode: string | null;
  diagnosisLabel: string | null;
  therapistId: string | null;
  therapistName: string | null;
  therapistActive: boolean;
  notes: number;
  lastNoteAt: Date | null;
  lastNoteAuthor: string | null;
};

export type CaseListFilters = {
  q?: string;
  status?: CaseStatus | "high_risk";
  /** A staff id, or "unassigned". */
  therapist?: string;
  risk?: Risk;
  /** The last session note falls in [from, to). */
  from?: Date;
  to?: Date;
};

/** A past booking a note can be written for. */
export type NoteableBooking = { id: string; startsAt: Date; serviceName: string; staffName: string };
