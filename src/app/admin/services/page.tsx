import Link from "next/link";
import { app } from "@/features/container";
import { requireStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { ServiceFields } from "@/components/ServiceFields";
import { createServiceAction } from "../actions";

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requireStaff("manager");
  const { error, ok } = await searchParams;
  const rows = await app().catalog.list();
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Services</h1>
      <Notice error={error} ok={ok} />
      <div className="mb-8 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr><th className="py-2">Name</th><th>Duration</th><th>Buffers</th><th>Price shown</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2"><Link className="underline" href={`/admin/services/${s.id}`}>{s.name}</Link></td>
                <td>{s.durationMin} min</td>
                <td>{s.bufferBeforeMin} / {s.bufferAfterMin} min</td>
                <td>{s.priceDisplay ?? "–"}</td>
                <td>{s.active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mb-3 font-semibold">Add a service</h2>
      <form action={createServiceAction} className="grid max-w-xl gap-3 sm:grid-cols-2">
        <ServiceFields />
        <div className="sm:col-span-2"><button className="btn" type="submit">Add service</button></div>
      </form>
    </>
  );
}
