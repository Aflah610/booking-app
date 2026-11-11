import Link from "next/link";
import { app } from "@/features/container";
import { LEAD_STATUS_LABEL, type LeadSource, type LeadStatus } from "@/features/leads/leads.dto";
import { dayLabel, phoneLabel, timeLabel } from "@/lib/format";
import { allowed, type Me } from "@/lib/session";
import { Board, type BoardColumn } from "@/components/Board";

const TONE: Record<LeadStatus, BoardColumn["tone"]> = { new: "rose", attempted: "amber", contacted: "green", junk: "red", lost: "orange", converted: "emerald" };

/** The leads board, like the old CRM: New lead, Attempted to contact, Contacted, Junk lead, Lost lead. */
export async function LeadsBoard({ me, q, assignedTo, source, tz }: { me: Me; q?: string; assignedTo?: string; source?: LeadSource; tz: string }) {
  const columns = await app().leads.board(me, { q, assignedTo, source });
  const manager = allowed(me, "leads.all");
  const contact = allowed(me, "clients.contact");
  return (
    <Board
      columns={columns.map((col) => ({
        key: col.status,
        title: LEAD_STATUS_LABEL[col.status],
        tone: TONE[col.status],
        count: col.count,
        empty: col.status === "new" ? "No new leads." : "Nothing here.",
        cards: col.leads.map((l) => {
          const at = l.lastMessageAt ?? l.createdAt;
          return (
            <Link key={l.id} href={`/admin/leads/${l.id}`} className="card block p-3 text-sm hover:border-zinc-400">
              <p className="truncate font-semibold">{l.clientName || phoneLabel(l.clientPhone)}</p>
              {manager && <p className="truncate text-zinc-600">{l.assignedName ?? "Not assigned"}</p>}
              <p className="text-xs text-zinc-600">{dayLabel(at, tz)}, {timeLabel(at, tz)}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {l.source === "whatsapp_ad" && <span className="badge">Meta ad</span>}
                {l.source === "manual" && <span className="badge">Added by staff</span>}
                {contact && <span className="text-xs tabular-nums text-zinc-600">{phoneLabel(l.clientPhone)}</span>}
              </div>
            </Link>
          );
        }),
      }))}
    />
  );
}
