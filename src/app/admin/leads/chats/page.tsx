import Link from "next/link";
import { redirect } from "next/navigation";
import { app } from "@/features/container";
import { canUseLeads } from "@/features/leads/leads.service";
import { dayLabel, phoneLabel, timeLabel } from "@/lib/format";
import { allowed, requireStaff } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PageHeader } from "@/components/Shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chats" };

export default async function ChatsPage() {
  const me = await requireStaff();
  if (!canUseLeads(me)) redirect("/?error=forbidden");
  const [rows, s] = await Promise.all([app().whatsappChat.conversations(me), app().settings.get()]);
  return (
    <>
      <Link href="/admin/leads" className="text-sm text-zinc-600 hover:text-black">← Leads</Link>
      <div className="mt-4">
        <PageHeader title="Chats" subtitle={allowed(me, "leads.all") ? "Every WhatsApp chat on the leads number." : "WhatsApp chats with your leads."} />
      </div>
      <AutoRefresh seconds={20} />
      <div className="card divide-y divide-zinc-100 overflow-hidden">
        {rows.length === 0 && <p className="p-6 text-center text-sm text-zinc-500">No chats yet. They appear here when someone messages the leads number.</p>}
        {rows.map((c) => (
          <Link key={c.clientId} href={`/admin/leads/chats/${c.clientId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className={`truncate ${c.unread ? "font-semibold" : "font-medium"}`}>{c.name || phoneLabel(c.phoneE164)}</span>
                <span className="shrink-0 text-xs text-zinc-500">{dayLabel(c.lastAt, s.timezone)}, {timeLabel(c.lastAt, s.timezone)}</span>
              </span>
              <span className="mt-0.5 block truncate text-sm text-zinc-600">{c.lastDirection === "out" && "You: "}{c.lastText}</span>
            </span>
            {c.unread > 0 && <span className="rounded-full bg-red-600 px-2 text-xs font-semibold leading-5 text-white">{c.unread}</span>}
          </Link>
        ))}
      </div>
    </>
  );
}
