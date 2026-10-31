import type { IncomingMessage } from "./whatsapp-webhook";

/**
 * Sends a WhatsApp lead to the Google Sheets lead files (Master, split 50/50 into BDE 1 and BDE 2) through the Apps
 * Script web app in docs/leads-sheets.gs. Off until LEADS_SHEET_URL and LEADS_SHEET_KEY are set on the server.
 */
export async function sendToLeadsSheet(lead: IncomingMessage): Promise<void> {
  const url = process.env.LEADS_SHEET_URL;
  const key = process.env.LEADS_SHEET_KEY;
  if (!url || !key) return;
  const source = lead.source === "whatsapp_ad" ? `Meta ad${lead.adHeadline ? `: ${lead.adHeadline}` : ""}` : "WhatsApp 774";
  // The phone travels in the body, never in the address.
  const res = await fetch(`${url}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: lead.name, phone: lead.phone, message: lead.text ?? "", source, receivedAt: (lead.at ?? new Date()).toISOString() }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Leads sheet answered ${res.status}`);
}
