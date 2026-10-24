import { ACCESS_ROLES, ACCESS_ROLE_LABEL } from "@/features/access/permissions";
import Link from "next/link";
import { app } from "@/features/container";
import { hasRole, requirePermission } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import { DESIGNATIONS } from "@/features/staff/staff.dto";
import { createStaffAction } from "../actions";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requirePermission("staff.manage");
  const { error, ok } = await searchParams;
  const rows = await app().staff.list();
  return (
    <>
      <PageHeader title="Staff" subtitle="People who can sign in and be booked." />
      <Notice error={error} ok={ok} />
      <div className="card mb-10 overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Designation</th><th>Role</th><th>Time zone</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="row-link">
                <td><Link className="row-link-target font-medium" href={`/admin/staff/${s.id}`}>{s.name}</Link></td>
                <td className="text-zinc-600">{s.email}</td>
                <td className="text-zinc-600">{s.designation ?? "–"}</td>
                <td>{ACCESS_ROLE_LABEL[s.accessRole]}</td>
                <td className="text-zinc-600">{s.timezone}</td>
                <td><span className="badge">{s.active ? "Active" : "Inactive"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card max-w-2xl p-6">
        <h2 className="mb-1 font-semibold">Add a staff member</h2>
        <p className="mb-5 text-sm text-zinc-600">They sign in with this work email.</p>
        <form action={createStaffAction} className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="name">Name</label><input className="input" id="name" name="name" required /></div>
          <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required /></div>
          <div>
            <label className="label" htmlFor="designation">Designation</label>
            <select className="input" id="designation" name="designation" defaultValue="">
              <option value="">Not set</option>
              {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="accessRole">Role</label>
            <select className="input" id="accessRole" name="accessRole" defaultValue={"psychologist"}>
              {ACCESS_ROLES.filter((r) => r !== "admin" || hasRole(me, "admin")).map((r) => <option key={r} value={r}>{ACCESS_ROLE_LABEL[r]}</option>)}
            </select>
            <p className="mt-1 text-xs text-zinc-500">Decides what they can see and do. <span className="whitespace-nowrap">Admins change it under Roles &amp; access.</span></p>
          </div>
          <div><label className="label" htmlFor="timezone">Time zone</label><TimezoneSelect /></div>
          <div className="sm:col-span-2"><button className="btn" type="submit">Add staff member</button></div>
        </form>
      </section>
    </>
  );
}
