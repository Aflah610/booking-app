export type StaffRole = "admin" | "manager" | "staff";

/** What the person does, as opposed to `role`, which says what they may do in the app. */
export const DESIGNATIONS = ["Psychiatrist", "Psychologist", "Nutritionist", "Sales Executive", "Consultation Coordinator"] as const;
export type Designation = (typeof DESIGNATIONS)[number];

export type StaffDTO = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  designation: Designation | null;
  timezone: string;
  active: boolean;
  /** May read and write every client's clinical record. */
  clinicalAdmin: boolean;
};

/** What the website may see about a staff member. */
/** `pricePaise` is what this person charges for the service asked about (their own price, else the service's); null when it has no plain price. */
export type PublicStaffDTO = { id: string; name: string; timezone: string; pricePaise: number | null };
