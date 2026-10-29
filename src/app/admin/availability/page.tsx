import Link from "next/link";
import { app } from "@/features/container";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/Shell";

export default async function AvailabilityPage() {
  await requirePermission("availability.manage");
  const [people, clinicianRoles] = await Promise.all([app().staff.list(), app().access.rolesWith("casenotes.write")]);
  const therapists = people.filter((p) => p.active && clinicianRoles.includes(p.accessRole));
  return <>
    <PageHeader title="Therapist availability" subtitle="Managers and CCD manage weekly hours, date overrides and time off." />
    <div className="card divide-y divide-zinc-100">
      {therapists.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div><p className="font-medium">{p.name}</p><p className="text-sm text-zinc-600">{p.designation || "Therapist"} · {p.timezone}</p></div>
        <Link className="btn-ghost" href={`/admin/staff/${p.id}`}>Manage availability</Link>
      </div>)}
      {!therapists.length && <p className="p-5 text-zinc-600">No active therapists yet.</p>}
    </div>
  </>;
}
