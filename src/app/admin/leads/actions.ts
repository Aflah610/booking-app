"use server";

import { app } from "@/features/container";
import { act, optional, str } from "@/lib/form-actions";
import { requirePermission, requireStaff } from "@/lib/session";

export async function addLeadAction(form: FormData) {
  const me = await requireStaff();
  await act("/admin/leads/new", "Lead added", async () => {
    const lead = await app().leads.add(me, { name: str(form, "name"), phone: str(form, "phone"), notes: optional(form, "notes") });
    return `/admin/leads/${lead.id}`;
  });
}

export async function updateLeadAction(id: string, form: FormData) {
  const me = await requireStaff();
  await act(`/admin/leads/${id}`, "Saved", () =>
    app().leads.update(me, id, {
      status: str(form, "status"),
      followUpOn: str(form, "followUpOn") || null,
      notes: optional(form, "notes"),
      lostReason: str(form, "lostReason"),
      dealAmount: str(form, "dealAmount"),
      dealNote: str(form, "dealNote"),
    }),
  );
}

export async function reassignLeadAction(id: string, form: FormData) {
  const me = await requirePermission("leads.all");
  await act(`/admin/leads/${id}`, "Reassigned", () => app().leads.reassign(me, id, str(form, "staffId")));
}

/** The Online / Offline switch on the Leads page. */
export async function setLeadsOnlineAction(staffId: string, online: boolean) {
  const me = await requireStaff();
  await act("/admin/leads", online ? "Online: new leads will come to you" : "Offline: new leads go to the rest of the team", async () => {
    const handed = await app().leads.setOnline(me, staffId, online);
    if (online && handed > 0) return `/admin/leads?ok=${encodeURIComponent(`Online. ${handed} waiting lead${handed === 1 ? "" : "s"} shared out`)}`;
  });
}
