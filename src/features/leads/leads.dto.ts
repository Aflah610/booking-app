import type { AccessHolder } from "@/features/access/permissions";
/** The lead stages, as in the old Zoho CRM: every new WhatsApp chat starts at New lead. Converted = booked (it moves to Deals). */
export const LEAD_STATUSES = ["new", "attempted", "contacted", "junk", "lost", "converted"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = "whatsapp_ad" | "whatsapp" | "manual";

/** A lead is open until it is converted (the person booked), marked lost or marked junk. */
export const OPEN_STATUSES: readonly LeadStatus[] = ["new", "attempted", "contacted"];
export const CLOSED_STATUSES: readonly LeadStatus[] = ["converted", "lost", "junk"];

/** The columns of the leads board, left to right. */
export const BOARD_STATUSES: readonly LeadStatus[] = ["new", "attempted", "contacted", "junk", "lost"];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New lead",
  attempted: "Attempted to contact",
  contacted: "Contacted",
  junk: "Junk lead",
  lost: "Lost lead",
  converted: "Converted",
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

/** Website booking attempts as sales deals: unpaid within 48 hours, then lost; paid = won. */
export const DEAL_STAGES = ["pending", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export const DEAL_STAGE_LABEL: Record<DealStage, string> = { pending: "Payment pending", won: "Closed won", lost: "Closed lost" };
/** How long a website visitor who didn't pay stays in Payment pending before the deal counts as lost. */
export const DEAL_PENDING_HOURS = 48;

export type WebsiteDeal = {
  stage: DealStage;
  bookingId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  staffName: string;
  amountPaise: number | null;
  /** When they tried to book. */
  createdAt: Date;
  startsAt: Date;
  /** Their lead, if they came in as one. */
  leadId: string | null;
  leadOwner: string | null;
};

/** Who is looking at leads. Sales executives see their own; managers and admins see everyone's. */
export type LeadViewer = { id: string } & AccessHolder;
