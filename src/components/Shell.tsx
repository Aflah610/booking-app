import Link from "next/link";
import { signOut } from "@/auth";
import type { StaffDTO } from "@/features/staff/staff.dto";
import { hasRole } from "@/lib/session";

export function Shell({ me, children }: { me: StaffDTO; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-8 flex flex-wrap items-center gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <Link href="/" className="font-semibold">Bookings</Link>
        <nav className="flex gap-4 text-sm">
          {hasRole(me, "manager") && <Link href="/admin/staff">Staff</Link>}
          {hasRole(me, "manager") && <Link href="/admin/services">Services</Link>}
          <Link href={`/admin/staff/${me.id}`}>My hours</Link>
        </nav>
        <form
          className="ml-auto"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <span className="mr-3 text-sm text-zinc-500">{me.name}</span>
          <button className="btn-ghost" type="submit">Sign out</button>
        </form>
      </header>
      {children}
    </div>
  );
}
