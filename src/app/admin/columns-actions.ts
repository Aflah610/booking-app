"use server";

import { revalidatePath } from "next/cache";
import { app } from "@/features/container";
import { checkColumns, columnPrefKey, type BookingListKey } from "@/lib/booking-columns";
import { requireStaff } from "@/lib/session";

const LISTS: BookingListKey[] = ["bookings", "today"];

/** Saves which columns this person's list shows, and in what order. Everyone's choice is their own. */
export async function saveColumnsAction(list: BookingListKey, ids: string[]): Promise<{ ok: true } | { error: string }> {
  const me = await requireStaff();
  if (!LISTS.includes(list)) return { error: "Unknown list" };
  try {
    const clean = checkColumns(ids, list);
    await app().preferences.set(me.id, columnPrefKey(list), clean);
  } catch (err) {
    if (err instanceof RangeError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/bookings");
  revalidatePath("/");
  return { ok: true };
}

/** Back to the standard columns. */
export async function resetColumnsAction(list: BookingListKey): Promise<{ ok: true }> {
  const me = await requireStaff();
  if (LISTS.includes(list)) await app().preferences.reset(me.id, columnPrefKey(list));
  revalidatePath("/admin/bookings");
  revalidatePath("/");
  return { ok: true };
}
