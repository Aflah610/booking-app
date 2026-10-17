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
/** `pricePaise` is what this person charges for the service asked about (their own price, else the service's); null when it has no plain price. */
export type PublicStaffDTO = { id: string; name: string; timezone: string; pricePaise: number | null };
