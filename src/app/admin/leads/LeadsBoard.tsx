import { app } from "@/features/container";
import { LEAD_STATUS_LABEL, LOST_REASONS, LOST_REASON_LABEL, type LeadSource, type LeadStatus } from "@/features/leads/leads.dto";
import { dayLabel, phoneLabel, timeLabel } from "@/lib/format";
import { allowed, type Me } from "@/lib/session";
import { DragBoard, type DragColumn } from "./DragBoard";

const TONE: Record<LeadStatus, string> = { new: "rose", attempted: "amber", contacted: "green", junk: "red", lost: "orange", converted: "emerald" };

/** The leads board, like the old CRM: New lead, Attempted to contact, Contacted, Junk lead, Lost lead. Cards can be dragged. */
export async function LeadsBoard({ me, q, assignedTo, source, tz, showOwner }: { me: Me; q?: string; assignedTo?: string; source?: LeadSource; tz: string; showOwner: boolean }) {
  const columns = await app().leads.board(me, { q, assignedTo, source });
  const contact = allowed(me, "clients.contact");
  const data: DragColumn[] = columns.map((col) => ({
    status: col.status,
    title: LEAD_STATUS_LABEL[col.status],
    tone: TONE[col.status],
    count: col.count,
    empty: col.status === "new" ? "No new leads." : "Nothing here.",
    cards: col.leads.map((l) => {
      const at = l.lastMessageAt ?? l.createdAt;
      return {
        id: l.id,
        title: l.clientName || phoneLabel(l.clientPhone),
        owner: showOwner ? l.assignedName ?? "Not assigned" : null,
        when: `${dayLabel(at, tz)}, ${timeLabel(at, tz)}`,
        phone: contact ? phoneLabel(l.clientPhone) : null,
        badge: l.source === "whatsapp_ad" ? "Meta ad" : l.source === "manual" ? "Added by staff" : null,
      };
    }),
  }));
  return <DragBoard columns={data} lostReasons={LOST_REASONS.map((r) => ({ value: r, label: LOST_REASON_LABEL[r] }))} />;
}
