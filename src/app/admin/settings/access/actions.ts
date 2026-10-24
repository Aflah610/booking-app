"use server";

import { app } from "@/features/container";
import { ACCESS_ROLE_LABEL, type AccessRole } from "@/features/access/permissions";
import { act } from "@/lib/form-actions";
import { requireStaff } from "@/lib/session";

/** Saves one role's column on the Roles & access page. */
export async function saveRoleAccessAction(role: string, form: FormData) {
  const me = await requireStaff();
  const label = ACCESS_ROLE_LABEL[role as AccessRole] ?? role;
  await act("/admin/settings/access", `Saved what ${label} can do`, () =>
    app().access.setRole({ staffId: me.id, accessRole: me.accessRole }, role, form.getAll("permissions").map(String)));
}
