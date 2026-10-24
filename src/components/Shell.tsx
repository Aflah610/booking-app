import { ACCESS_ROLE_LABEL } from "@/features/access/permissions";
import Image from "next/image";
import { signOut } from "@/auth";
import { app } from "@/features/container";
import { canUseFollowUps } from "@/features/follow-up-desk/follow-up-desk.service";
import { canUseLeads } from "@/features/leads/leads.service";
import { allowed, type Me } from "@/lib/session";
import { Icon } from "./icons";
import { NavLink } from "./NavLink";
import { SidebarFrame } from "./SidebarFrame";

/** App frame: a black sidebar on the left (cal.com style) and the page on the right. */
export async function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  // Each item appears only for roles allowed to use it (Settings > Roles & access); the pages check again on their own.
  const can = (p: Parameters<typeof allowed>[1]) => allowed(me, p);
  const manages = ["clients.view", "packages.manage", "services.manage", "staff.manage", "reports.view", "workflows.manage"] as const;
  const [newLeads, followUpNews, pendingNotes] = await Promise.all([
    canUseLeads(me) ? app().leads.countNew(me) : 0,
    canUseFollowUps(me) ? app().followUps.countUnread(me) : 0,
    can("casenotes.pending") ? app().caseHistory.countOverdueNotes() : 0,
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
              {!can("clients.view") && can("clients.own") && <NavLink href="/admin/clients" icon="user">My clients</NavLink>}
              {canUseFollowUps(me) && <NavLink href="/admin/follow-ups" icon="chat" count={followUpNews}>Follow-ups</NavLink>}
              {(can("casenotes.write") || can("casenotes.read_all")) && <NavLink href="/admin/case-histories" icon="file" exact>Case histories</NavLink>}
              {can("casenotes.pending") && <NavLink href="/admin/case-histories/pending" icon="clock" count={pendingNotes}>Pending case notes</NavLink>}
              {manages.some(can) && <p className="nav-heading">Manage</p>}
              {can("clients.view") && <NavLink href="/admin/clients" icon="user">Clients</NavLink>}
              {can("packages.manage") && <NavLink href="/admin/packages" icon="wallet">Packages</NavLink>}
              {can("services.manage") && <NavLink href="/admin/services" icon="grid">Services</NavLink>}
              {can("staff.manage") && <NavLink href="/admin/staff" icon="users" exact>Staff</NavLink>}
              {can("reports.view") && <NavLink href="/admin/reports" icon="chart">Reports</NavLink>}
              {can("workflows.manage") && <NavLink href="/admin/workflows" icon="bolt">Workflows</NavLink>}
              {can("settings.manage") && <NavLink href="/admin/otp" icon="shield">OTP Authentication</NavLink>}
              {can("settings.manage") && <NavLink href="/admin/settings" icon="settings" exact>Settings</NavLink>}
              {me.accessRole === "admin" && <NavLink href="/admin/settings/access" icon="key">Roles &amp; access</NavLink>}
            </nav>
            {/* Closed by default: Sign out only appears after clicking the profile. Plain <details>, no script needed. */}
            <details className="group relative mt-auto hidden border-t border-zinc-200 pt-4 md:block">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 hover:bg-zinc-200 [&::-webkit-details-marker]:hidden">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-200 text-xs font-medium text-black group-open:bg-white">
                  {me.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-black">{me.name}</span>
                  <span className="block truncate text-xs text-zinc-600">{ACCESS_ROLE_LABEL[me.accessRole]}</span>
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
