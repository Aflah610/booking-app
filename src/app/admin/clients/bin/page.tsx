import Link from "next/link";
import { app } from "@/features/container";
import { BIN_DAYS } from "@/features/clients/clients.service";
import { clientReference } from "@/features/clients/clients.dto";
import { dateLabel } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { purgeClientAction, restoreClientAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bin" };

export default async function ClientBinPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requirePermission("clients.delete");
  const sp = await searchParams;
  const [rows, s] = await Promise.all([app().clients.bin(), app().settings.get()]);
  const now = new Date().getTime();
  const daysLeft = (at: Date) => Math.max(0, BIN_DAYS - Math.floor((now - at.getTime()) / 86_400_000));

  return (
    <>
      <Link href="/admin/clients" className="text-sm text-zinc-600 hover:text-black">← Clients</Link>
      <div className="mt-4">
        <PageHeader title="Bin" subtitle={`Deleted clients stay here for ${BIN_DAYS} days and can be restored. After that they are deleted for good.`} />
      </div>
      <Notice ok={sp.ok} error={sp.error} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Client</th><th>Deleted</th><th>By</th><th>Deleted for good in</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="text-center text-zinc-500">The Bin is empty.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id}>
                <td><span className="font-medium">{c.name}</span><span className="block text-xs text-zinc-500 tabular-nums">{clientReference(c.number)}</span></td>
                <td className="text-zinc-600">{c.deletedAt ? dateLabel(c.deletedAt, s.timezone) : "–"}</td>
                <td className="text-zinc-600">{c.deletedByName ?? "–"}</td>
                <td className="tabular-nums">{c.deletedAt ? `${daysLeft(c.deletedAt)} days` : "–"}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <form action={restoreClientAction.bind(null, c.id)}><button className="btn" type="submit">Restore</button></form>
                    <form action={purgeClientAction.bind(null, c.id)}><button className="btn-ghost text-red-700" type="submit">Delete for good</button></form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
