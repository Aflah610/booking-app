import Link from "next/link";
import { app } from "@/features/container";
import { dateLabel, timeLabel } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { ConnectWhatsApp } from "@/components/ConnectWhatsApp";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { connectWhatsAppAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp" };

export default async function WhatsAppSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requirePermission("settings.manage");
  const sp = await searchParams;
  const [c, s] = await Promise.all([app().whatsappConnect.status(), app().settings.get()]);
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_ES_CONFIG_ID;
  const ready = Boolean(appId && configId && process.env.WHATSAPP_APP_SECRET);

  return (
    <>
      <Link href="/admin/settings" className="text-sm text-zinc-600 hover:text-black">← Settings</Link>
      <PageHeader title="WhatsApp" subtitle="The number clients chat with. Every new chat becomes a lead, and the team keeps replying from the WhatsApp Business app on the phone." />
      <Notice error={sp.error} ok={sp.ok} />
      <section className="card grid max-w-2xl gap-4 p-6">
        {c.phoneNumberId ? (
          <p className="text-sm">
            <span className="badge border-green-300 text-green-700">Connected</span>{" "}
            Number id {c.phoneNumberId} (account {c.wabaId}){c.connectedAt ? `, since ${dateLabel(c.connectedAt, s.timezone)}, ${timeLabel(c.connectedAt, s.timezone)}` : ""}.
          </p>
        ) : (
          <p className="text-sm text-zinc-600">Not connected yet.</p>
        )}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
          <li>Make sure the number is no longer connected to another system (for example Zoho CRM).</li>
          <li>On the phone, open the WhatsApp Business app with that number.</li>
          <li>Press the button, sign in to Facebook, choose the Mind Lap business and &quot;Connect your existing WhatsApp Business app&quot;.</li>
          <li>Scan the QR code Meta shows with the WhatsApp Business app (Settings → Linked devices or the prompt it shows).</li>
        </ol>
        {ready ? (
          <ConnectWhatsApp appId={appId!} configId={configId!} onDone={connectWhatsAppAction} />
        ) : (
          <p className="text-sm text-red-700">Waiting for the server settings META_APP_ID, META_ES_CONFIG_ID and WHATSAPP_APP_SECRET.</p>
        )}
      </section>
    </>
  );
}
