import Link from "next/link";
import { requireStaff, hasRole } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { Notice } from "@/components/Notice";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { error } = await searchParams;
  return (
    <Shell me={me}>
      <Notice error={error === "forbidden" ? "You don't have access to that page." : undefined} />
      <h1 className="mb-2 text-2xl font-semibold">Hello, {me.name.split(" ")[0]}</h1>
      <p className="mb-6 text-sm text-zinc-500">The booking calendar arrives in phase 2. For now you can set up the basics.</p>
      <ul className="grid gap-3 sm:grid-cols-3">
        {hasRole(me, "manager") && (
          <li><Link className="block rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900" href="/admin/staff">Staff and roles</Link></li>
        )}
        {hasRole(me, "manager") && (
          <li><Link className="block rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900" href="/admin/services">Services</Link></li>
        )}
        <li><Link className="block rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900" href={`/admin/staff/${me.id}`}>My working hours</Link></li>
      </ul>
    </Shell>
  );
}
