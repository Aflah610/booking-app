import Link from "next/link";
import { app } from "@/features/container";
import type { WhatsAppSlot } from "@/features/whatsapp-connect/whatsapp-connect.dto";
import { dateLabel, timeLabel } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { ConnectWhatsApp } from "@/components/ConnectWhatsApp";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { connectWhatsAppAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp" };

const NUMBERS = [
  {
    purpose: "leads" as const,
    title: "Leads number (sales)",
    what: "The number in your ads and on the website. Every new chat becomes a lead for the BDE on duty.",
    button: "Connect leads number",
  },
  {
    purpose: "messages" as const,
    title: "Messages number (CCD)",
    what: "Use this number for booking confirmations, reminders with the join link and follow-ups. Clients reply to the CCD on the phone. Automatic messages need approved templates, Meta billing and a sending token.",
    button: "Connect messages number",
  },
];

export default async function WhatsAppSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requirePermission("settings.manage");
  const sp = await searchParams;
  const [c, s] = await Promise.all([app().whatsappConnect.status(), app().settings.get()]);
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_ES_CONFIG_ID;
  const ready = Boolean(appId && configId && process.env.WHATSAPP_APP_SECRET);
  const since = (slot: WhatsAppSlot) => (slot.connectedAt ? `, since ${dateLabel(slot.connectedAt, s.timezone)}, ${timeLabel(slot.connectedAt, s.timezone)}` : "");

  return (
    <>
      <Link href="/admin/settings" className="text-sm text-zinc-600 hover:text-black">← Settings</Link>
      <PageHeader title="WhatsApp" subtitle="Both numbers stay on the WhatsApp Business app on their phones; the booking app is linked to them as well." />
      <Notice error={sp.error} ok={sp.ok} />
      <div className="grid max-w-2xl gap-6">
        {NUMBERS.map((n) => {
          const slot = c[n.purpose];
          return (
            <section key={n.purpose} className="card grid gap-3 p-6">
              <h2 className="font-semibold">{n.title}</h2>
              <p className="text-sm text-zinc-600">{n.what}</p>
              {slot.phoneNumberId ? (
                <p className="text-sm"><span className="badge border-green-300 text-green-700">Connected</span> Number id {slot.phoneNumberId} (account {slot.wabaId}){since(slot)}.</p>
              ) : (
                <p className="text-sm text-zinc-600">Not connected yet.</p>
              )}
              {n.purpose === "messages" && slot.phoneNumberId && !process.env.WHATSAPP_ACCESS_TOKEN && (
                <p className="text-sm text-amber-800">Connected for replies. Automatic sending is waiting for the server sending token.</p>
              )}
              {ready ? (
                <ConnectWhatsApp appId={appId!} configId={configId!} purpose={n.purpose} label={slot.phoneNumberId ? "Connect again" : n.button} onDone={connectWhatsAppAction} />
              ) : (
                <p className="text-sm text-red-700">Waiting for the server settings META_APP_ID, META_ES_CONFIG_ID and WHATSAPP_APP_SECRET.</p>
              )}
            </section>
          );
        })}
        <section className="card p-6">
          <h2 className="mb-2 font-semibold">How to connect a number</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
            <li>Make sure the number is no longer connected to another system (for example Zoho CRM).</li>
            <li>Keep the phone with that number&apos;s WhatsApp Business app at hand.</li>
            <li>Press the button, sign in to Facebook, choose the Mind Lap business and &quot;Connect your existing WhatsApp Business app&quot;.</li>
            <li>Scan the QR code Meta shows with the WhatsApp Business app.</li>
          </ol>
        </section>
      </div>
    </>
  );
}
