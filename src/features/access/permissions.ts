/**
 * What each kind of staff member may do. Admins can change everything except their own row (Settings > Roles & access);
 * a role's defaults apply until then.
 */
export const ACCESS_ROLES = ["admin", "manager", "psychologist", "bde", "ccd"] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];

export const ACCESS_ROLE_LABEL: Record<AccessRole, string> = {
  admin: "Admin",
  manager: "Manager",
  psychologist: "Psychologist",
  bde: "BDE (sales)",
  ccd: "CCD (consultation coordinator)",
};

export const PERMISSIONS = [
  "bookings.all",
  "bookings.create",
  "bookings.reschedule",
  "clients.view",
  "clients.contact",
  "clients.own",
  "clients.reassign",
  "clients.delete",
  "leads.own",
  "leads.all",
  "followups.own",
  "followups.all",
  "casenotes.write",
  "casenotes.pending",
  "casenotes.read_all",
  "packages.manage",
  "services.manage",
  "staff.manage",
  "reports.view",
  "workflows.manage",
  "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Grouped and worded for the Roles & access page. */
export const PERMISSION_GROUPS: { title: string; items: { key: Permission; label: string; hint: string }[] }[] = [
  {
    title: "Bookings",
    items: [
      { key: "bookings.create", label: "Book sessions for clients", hint: "Make, move and cancel bookings from the admin panel." },
      { key: "bookings.reschedule", label: "Reschedule bookings", hint: "Move a session to another time or psychologist. Admins, managers and coordinators by default." },
      { key: "bookings.all", label: "See every diary", hint: "Without this, people see only their own sessions." },
    ],
  },
  {
    title: "Clients",
    items: [
      { key: "clients.view", label: "Clients list and profiles", hint: "Search clients and open their profile page." },
      { key: "clients.own", label: "Own clients", hint: "See the clients they treat, read-only. For psychologists." },
      { key: "clients.contact", label: "See phone and email", hint: "Without this, contact details are hidden everywhere." },
      { key: "clients.reassign", label: "Assign and change a client’s psychologist", hint: "Admins and managers by default. A booking still records the psychologist it was booked with." },
      { key: "clients.delete", label: "Delete clients", hint: "Removes the client and their case history for good. Not possible once they have bookings or payments." },
    ],
  },
  {
    title: "Sales",
    items: [
      { key: "leads.own", label: "Work own leads", hint: "Gets a share of new leads, with the Online/Offline switch." },
      { key: "leads.all", label: "See and reassign all leads", hint: "For whoever runs the sales team." },
    ],
  },
  {
    title: "Follow-ups",
    items: [
      { key: "followups.own", label: "Follow-ups for own clients", hint: "Ask the coordinators to arrange a client's next session." },
      { key: "followups.all", label: "Work every follow-up", hint: "See all threads, change status and book." },
    ],
  },
  {
    title: "Case history",
    items: [
      { key: "casenotes.write", label: "Write case history for own clients", hint: "Intake and session notes for the clients they treat." },
      { key: "casenotes.pending", label: "See pending case notes", hint: "Which sessions still have no note 24 hours later. Not the notes themselves." },
      { key: "casenotes.read_all", label: "Read every client's case history", hint: "Clinical notes of all clients. Give this rarely." },
    ],
  },
  {
    title: "Running the practice",
    items: [
      { key: "packages.manage", label: "Packages and credits", hint: "Sell packages and correct client credit." },
      { key: "services.manage", label: "Services and prices", hint: "" },
      { key: "staff.manage", label: "Staff", hint: "Add people and set their hours and services." },
      { key: "reports.view", label: "Reports and dashboard", hint: "" },
      { key: "workflows.manage", label: "Automatic messages", hint: "" },
      { key: "settings.manage", label: "Settings", hint: "Firm settings, OTP and API keys." },
    ],
  },
];

const all = new Set<Permission>(PERMISSIONS);

export const DEFAULT_PERMISSIONS: Record<AccessRole, ReadonlySet<Permission>> = {
  admin: all,
  manager: new Set<Permission>([
    "bookings.all", "bookings.reschedule", "clients.view", "clients.contact", "clients.reassign", "clients.delete", "leads.all", "followups.all", "casenotes.pending",
    "packages.manage", "services.manage", "staff.manage", "reports.view", "workflows.manage",
  ]),
  psychologist: new Set<Permission>(["clients.own", "followups.own", "casenotes.write"]),
  bde: new Set<Permission>(["leads.own", "clients.contact"]),
  ccd: new Set<Permission>(["bookings.all", "bookings.create", "bookings.reschedule", "clients.view", "clients.contact", "followups.all"]),
};

/** For staff saved before access roles existed, or added without one. */
export function accessRoleFrom(role: "admin" | "manager" | "staff", designation: string | null): AccessRole {
  if (role === "admin") return "admin";
  if (role === "manager") return "manager";
  if (designation === "Sales Executive") return "bde";
  if (designation === "Consultation Coordinator") return "ccd";
  return "psychologist";
}

/** The older admin/manager/staff rank that some checks still use, kept in step with the access role. */
export function rankFor(accessRole: AccessRole): "admin" | "manager" | "staff" {
  return accessRole === "admin" ? "admin" : accessRole === "manager" ? "manager" : "staff";
}

/** Who is acting. `permissions` is loaded for signed-in staff; without it the role's defaults apply (tests, background jobs). */
export type AccessHolder = { accessRole: AccessRole; permissions?: ReadonlySet<Permission> };

export function can(who: AccessHolder, permission: Permission): boolean {
  if (who.accessRole === "admin") return true;
  return (who.permissions ?? DEFAULT_PERMISSIONS[who.accessRole]).has(permission);
}
