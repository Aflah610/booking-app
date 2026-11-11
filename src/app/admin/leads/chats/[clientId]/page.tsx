import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/features/container";
import type { ChatMessageDTO } from "@/features/whatsapp-chat/whatsapp-chat.dto";
import { isDomainError } from "@/features/shared/errors";
import { dayLabel, phoneLabel, timeLabel } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Notice } from "@/components/Notice";
import { replyToChatAction } from "../../chat-actions";
import { VoiceNote } from "./VoiceNote";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat" };

const BOOKING_LINK = process.env.WEBSITE_BOOKING_URL ?? "https://mindlap.in/book/";
const TICKS: Record<string, string> = { sent: "Sent", delivered: "Delivered", read: "Read", failed: "Not sent" };

function Attachment({ m }: { m: ChatMessageDTO }) {
  if (!m.mediaId) return m.kind === "other" ? <p className="italic text-zinc-500">A message type that can&apos;t be shown here</p> : null;
  const src = `/api/whatsapp/media/${m.id}`;
  // eslint-disable-next-line @next/next/no-img-element
  if (m.kind === "image") return <a href={src} target="_blank" rel="noopener"><img src={src} alt="Sent by the client" className="max-h-72 rounded-md" /></a>;
  if (m.kind === "audio") return <audio controls preload="none" src={src} className="max-w-full" />;
  if (m.kind === "video") return <video controls preload="none" src={src} className="max-h-72 max-w-full rounded-md" />;
  return <a className="underline" href={src} target="_blank" rel="noopener">Open file</a>;
}

export default async function ChatPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ draft?: string; error?: string; ok?: string }> }) {
  const me = await requireStaff();
  const { clientId } = await params;
  const sp = await searchParams;
  const chat = await app().whatsappChat.thread(me, clientId).catch((err) => {
    if (isDomainError(err)) notFound();
    throw err;
  });
  const { timezone: tz } = await app().settings.get();
  const { person, lead, messages, canReply, replyUntil } = chat;
  const first = person.name.split(/\s+/)[0];
  const draft = sp.draft === "booking" ? `Hi ${first}, you can choose a psychologist and a time that suits you here: ${BOOKING_LINK}` : "";

  return (
    <>
      <Link href="/admin/leads/chats" className="text-sm text-zinc-600 hover:text-black">← Chats</Link>
      <div className="mb-4 mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{person.name || phoneLabel(person.phoneE164)}</h1>
          <p className="mt-1 text-sm text-zinc-600">{phoneLabel(person.phoneE164)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost" href={`tel:${person.phoneE164}`}>Call</a>
          {lead && <Link className="btn-ghost" href={`/admin/leads/${lead.id}`}>Lead details</Link>}
        </div>
      </div>
      <Notice error={sp.error} ok={sp.ok} />
      <AutoRefresh seconds={10} />
      <div className="card grid max-w-3xl gap-2 p-4">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.direction === "out" ? "justify-self-end bg-violet-50" : "justify-self-start bg-zinc-100"}`}>
            <Attachment m={m} />
            {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
            <p className="mt-1 text-[11px] text-zinc-500">
              {dayLabel(m.at, tz)}, {timeLabel(m.at, tz)}
              {m.direction === "out" && <> · {m.staffName ?? "Automatic welcome"} · <span className={m.status === "failed" ? "font-medium text-red-700" : ""}>{TICKS[m.status] ?? m.status}</span></>}
            </p>
            {m.error && <p className="mt-1 text-xs text-red-700">{m.error}</p>}
          </div>
        ))}
      </div>
      {canReply ? (
        <form key={messages.length} action={replyToChatAction.bind(null, clientId)} className="mt-4 grid max-w-3xl gap-2">
          <label className="label" htmlFor="text">Reply</label>
          <textarea className="input" id="text" name="text" rows={3} maxLength={4096} defaultValue={draft} required />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button className="btn" type="submit">Send</button>
            {replyUntil && <p className="text-xs text-zinc-500">You can reply until {dayLabel(replyUntil, tz)}, {timeLabel(replyUntil, tz)}</p>}
          </div>
        </form>
      ) : null}
      {canReply ? (
        <div className="mt-3 max-w-3xl">
          <VoiceNote clientId={clientId} />
        </div>
      ) : (
        <p className="mt-4 max-w-3xl rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          WhatsApp allows a reply only within 24 hours of their last message. Call them, or wait for them to write again.
        </p>
      )}
    </>
  );
}
