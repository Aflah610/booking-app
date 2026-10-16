import Link from "next/link";
import { app } from "@/features/container";
import { requireStaff, hasRole } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { TimezoneSelect } from "@/components/TimezoneSelect";
import { createStaffAction } from "../actions";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireStaff("manager");
  const { error, ok } = await searchParams;
  const rows = await app().staff.list();
  return (
    <>
      <PageHeader title="Staff" subtitle="People who can sign in and be booked." />
      <Notice error={error} ok={ok} />
      <div className="card mb-10 overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Time zone</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td><Link className="font-medium hover:underline" href={`/admin/staff/${s.id}`}>{s.name}</Link></td>
                <td className="text-zinc-600">{s.email}</td>
                <td className="capitalize">{s.role}</td>
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
            <label className="label" htmlFor="role">Role</label>
            <select className="input" id="role" name="role" defaultValue="staff">
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              {hasRole(me, "admin") && <option value="admin">Admin</option>}
            </select>
          </div>
          <div><label className="label" htmlFor="timezone">Time zone</label><TimezoneSelect /></div>
          <div className="sm:col-span-2"><button className="btn" type="submit">Add staff member</button></div>
        </form>
      </section>
    </>
  );
}
