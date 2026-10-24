import { z } from "zod";
import { PART_OF_DAY, PROGRESS, RESPONSE, RISK } from "./choices";
import { ICD11 } from "./icd11";

/** A form box left empty means "not recorded". */
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max = 10_000) => z.preprocess(blank, z.string().trim().max(max).nullable().default(null));
const choice = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(blank, z.enum(values).nullable().default(null));

/**
 * The fields each intake step saves, laid out as in MCH. Step 1 shows the client's details (edited on the client's page);
 * a step only ever touches its own fields.
 */
export const intakeSteps = {
  2: z.object({ presentingComplaints: text(), historyPresent: text() }),
  3: z.object({ medicalHistory: text(), pastPsychiatric: text(), familyHistory: text() }),
  4: z.object({
    personalHistory: text(), educationalHistory: text(), occupationalHistory: text(), relationshipHistory: text(),
    substanceUse: text(), socialHistory: text(),
  }),
  5: z.object({
    mseAppearance: text(500), mseBehaviour: text(500), mseEyeContact: text(500), mseSpeech: text(500), mseMoodAffect: text(500),
    mseThoughtProcess: text(500), mseThoughtContent: text(1000), msePerception: text(1000), mseCognition: text(1000),
    mseInsightJudgement: text(500), clinicalObservation: text(),
  }),
  6: z
    .object({
      riskSuicide: choice(RISK), riskSelfHarm: choice(RISK), riskOthers: choice(RISK), riskNotes: text(2000),
      // Written as the clinician puts it ("F41.1 Generalized Anxiety Disorder"); a code from the ICD-11 list is kept alongside.
      diagnosisLabel: text(300),
      diagnosisSecondary: text(500), diagnosisSpecifiers: text(500),
      goalsShort: text(), goalsLong: text(), approach: text(300), planNotes: text(), therapistNotes: text(), remarks: text(),
    })
    .transform((v) => {
      const listed = v.diagnosisLabel ? ICD11.find((d) => v.diagnosisLabel!.toLowerCase().startsWith(d.code.toLowerCase() + " ") || v.diagnosisLabel!.toLowerCase() === d.title.toLowerCase()) : undefined;
      return { ...v, diagnosisCode: listed?.code ?? null };
    }),
} as const;
export type IntakeStep = keyof typeof intakeSteps;

const isoDate = z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD").nullable().default(null));

export const noteInput = z.object({
  /** The booked session, or empty for one that was never booked here (then sessionOn is required). */
  bookingId: z.preprocess(blank, z.string().uuid().nullable().default(null)),
  sessionOn: isoDate,
  summary: z.string().trim().min(1, "Write a summary of the session").max(20_000),
  risk: choice(RISK),
  response: choice(RESPONSE),
  progress: choice(PROGRESS),
  nextPlan: text(2000),
  homework: text(2000),
  followUpOn: isoDate,
  // As in MCH.
  durationText: text(50),
  clinicalObservation: text(5000),
  progressNotes: text(5000),
  therapistSignature: text(200),
});

export const noteEditInput = noteInput.omit({ bookingId: true, sessionOn: true });

export const addendumInput = z.object({ text: z.string().trim().min(1, "Write the addendum").max(5000) });

export const followUpInput = z
  .object({
    suggestedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the suggested date"),
    partOfDay: choice(PART_OF_DAY),
    note: text(500),
    whatsapp: z.boolean(),
    email: z.boolean(),
  })
  .refine((v) => v.whatsapp || v.email, { message: "Choose WhatsApp, email or both", path: ["whatsapp"] });
