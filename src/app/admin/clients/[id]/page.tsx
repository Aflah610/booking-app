import { notFound } from "next/navigation";
import { app } from "@/features/container";
import { DomainError } from "@/features/shared/errors";
import { requireStaff } from "@/lib/session";
import { BookingRow } from "@/components/BookingRow";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { updateClientAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireStaff("manager");
  const { id } = await params;
  const { error, ok } = await searchParams;
  const { clients, bookings, settings } = app();
  const c = await clients.get(id).catch((err) => {
    if (err instanceof DomainError) notFound();
    throw err;
  });
  const [history, s] = await Promise.all([bookings.list({ view: "all", clientId: id, limit: 200 }), settings.get()]);
  return (
    <>
      <PageHeader title={c.name} subtitle={c.phoneE164} />
      <Notice error={error} ok={ok} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section>
          <h2 className="mb-3 font-semibold">Bookings</h2>
          <div className="card divide-y divide-white/5 overflow-hidden">
            {history.length === 0 && <p className="p-8 text-center text-sm text-zinc-500">No bookings.</p>}
            {[...history].reverse().map((b) => <BookingRow key={b.id} b={b} tz={s.timezone} />)}
          </div>
        </section>
        <form action={updateClientAction.bind(null, id)} className="card grid content-start gap-4 p-5">
          <div><label className="label" htmlFor="name">Name</label><input className="input" id="name" name="name" defaultValue={c.name} required /></div>
          <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" defaultValue={c.email ?? ""} /></div>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="toggle" name="whatsappOptIn" defaultChecked={c.whatsappOptIn} /> WhatsApp updates</label>
          <div><label className="label" htmlFor="notes">Notes</label><textarea className="input" id="notes" name="notes" rows={4} defaultValue={c.notes ?? ""} /></div>
          <div><button className="btn" type="submit">Save</button></div>
        </form>
      </div>
    </>
  );
}
