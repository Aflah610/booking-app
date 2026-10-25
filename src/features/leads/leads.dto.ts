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

export const LOST_REASONS = ["price", "not_interested", "no_reply", "wrong_number", "other"] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const LOST_REASON_LABEL: Record<LostReason, string> = {
  price: "Too expensive",
  not_interested: "Not interested",
  no_reply: "No reply",
  wrong_number: "Wrong number or spam",
  other: "Other",
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
  lostReason: LostReason | null;
  dealAmountPaise: number | null;
  dealNote: string | null;
  /** What the converting booking was for, e.g. "Individual therapy" or a package name. */
  dealWhat: string | null;
  createdAt: Date;
};

export type LeadFilters = {
  view?: "open" | "closed" | "all";
  status?: LeadStatus;
  assignedTo?: string;
  source?: LeadSource;
  /** YYYY-MM-DD, by the day the lead came in (firm's time zone). */
  from?: string;
  to?: string;
  /** Only open leads to follow up on or before this YYYY-MM-DD. */
  followUpBy?: string;
  q?: string;
};

/** One row of the managers' summary: a sales executive's leads over a period. */
export type LeadSummaryRow = { staffId: string | null; name: string; newLeads: number; contacted: number; converted: number; lost: number; dealPaise: number };

/** What happened to an incoming message: a new lead, an update to an open one, or a known client (support, not sales). */
export type CaptureResult =
  | { kind: "created"; lead: LeadDTO }
  | { kind: "existing"; lead: LeadDTO }
  | { kind: "client" };

/** Who is looking at leads. Sales executives see their own; managers and admins see everyone's. */
export type LeadViewer = { id: string } & AccessHolder;
