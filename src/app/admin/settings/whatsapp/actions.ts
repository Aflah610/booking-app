"use server";

import { app } from "@/features/container";
import { act, str } from "@/lib/form-actions";
import { requirePermission } from "@/lib/session";
import { z } from "zod";
import { WHATSAPP_PURPOSES } from "@/features/whatsapp-connect/whatsapp-connect.dto";

export async function connectWhatsAppAction(form: FormData) {
  const me = await requirePermission("settings.manage");
  const purpose = z.enum(WHATSAPP_PURPOSES).parse(str(form, "purpose"));
  await act("/admin/settings/whatsapp", purpose === "leads" ? "Leads number connected: new chats now become leads" : "CCD number connected. Approved templates and sending setup are needed for automatic messages", () =>
    app().whatsappConnect.connect(me, purpose, { code: str(form, "code"), wabaId: str(form, "wabaId"), phoneNumberId: str(form, "phoneNumberId") }),
  );
}
