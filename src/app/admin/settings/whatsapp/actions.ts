"use server";

import { app } from "@/features/container";
import { act, str } from "@/lib/form-actions";
import { requirePermission } from "@/lib/session";
import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CALLBACK_PATH, callbackUrl, dialogUrl, PENDING_COOKIE, seal } from "@/features/whatsapp-connect/oauth";
import { WHATSAPP_PURPOSES } from "@/features/whatsapp-connect/whatsapp-connect.dto";

const ids = z.object({
  wabaId: z.string().trim().regex(/^\d{5,25}$/, "Enter the WhatsApp account id (numbers only)"),
  phoneNumberId: z.string().trim().regex(/^\d{5,25}$/, "Enter the phone number id (numbers only)"),
  pin: z.string().trim().regex(/^\d{6}$/, "The PIN must be 6 digits"),
});

/** A number with no phone app: keep what to connect in a sealed cookie, then open Facebook's sign-in page. */
export async function startLeadsConnectAction(form: FormData) {
  const me = await requirePermission("settings.manage");
  const parsed = ids.safeParse({ wabaId: str(form, "wabaId"), phoneNumberId: str(form, "phoneNumberId"), pin: str(form, "pin") });
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_ES_CONFIG_ID;
  const secret = process.env.AUTH_SECRET;
  const appUrl = process.env.AUTH_URL;
  if (!parsed.success) redirect(`/admin/settings/whatsapp?${new URLSearchParams({ error: parsed.error.issues[0].message })}`);
  if (!appId || !configId || !secret || !appUrl) redirect(`/admin/settings/whatsapp?${new URLSearchParams({ error: "Waiting for the server settings META_APP_ID, META_ES_CONFIG_ID, AUTH_SECRET and AUTH_URL" })}`);
  const { cookie, state } = seal({ purpose: "leads", ...parsed.data, staffId: me.id }, secret);
  (await cookies()).set(PENDING_COOKIE, cookie, { httpOnly: true, secure: true, sameSite: "lax", path: CALLBACK_PATH, maxAge: 600 });
  redirect(dialogUrl(appId, configId, callbackUrl(appUrl), state));
}

export async function connectWhatsAppAction(form: FormData) {
  const me = await requirePermission("settings.manage");
  const purpose = z.enum(WHATSAPP_PURPOSES).parse(str(form, "purpose"));
  await act("/admin/settings/whatsapp", purpose === "leads" ? "Leads number connected: new chats now become leads" : "CCD number connected. Approved templates and sending setup are needed for automatic messages", () =>
    app().whatsappConnect.connect(me, purpose, { code: str(form, "code"), wabaId: str(form, "wabaId"), phoneNumberId: str(form, "phoneNumberId"), pin: str(form, "pin") || undefined }),
  );
}
