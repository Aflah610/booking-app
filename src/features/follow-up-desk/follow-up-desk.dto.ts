import type { Designation, StaffDTO } from "@/features/staff/staff.dto";

export const COORDINATOR: Designation = "Consultation Coordinator";

export const REQUEST_STATUSES = ["new", "contacting", "waiting_psychologist", "booked", "declined"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const OPEN_REQUEST_STATUSES: readonly RequestStatus[] = ["new", "contacting", "waiting_psychologist"];

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  new: "New",
  contacting: "Contacting client",
  waiting_psychologist: "Waiting for psychologist",
  booked: "Booked",
  declined: "Client declined",
};

export const PARTS_OF_DAY = ["morning", "afternoon", "evening"] as const;
export type PartOfDay = (typeof PARTS_OF_DAY)[number];

/** Who is looking: the permission rules only need these. */
export type DeskViewer = Pick<StaffDTO, "id" | "role" | "designation">;

export type FollowUpRequestDTO = {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  psychologistId: string;
  psychologistName: string;
  createdBy: string;
  suggestedOn: string | null;
  partOfDay: PartOfDay | null;
  status: RequestStatus;
  bookingId: string | null;
  lastMessageAt: Date;
  closedAt: Date | null;
  createdAt: Date;
};

/** A request as it appears in someone's list, with whether it has news for them. */
export type FollowUpListItem = FollowUpRequestDTO & { unread: boolean; lastMessage: string | null };

export type FollowUpMessageDTO = { id: string; authorId: string; authorName: string; authorDesignation: Designation | null; body: string; createdAt: Date };
