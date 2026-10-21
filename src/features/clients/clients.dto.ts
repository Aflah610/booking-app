import type { Designation } from "@/features/staff/staff.dto";

export type ClientDTO = {
  id: string;
  /** The short running number staff quote; see clientReference. */
  number: number;
  name: string;
  phoneE164: string;
  email: string | null;
  whatsappOptIn: boolean;
  notes: string | null;
  /** YYYY-MM-DD. */
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  occupation: string | null;
  education: string | null;
  location: string | null;
  languages: string | null;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyPhone: string | null;
  referralSource: string | null;
  consentSignedAt: Date | null;
  registeredBy: string | null;
  createdAt: Date;
};

/** CL-00142. */
export function clientReference(number: number): string {
  return `CL-${String(number).padStart(5, "0")}`;
}

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
