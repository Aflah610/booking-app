import Link from "next/link";
import { app } from "@/features/container";
import { GENDERS, MARITAL_STATUSES } from "@/features/clients/clients.dto";
import { isoDay } from "@/lib/format";
import { allowed, requirePermission } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { PhoneField } from "@/components/PhoneField";
import { PageHeader } from "@/components/Shell";
import { createClientAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Register new client" };

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requirePermission("clients.view");
  const { error } = await searchParams;
  const [team, therapistRoles, s] = await Promise.all([app().staff.list(), app().access.rolesWith("casenotes.write"), app().settings.get()]);
  const therapists = team.filter((m) => m.active && therapistRoles.includes(m.accessRole));
  const today = isoDay(new Date(), s.timezone);
  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} autoComplete="off" {...props} />
    </div>
  );
  const choice = (name: string, label: string, options: string[]) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select className="input" id={name} name={name} defaultValue="">
        <option value="">Not recorded</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <>
      <Link href="/admin/clients" className="text-sm text-zinc-600 hover:text-black">← Clients</Link>
      <div className="mt-4">
        <PageHeader title="Register new client" subtitle="The client gets the next client ID. Only name and mobile are required; the rest can be filled in later." />
      </div>
      <Notice error={error} />
      <form action={createClientAction} className="grid max-w-3xl gap-8">
        <fieldset className="card grid gap-4 p-5 sm:grid-cols-2">
          <legend className="sr-only">Contact</legend>
          <h2 className="font-semibold sm:col-span-2">Contact</h2>
          {field("name", "Full name", { required: true })}
          <PhoneField id="phone" name="phone" label="Mobile number" required />
          {field("email", "Email", { type: "email", placeholder: "Optional" })}
          <label className="flex items-center gap-3 self-end pb-2 text-sm">
            <input type="checkbox" className="toggle" name="whatsappOptIn" defaultChecked /> Send WhatsApp updates
          </label>
        </fieldset>

        <fieldset className="card grid gap-4 p-5 sm:grid-cols-2">
          <legend className="sr-only">Personal</legend>
          <h2 className="font-semibold sm:col-span-2">Personal</h2>
          {field("age", "Age", { type: "number", min: 1, max: 120, inputMode: "numeric" })}
          {choice("gender", "Gender", GENDERS)}
          {field("occupation", "Occupation")}
          {choice("maritalStatus", "Marital status", MARITAL_STATUSES)}
          {field("location", "Current location", { placeholder: "City, state" })}
          {field("education", "Education")}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="address">Address</label>
            <textarea className="input" id="address" name="address" rows={2} />
          </div>
        </fieldset>

        <fieldset className="card grid gap-4 p-5 sm:grid-cols-2">
          <legend className="sr-only">Registration</legend>
          <h2 className="font-semibold sm:col-span-2">Registration</h2>
          {field("registeredOn", "Registration date", { type: "date", max: today, defaultValue: today })}
          {allowed(me, "clients.reassign") && <div>
            <label className="label" htmlFor="staffId">Psychologist</label>
            <select className="input" id="staffId" name="staffId" defaultValue="">
              <option value="">Assign later</option>
              {therapists.map((m) => <option key={m.id} value={m.id}>{m.name}{m.designation ? ` · ${m.designation}` : ""}</option>)}
            </select>
          </div>}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">Front-desk notes</label>
            <textarea className="input" id="notes" name="notes" rows={2} placeholder="Non-clinical, e.g. prefers evenings" />
          </div>
        </fieldset>

        <div className="flex gap-2">
          <button className="btn" type="submit">Register client</button>
          <Link href="/admin/clients" className="btn-ghost">Cancel</Link>
        </div>
      </form>
    </>
  );
}
