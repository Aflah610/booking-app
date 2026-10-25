"use server";

import { app } from "@/features/container";
import { act, str } from "@/lib/form-actions";
import { requirePermission } from "@/lib/session";

export async function connectWhatsAppAction(form: FormData) {
  const me = await requirePermission("settings.manage");
  await act("/admin/settings/whatsapp", "WhatsApp connected: new chats now become leads", () =>
    app().whatsappConnect.connect(me, { code: str(form, "code"), wabaId: str(form, "wabaId"), phoneNumberId: str(form, "phoneNumberId") }),
  );
}
