import { notFound } from "next/navigation";
import { app } from "@/features/container";
import { DomainError } from "@/features/shared/errors";
import { requireStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { ServiceFields } from "@/components/ServiceFields";
import { updateServiceAction } from "../../actions";

export default async function ServiceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireStaff("manager");
  const { id } = await params;
  const { error, ok } = await searchParams;
  const s = await app().catalog.get(id).catch((err) => {
    if (err instanceof DomainError) notFound();
    throw err;
  });
  return (
    <>
      <PageHeader title={s.name} subtitle={`${s.durationMin} minutes${s.priceDisplay ? ` · ${s.priceDisplay}` : ""}`} />
      <Notice error={error} ok={ok} />
      <form action={updateServiceAction.bind(null, id)} className="card grid max-w-2xl gap-4 p-6 sm:grid-cols-2">
        <ServiceFields s={s} />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="toggle" name="active" defaultChecked={s.active} /> Bookable
        </label>
        <div className="sm:col-span-2"><button className="btn" type="submit">Save</button></div>
      </form>
    </>
  );
}
