import Image from "next/image";
import { signOut } from "@/auth";
import type { StaffDTO } from "@/features/staff/staff.dto";
import { app } from "@/features/container";
import { canUseFollowUps } from "@/features/follow-up-desk/follow-up-desk.service";
import { canUseLeads } from "@/features/leads/leads.service";
import { hasRole } from "@/lib/session";
import { Icon } from "./icons";
import { NavLink } from "./NavLink";
import { SidebarFrame } from "./SidebarFrame";

/** App frame: a black sidebar on the left (cal.com style) and the page on the right. */
export async function Shell({ me, children }: { me: StaffDTO; children: React.ReactNode }) {
  const manager = hasRole(me, "manager");
  // Sales and coordinators never open clinical records, so the menu doesn't offer them.
  const clinical = me.designation !== "Sales Executive" && me.designation !== "Consultation Coordinator";
  const [newLeads, followUpNews] = await Promise.all([
    canUseLeads(me) ? app().leads.countNew(me) : 0,
    canUseFollowUps(me) ? app().followUps.countUnread(me) : 0,
  ]);
  return (
    <SidebarFrame
      sidebar={
        <>
            <div className="flex items-center gap-2 px-3 pb-2 pt-1 md:pb-6">
              <Image src="/brand/mindlap-logo.png" alt="Mindlap" width={630} height={173} unoptimized priority className="h-7 w-auto" />
            </div>
            <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible" aria-label="Main">
              <NavLink href="/" icon="home" exact>Today</NavLink>
              <NavLink href="/admin/bookings" icon="list">Bookings</NavLink>
              <NavLink href="/admin/calendar" icon="calendar">Calendar</NavLink>
              <NavLink href={`/admin/staff/${me.id}`} icon="clock">Availability</NavLink>
              {canUseLeads(me) && <NavLink href="/admin/leads" icon="inbox" count={newLeads}>Leads</NavLink>}
              {canUseFollowUps(me) && <NavLink href="/admin/follow-ups" icon="chat" count={followUpNews}>Follow-ups</NavLink>}
              {manager && <p className="nav-heading">Manage</p>}
              {manager && <NavLink href="/admin/services" icon="grid">Services</NavLink>}
              {manager && <NavLink href="/admin/staff" icon="users" exact>Staff</NavLink>}
              {manager && <NavLink href="/admin/packages" icon="wallet">Packages</NavLink>}
              {manager && <NavLink href="/admin/clients" icon="user">Clients</NavLink>}
              {clinical && <NavLink href="/admin/case-histories" icon="file">Case histories</NavLink>}
              {manager && <NavLink href="/admin/reports" icon="chart">Reports</NavLink>}
              {manager && <NavLink href="/admin/workflows" icon="bolt">Workflows</NavLink>}
              {hasRole(me, "admin") && <NavLink href="/admin/otp" icon="shield">OTP Authentication</NavLink>}
              {hasRole(me, "admin") && <NavLink href="/admin/settings" icon="settings">Settings</NavLink>}
            </nav>
            {/* Closed by default: Sign out only appears after clicking the profile. Plain <details>, no script needed. */}
            <details className="group relative mt-auto hidden border-t border-zinc-200 pt-4 md:block">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 hover:bg-zinc-200 [&::-webkit-details-marker]:hidden">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-200 text-xs font-medium text-black group-open:bg-white">
                  {me.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-black">{me.name}</span>
                  <span className="block truncate text-xs capitalize text-zinc-600">{me.role}</span>
                </span>
                <span className="text-zinc-500 transition-transform group-open:rotate-180" aria-hidden="true">⌃</span>
              </summary>
              <form
                className="absolute inset-x-0 bottom-full mb-1 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <button className="nav-link w-full" type="submit"><Icon name="logout" /> Sign out</button>
              </form>
            </details>
        </>
      }
    >
      {children}
    </SidebarFrame>
  );
}

/** Page title row with an optional action on the right. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
