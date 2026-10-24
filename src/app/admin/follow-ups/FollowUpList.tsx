import Link from "next/link";
import { REQUEST_STATUS_LABEL, type FollowUpListItem } from "@/features/follow-up-desk/follow-up-desk.dto";
import { dayLabel, timeLabel } from "@/lib/format";

export const FOLLOW_UP_VIEWS = { open: "Open", closed: "Booked or declined", all: "All" } as const;
export type FollowUpView = keyof typeof FOLLOW_UP_VIEWS;

/** The left-hand list on the Follow-ups pages: one row per client, newest activity first, unread in bold. */
export function FollowUpList({ rows, view, activeId, tz, showPsychologist }: { rows: FollowUpListItem[]; view: FollowUpView; activeId?: string; tz: string; showPsychologist: boolean }) {
  return (
    <div className="card flex min-h-0 flex-col overflow-hidden">
      <nav className="flex gap-4 border-b border-zinc-200 px-4 pt-3 text-sm" aria-label="Which follow-ups">
        {Object.entries(FOLLOW_UP_VIEWS).map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/follow-ups?view=${key}`}
            aria-current={view === key ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2.5 ${view === key ? "border-black font-medium text-black" : "border-transparent text-zinc-600 hover:text-black"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <ul className="min-h-0 flex-1 divide-y divide-zinc-100 overflow-y-auto">
        {rows.length === 0 && <li className="px-4 py-10 text-center text-sm text-zinc-600">Nothing here.</li>}
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/follow-ups/${r.id}?view=${view}`}
              aria-current={r.id === activeId ? "page" : undefined}
              className={`block px-4 py-3 hover:bg-zinc-50 ${r.id === activeId ? "bg-zinc-100" : ""}`}
            >
              <div className="flex items-center gap-2">
                {r.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-red-600" aria-label="New message" />}
                <span className={`truncate ${r.unread ? "font-semibold" : "font-medium"}`}>{r.clientName}</span>
                <span className="ml-auto shrink-0 text-xs text-zinc-500">{dayLabel(r.lastMessageAt, tz)}, {timeLabel(r.lastMessageAt, tz)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-600">
                {showPsychologist && <span className="truncate">{r.psychologistName}</span>}
                <span className="badge shrink-0 py-0 text-[11px]">{REQUEST_STATUS_LABEL[r.status]}</span>
              </div>
              {r.lastMessage && <p className={`mt-1 line-clamp-1 text-sm ${r.unread ? "text-black" : "text-zinc-600"}`}>{r.lastMessage}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
