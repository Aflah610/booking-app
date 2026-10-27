import type { Designation } from "@/features/staff/staff.dto";

export type ClientDTO = {
  id: string;
  /** The short running number staff quote; see clientReference. */
  number: number;
  name: string;
  phoneE164: string;
  /** Set only for MCH clients copied with a shared or unreadable number: show this instead of phoneE164. */
  phoneAsEntered: string | null;
  email: string | null;
  whatsappOptIn: boolean;
  notes: string | null;
  /** YYYY-MM-DD. */
  dateOfBirth: string | null;
  /** Age as told at registration; used only when there is no date of birth. */
  age: number | null;
  gender: string | null;
  maritalStatus: string | null;
  occupation: string | null;
  education: string | null;
  location: string | null;
  address: string | null;
  languages: string | null;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyPhone: string | null;
  referralSource: string | null;
  /** Their old MCH client code (ML-CL-00042), for clients copied from MCH. */
  mchCode: string | null;
  consentSignedAt: Date | null;
  registeredBy: string | null;
  createdAt: Date;
};

/** Choices on the client forms; a value saved before these existed is still shown. */
export const GENDERS = ["Female", "Male", "Non-binary", "Other", "Prefer not to say"];
export const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed", "Separated", "Other"];

/** True for the placeholder key given to an MCH client whose number couldn't be used (see client.phoneAsEntered). */
export const isPlaceholderPhone = (e164: string) => e164.startsWith("+9100");

/** CL-00142. */
export function clientReference(number: number): string {
  return `CL-${String(number).padStart(5, "0")}`;
}

/** Whole years from a YYYY-MM-DD birth date to `today` (YYYY-MM-DD), or the age recorded at registration. */
export function clientAge(c: Pick<ClientDTO, "dateOfBirth" | "age">, today: string): number | null {
  if (!c.dateOfBirth) return c.age;
  const [by, bm, bd] = c.dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** A row of the clients directory: the client plus who treats them and how far their case history is. */
export type ClientDirectoryRow = ClientDTO & {
  bookings: number;
  therapistId: string | null;
  therapistName: string | null;
  therapistActive: boolean | null;
  assignedByName: string | null;
  registeredByName: string | null;
  /** Null until a case history is started. */
  caseStatus: "intake_pending" | "in_treatment" | "concluded" | null;
};

export type ClientDirectoryFilters = {
  q?: string;
  /** A staff id, or "unassigned". */
  therapist?: string;
  /** Only clients this staff member treats now or has treated. */
  treatedBy?: string;
  from?: Date;
  to?: Date;
};

/** One period a therapist was assigned to a client, newest first in lists. */
export type TherapistPeriodDTO = {
  id: string;
  staffId: string;
  staffName: string;
  designation: Designation | null;
  /** False once the therapist has left the firm. */
  staffActive: boolean;
  startsAt: Date;
  endsAt: Date | null;
  assignedByName: string | null;
  reason: string | null;
  /** Completed sessions with this therapist during the period. */
  sessions: number;
};

/** Contact details a booking request carries; matched to an existing client by phone. */
export type ClientContact = { name: string; phoneE164: string; email: string | null; whatsappOptIn: boolean };
