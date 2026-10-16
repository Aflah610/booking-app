import Link from "next/link";
import { app } from "@/features/container";
import { requireStaff, hasRole } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { createStaffAction } from "../actions";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireStaff("manager");
  const { error, ok } = await searchParams;
  const rows = await app().staff.list();
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Staff</h1>
      <Notice error={error} ok={ok} />
      <div className="mb-8 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Time zone</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2"><Link className="underline" href={`/admin/staff/${s.id}`}>{s.name}</Link></td>
                <td>{s.email}</td>
                <td className="capitalize">{s.role}</td>
                <td>{s.timezone}</td>
                <td>{s.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mb-3 font-semibold">Add a staff member</h2>
      <p className="mb-3 text-sm text-zinc-500">They sign in with the Google account for this email.</p>
      <form action={createStaffAction} className="grid max-w-xl gap-3 sm:grid-cols-2">
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
        <div><label className="label" htmlFor="timezone">Time zone</label><input className="input" id="timezone" name="timezone" placeholder="e.g. Asia/Kolkata" defaultValue={me.timezone} /></div>
        <div className="sm:col-span-2"><button className="btn" type="submit">Add staff member</button></div>
      </form>
    </>
  );
}
