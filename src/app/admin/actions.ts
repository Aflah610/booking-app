"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { app } from "@/features/container";
import { DomainError } from "@/features/shared/errors";
import { parseDayRanges } from "@/lib/hours-form";
import { zonedToUtc } from "@/lib/time";
import { requireStaff, hasRole } from "@/lib/session";

function message(err: unknown): string {
  if (err instanceof DomainError || err instanceof RangeError) return err.message;
  if (err instanceof ZodError) return err.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ");
  throw err;
}

/** Runs `fn`, then redirects back to `path` with either ?ok= or ?error=. */
async function act(path: string, ok: string, fn: () => Promise<unknown>): Promise<never> {
  let error: string | undefined;
  try {
    await fn();
  } catch (err) {
    error = message(err);
  }
  revalidatePath(path);
  redirect(`${path}?${new URLSearchParams(error ? { error } : { ok })}`);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optional = (f: FormData, k: string) => str(f, k) || null;
const optionalNumber = (f: FormData, k: string) => (str(f, k) ? Number(str(f, k)) : null);

/** Staff may edit their own hours and time off; managers and admins may edit anyone's. */
async function requireSelfOrManager(staffId: string) {
  const me = await requireStaff();
  if (me.id !== staffId && !hasRole(me, "manager")) redirect("/?error=forbidden");
  return me;
}

export async function createStaffAction(form: FormData) {
  const me = await requireStaff("manager");
  const role = str(form, "role") as "admin" | "manager" | "staff";
  await act("/admin/staff", "Staff member added", async () => {
    if (role === "admin" && !hasRole(me, "admin")) throw new DomainError("forbidden", "Only admins can add admins");
    await app().staff.create({ staffId: me.id }, {
      name: str(form, "name"),
      email: str(form, "email"),
      role,
      timezone: str(form, "timezone") || "Asia/Kolkata",
    });
  });
}

export async function updateStaffAction(staffId: string, form: FormData) {
  const me = await requireStaff("manager");
  const path = `/admin/staff/${staffId}`;
  await act(path, "Saved", async () => {
    const target = await app().staff.get(staffId);
    const role = str(form, "role") as "admin" | "manager" | "staff";
    const changesAdmin = role !== target.role && (role === "admin" || target.role === "admin");
    if (changesAdmin && !hasRole(me, "admin")) throw new DomainError("forbidden", "Only admins can change admin roles");
    if (staffId === me.id && (role !== me.role || form.get("active") !== "on")) {
      throw new DomainError("invalid", "You can't change your own role or deactivate yourself");
    }
    await app().staff.update({ staffId: me.id }, staffId, {
      name: str(form, "name"),
      email: str(form, "email"),
      role,
      timezone: str(form, "timezone"),
      active: form.get("active") === "on",
    });
    await app().staff.setServices({ staffId: me.id }, staffId, form.getAll("serviceIds").map(String));
  });
}

export async function setHoursAction(staffId: string, form: FormData) {
  const me = await requireSelfOrManager(staffId);
  await act(`/admin/staff/${staffId}`, "Working hours saved", async () => {
    const ranges = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => parseDayRanges(d, str(form, `day${d}`)));
    await app().schedules.setWeeklyHours({ staffId: me.id }, staffId, ranges);
  });
}

export async function addTimeOffAction(staffId: string, form: FormData) {
  const me = await requireSelfOrManager(staffId);
  await act(`/admin/staff/${staffId}`, "Time off added", async () => {
    const target = await app().staff.get(staffId);
    // The form sends local wall-clock times; interpret them in the staff member's time zone.
    await app().schedules.addTimeOff({ staffId: me.id }, staffId, {
      startsAt: zonedToUtc(str(form, "startsAt"), target.timezone),
      endsAt: zonedToUtc(str(form, "endsAt"), target.timezone),
      reason: optional(form, "reason"),
    });
  });
}

export async function removeTimeOffAction(staffId: string, timeOffId: string) {
  const me = await requireSelfOrManager(staffId);
  await act(`/admin/staff/${staffId}`, "Time off removed", () =>
    app().schedules.removeTimeOff({ staffId: me.id }, staffId, timeOffId),
  );
}

function serviceFields(form: FormData) {
  return {
    name: str(form, "name"),
    description: optional(form, "description"),
    durationMin: Number(str(form, "durationMin")),
    bufferBeforeMin: Number(str(form, "bufferBeforeMin") || 0),
    bufferAfterMin: Number(str(form, "bufferAfterMin") || 0),
    priceDisplay: optional(form, "priceDisplay"),
    slotIntervalMin: optionalNumber(form, "slotIntervalMin"),
    minNoticeMin: optionalNumber(form, "minNoticeMin"),
    maxNoticeDays: optionalNumber(form, "maxNoticeDays"),
  };
}

export async function createServiceAction(form: FormData) {
  const me = await requireStaff("manager");
  await act("/admin/services", "Service added", () => app().catalog.create({ staffId: me.id }, serviceFields(form)));
}

export async function updateServiceAction(serviceId: string, form: FormData) {
  const me = await requireStaff("manager");
  await act(`/admin/services/${serviceId}`, "Saved", () =>
    app().catalog.update({ staffId: me.id }, serviceId, { ...serviceFields(form), active: form.get("active") === "on" }),
  );
}
