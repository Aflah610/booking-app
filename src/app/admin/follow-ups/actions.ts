"use server";

import { app } from "@/features/container";
import { act, optional, str } from "@/lib/form-actions";
import { requireStaff } from "@/lib/session";

export async function requestFollowUpAction(form: FormData) {
  const me = await requireStaff();
  const back = `/admin/follow-ups/new?${new URLSearchParams({ client: str(form, "clientId") })}`;
  await act(back, "Sent to the coordinators", async () => {
    const id = await app().followUps.request(me, {
      clientId: str(form, "clientId"),
      psychologistId: str(form, "psychologistId") || me.id,
      suggestedOn: optional(form, "suggestedOn") ?? "",
      partOfDay: optional(form, "partOfDay") ?? "",
      message: str(form, "message"),
    });
    return `/admin/follow-ups/${id}`;
  });
}

export async function postFollowUpMessageAction(id: string, form: FormData) {
  const me = await requireStaff();
  await act(`/admin/follow-ups/${id}`, "Sent", () => app().followUps.post(me, id, { body: str(form, "body") }));
}

export async function setFollowUpStatusAction(id: string, form: FormData) {
  const me = await requireStaff();
  await act(`/admin/follow-ups/${id}`, "Status updated", () => app().followUps.setStatus(me, id, { status: str(form, "status") }));
}
