import { ACCESS_ROLES, ACCESS_ROLE_LABEL } from "@/features/access/permissions";
import Link from "next/link";
import { app } from "@/features/container";
import { hasRole, requirePermission } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import { DESIGNATIONS } from "@/features/staff/staff.dto";
import { createStaffAction } from "../actions";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; q?: string; role?: string; designation?: string; status?: string }> }) {
  const me = await requirePermission("staff.manage");
  const { error, ok, q, role, designation, status } = await searchParams;
  const all = await app().staff.list();
  const needle = q?.trim().toLowerCase();
  const rows = all.filter((s) =>
    (!needle || s.name.toLowerCase().includes(needle) || s.email.toLowerCase().includes(needle))
    && (!role || s.accessRole === role)
    && (!designation || (designation === "none" ? !s.designation : s.designation === designation))
    && (!status || s.active === (status === "active")))
    .sort((a, b) => Number(b.active) - Number(a.active));
  const filtered = Boolean(needle || role || designation || status);
  return (
    <>
      <PageHeader title="Staff" subtitle="People who can sign in and be booked." />
      <Notice error={error} ok={ok} />
      <form action="/admin/staff" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 sm:max-w-xs">
          <label className="label" htmlFor="q">Search</label>
          <input className="input" id="q" name="q" defaultValue={q} placeholder="Name or email" />
        </div>
        <div>
          <label className="label" htmlFor="role">Role</label>
          <select className="input w-auto" id="role" name="role" defaultValue={role ?? ""}>
            <option value="">All roles</option>
            {ACCESS_ROLES.map((r) => <option key={r} value={r}>{ACCESS_ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="filterDesignation">Designation</label>
          <select className="input w-auto" id="filterDesignation" name="designation" defaultValue={designation ?? ""}>
            <option value="">All designations</option>
            {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            <option value="none">Not set</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select className="input w-auto" id="status" name="status" defaultValue={status ?? ""}>
            <option value="">Current and past</option>
            <option value="active">Current</option>
            <option value="inactive">Past</option>
          </select>
        </div>
        <button className="btn" type="submit">Apply</button>
        {filtered && <Link className="btn-ghost" href="/admin/staff">Clear</Link>}
      </form>
      {filtered && <p className="mb-2 text-sm text-zinc-600">Showing {rows.length} of {all.length} staff.</p>}
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
                <td>{s.active ? <span className="badge">Current</span> : <span className="badge border-red-300 text-red-700">Past</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-zinc-500">No staff match these filters.</td></tr>}
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
