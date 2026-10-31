// Fixed choices on clinical records. The database keeps them as text with a check, so a new choice is one small migration.
export const CASE_STATUS = ["intake_pending", "in_treatment", "concluded"] as const;
export const ONSET = ["sudden", "gradual", "unknown"] as const;
export const SEVERITY = ["mild", "moderate", "severe"] as const;
export const COOPERATION = ["cooperative", "partially", "uncooperative"] as const;
export const RAPPORT = ["good", "fair", "poor"] as const;
export const AFFECT = ["euthymic", "anxious", "depressed", "irritable", "elevated", "blunted", "labile"] as const;
export const INSIGHT = ["good", "partial", "poor", "absent"] as const;
export const JUDGEMENT = ["good", "fair", "poor"] as const;
export const RISK = ["none", "low", "moderate", "high", "severe"] as const;
export const RESPONSE = ["engaged", "partially_engaged", "resistant"] as const;
export const PROGRESS = ["improved", "same", "worse"] as const;
export const PART_OF_DAY = ["morning", "afternoon", "evening"] as const;
/** What happened to each channel of a follow-up message. */
export const DELIVERY = ["sent", "not_set_up", "no_contact", "failed", "not_chosen"] as const;


export type Risk = (typeof RISK)[number];

/** The client's overall risk: the highest of the three ratings, or null when none is recorded. */
export function overallRisk(ratings: (Risk | null)[]): Risk | null {
  let best = -1;
  for (const r of ratings) if (r) best = Math.max(best, RISK.indexOf(r));
  return best < 0 ? null : RISK[best];
}

export const LABEL: Record<string, string> = {
  intake_pending: "Intake pending", in_treatment: "In treatment", concluded: "Termination",
  sudden: "Sudden", gradual: "Gradual", unknown: "Unknown",
  mild: "Mild", moderate: "Moderate", severe: "Severe",
  cooperative: "Cooperative", partially: "Partially cooperative", uncooperative: "Uncooperative",
  good: "Good", fair: "Fair", poor: "Poor", partial: "Partial", absent: "Absent",
  euthymic: "Euthymic", anxious: "Anxious", depressed: "Depressed", irritable: "Irritable", elevated: "Elevated", blunted: "Blunted", labile: "Labile",
  none: "None", low: "Low", high: "High",
  engaged: "Engaged", partially_engaged: "Partially engaged", resistant: "Resistant",
  improved: "Improved", same: "No change", worse: "Worse",
  morning: "Morning", afternoon: "Afternoon", evening: "Evening",
};
