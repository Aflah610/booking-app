import type { AccessHolder } from "@/features/access/permissions";
export const LEAD_STATUSES = ["new", "contacted", "follow_up", "converted", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = "whatsapp_ad" | "whatsapp" | "manual";

/** A lead is open until it is converted (the person booked) or marked lost. */
export const OPEN_STATUSES: readonly LeadStatus[] = ["new", "contacted", "follow_up"];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  follow_up: "Follow up",
  converted: "Converted",
  lost: "Lost",
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  whatsapp_ad: "WhatsApp ad",
  whatsapp: "WhatsApp",
  manual: "Added by staff",
};


export type LeadDTO = {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  source: LeadSource;
  adId: string | null;
  adHeadline: string | null;
  adUrl: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  status: LeadStatus;
  /** YYYY-MM-DD. */
  followUpOn: string | null;
  notes: string | null;
  lastMessageAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
};

/** What happened to an incoming message: a new lead, an update to an open one, or a known client (support, not sales). */
export type CaptureResult =
  | { kind: "created"; lead: LeadDTO }
  | { kind: "existing"; lead: LeadDTO }
  | { kind: "client" };

/** Who is looking at leads. Sales executives see their own; managers and admins see everyone's. */
export type LeadViewer = { id: string } & AccessHolder;
