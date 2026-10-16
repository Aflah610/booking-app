import { notFound } from "next/navigation";
import { app } from "@/features/container";
import { DomainError } from "@/features/shared/errors";
import { requireStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";
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
      <h1 className="mb-4 text-xl font-semibold">{s.name}</h1>
      <Notice error={error} ok={ok} />
      <form action={updateServiceAction.bind(null, id)} className="grid max-w-xl gap-3 sm:grid-cols-2">
        <ServiceFields s={s} />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="active" defaultChecked={s.active} /> Active (bookable)
        </label>
        <div className="sm:col-span-2"><button className="btn" type="submit">Save</button></div>
      </form>
    </>
  );
}
