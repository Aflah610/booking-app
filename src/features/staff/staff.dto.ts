export type StaffRole = "admin" | "manager" | "staff";

export type StaffDTO = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  timezone: string;
  active: boolean;
};

/** What the website may see about a staff member. */
export type PublicStaffDTO = { id: string; name: string; timezone: string };
