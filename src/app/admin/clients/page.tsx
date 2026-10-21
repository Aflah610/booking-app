import Link from "next/link";
import { app } from "@/features/container";
import { clientReference } from "@/features/clients/clients.dto";
import { phoneLabel } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { PageHeader } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff("manager");
  const { q } = await searchParams;
  const rows = await app().clients.list({ q: q?.trim() || undefined, limit: 200 });
  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Everyone who has booked or been added. Clients are matched by mobile number."
        action={<Link href="/admin/clients/new" className="btn">New client</Link>}
      />
      <form className="mb-6 flex max-w-md gap-2" action="/admin/clients">
        <input className="input" name="q" defaultValue={q} placeholder="Search name, phone or email" aria-label="Search clients" />
        <button className="btn-ghost" type="submit">Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Client ID</th><th>Name</th><th>Mobile</th><th>Email</th><th>WhatsApp</th><th className="text-right">Bookings</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-zinc-600">No clients{q ? " match that search" : " yet"}.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="font-mono text-xs text-zinc-600">{clientReference(c.number)}</td>
                <td><Link className="font-medium hover:underline" href={`/admin/clients/${c.id}`}>{c.name}</Link></td>
                <td className="whitespace-nowrap text-zinc-600">{phoneLabel(c.phoneE164)}</td>
                <td className="text-zinc-600">{c.email ?? "–"}</td>
                <td>{c.whatsappOptIn ? "Yes" : "No"}</td>
                <td className="text-right">{c.bookings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
