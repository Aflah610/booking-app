"use server";

import { app } from "@/features/container";
import { act, str } from "@/lib/form-actions";
import { requireStaff } from "@/lib/session";

export async function replyToChatAction(clientId: string, form: FormData) {
  const me = await requireStaff();
  await act(`/admin/leads/chats/${clientId}`, "Sent", () => app().whatsappChat.reply(me, clientId, { text: str(form, "text") }));
}
