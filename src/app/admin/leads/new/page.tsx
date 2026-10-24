import Link from "next/link";
import { redirect } from "next/navigation";
import { canUseLeads } from "@/features/leads/leads.service";
import { requireStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { PhoneField } from "@/components/PhoneField";
import { PageHeader } from "@/components/Shell";
import { addLeadAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New lead" };

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  if (!canUseLeads(me)) redirect("/?error=forbidden");
  const { error } = await searchParams;
  return (
    <>
      <Link href="/admin/leads" className="text-sm text-zinc-600 hover:text-black">← Leads</Link>
      <div className="mt-4">
        <PageHeader title="New lead" subtitle="For an enquiry that didn't come through WhatsApp, such as a phone call. It is assigned like any other lead." />
      </div>
      <Notice error={error} />
      <form action={addLeadAction} className="card grid max-w-2xl gap-4 p-5 sm:grid-cols-2">
        <div><label className="label" htmlFor="name">Name</label><input className="input" id="name" name="name" required autoComplete="off" /></div>
        <PhoneField id="phone" name="phone" label="Mobile number" required />
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">Notes</label>
          <textarea className="input" id="notes" name="notes" rows={3} placeholder="What they asked about" />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <button className="btn" type="submit">Add lead</button>
          <Link href="/admin/leads" className="btn-ghost">Cancel</Link>
        </div>
      </form>
    </>
  );
}
