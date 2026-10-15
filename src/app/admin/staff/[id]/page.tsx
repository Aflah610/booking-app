import { notFound, redirect } from "next/navigation";
import { app } from "@/features/container";
import { DomainError } from "@/features/shared/errors";
import { formatDayRanges, WEEKDAYS } from "@/lib/hours-form";
import { requireStaff, hasRole } from "@/lib/session";
import { formatInZone } from "@/lib/time";
import { Notice } from "@/components/Notice";
import { addTimeOffAction, removeTimeOffAction, setHoursAction, updateStaffAction } from "../../actions";

export default async function StaffDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const me = await requireStaff();
  const isManager = hasRole(me, "manager");
  if (me.id !== id && !isManager) redirect("/?error=forbidden");

  const { staff, catalog, schedules } = app();
  const member = await staff.get(id).catch((err) => {
    if (err instanceof DomainError) notFound();
    throw err;
  });
  const now = new Date();
  const [services, offered, hours, timeOff] = await Promise.all([
    catalog.list(),
    staff.serviceIds(id),
    schedules.weeklyHours(id),
    schedules.timeOffBetween(id, now, new Date(now.getTime() + 365 * 86400_000)),
  ]);

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{member.name}</h1>
      <Notice error={error} ok={ok} />

      {isManager && (
        <section className="mb-10">
          <h2 className="mb-3 font-semibold">Details</h2>
          <form action={updateStaffAction.bind(null, id)} className="grid max-w-xl gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="name">Name</label><input className="input" id="name" name="name" defaultValue={member.name} required /></div>
            <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" defaultValue={member.email} required /></div>
            <div>
              <label className="label" htmlFor="role">Role</label>
              <select className="input" id="role" name="role" defaultValue={member.role}>
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div><label className="label" htmlFor="timezone">Time zone</label><input className="input" id="timezone" name="timezone" defaultValue={member.timezone} required /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="active" defaultChecked={member.active} /> Active (can sign in and be booked)
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="label">Services they offer</legend>
              {services.length === 0 && <p className="text-sm text-zinc-500">No services yet.</p>}
              <div className="grid gap-1 sm:grid-cols-2">
                {services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="serviceIds" value={s.id} defaultChecked={offered.includes(s.id)} />
                    {s.name}{!s.active && " (inactive)"}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2"><button className="btn" type="submit">Save details</button></div>
          </form>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-1 font-semibold">Weekly working hours</h2>
        <p className="mb-3 text-sm text-zinc-500">
          In {member.timezone}. Write ranges like <code>09:00-13:00, 14:00-18:00</code>. Leave a day empty for a day off.
        </p>
        <form action={setHoursAction.bind(null, id)} className="grid max-w-xl gap-2">
          {WEEKDAYS.map((day, i) => (
            <div key={day} className="grid grid-cols-[7rem_1fr] items-center gap-3">
              <label htmlFor={`day${i}`} className="text-sm">{day}</label>
              <input className="input" id={`day${i}`} name={`day${i}`} defaultValue={formatDayRanges(hours, i)} placeholder="Day off" />
            </div>
          ))}
          <div><button className="btn mt-2" type="submit">Save hours</button></div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Time off and blocked time</h2>
        {timeOff.length === 0 ? (
          <p className="mb-3 text-sm text-zinc-500">Nothing upcoming.</p>
        ) : (
          <ul className="mb-4 grid gap-2 text-sm">
            {timeOff.map((t) => (
              <li key={t.id} className="flex items-center gap-3">
                <span>{formatInZone(t.startsAt, member.timezone)} to {formatInZone(t.endsAt, member.timezone)}</span>
                {t.reason && <span className="text-zinc-500">{t.reason}</span>}
                <form action={removeTimeOffAction.bind(null, id, t.id)}><button className="btn-ghost" type="submit">Remove</button></form>
              </li>
            ))}
          </ul>
        )}
        <form action={addTimeOffAction.bind(null, id)} className="grid max-w-xl gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="startsAt">From</label><input className="input" id="startsAt" name="startsAt" type="datetime-local" required /></div>
          <div><label className="label" htmlFor="endsAt">To</label><input className="input" id="endsAt" name="endsAt" type="datetime-local" required /></div>
          <div><label className="label" htmlFor="reason">Reason</label><input className="input" id="reason" name="reason" placeholder="Optional" /></div>
          <div className="sm:col-span-3"><button className="btn" type="submit">Add time off</button></div>
        </form>
      </section>
    </>
  );
}
