import { z } from "zod";
import { AFFECT, COOPERATION, INSIGHT, JUDGEMENT, ONSET, PART_OF_DAY, PROGRESS, RAPPORT, RESPONSE, RISK, SEVERITY } from "./choices";
import { ICD11 } from "./icd11";

/** A form box left empty means "not recorded". */
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max = 10_000) => z.preprocess(blank, z.string().trim().max(max).nullable().default(null));
const choice = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(blank, z.enum(values).nullable().default(null));

/** The fields each intake step saves; a step only ever touches its own fields. */
export const intakeSteps = {
  1: z.object({ presentingComplaints: text(), onset: choice(ONSET), duration: text(200), severity: choice(SEVERITY), historyPresent: text() }),
  2: z.object({ pastPsychiatric: text(), medicalHistory: text(), medication: text(), familyHistory: text() }),
  3: z.object({ personalHistory: text(), substanceUse: text(), premorbidPersonality: text() }),
  4: z.object({
    mseAppearance: text(500), mseCooperation: choice(COOPERATION), mseRapport: choice(RAPPORT), mseSpeech: text(500), mseMood: text(500),
    mseAffect: choice(AFFECT), mseThought: text(), msePerception: text(), mseCognition: text(), mseInsight: choice(INSIGHT), mseJudgement: choice(JUDGEMENT),
  }),
  5: z
    .object({
      riskSuicide: choice(RISK), riskSelfHarm: choice(RISK), riskOthers: choice(RISK),
      // A code from the list, "other" with a written label, or nothing yet.
      diagnosisCode: z.preprocess(blank, z.string().nullable().default(null)),
      diagnosisLabel: text(200),
      diagnosisSecondary: text(500), diagnosisSpecifiers: text(500), formulation: text(),
    })
    .transform((v, ctx) => {
      if (v.diagnosisCode === "other") {
        if (!v.diagnosisLabel) ctx.addIssue({ code: "custom", path: ["diagnosisLabel"], message: "Write the diagnosis when choosing Other" });
        return { ...v, diagnosisCode: null };
      }
      if (v.diagnosisCode) {
        const listed = ICD11.find((d) => d.code === v.diagnosisCode);
        if (!listed) {
          ctx.addIssue({ code: "custom", path: ["diagnosisCode"], message: `${v.diagnosisCode} is not on the ICD-11 list` });
          return v;
        }
        return { ...v, diagnosisLabel: listed.title };
      }
      return { ...v, diagnosisLabel: null };
    }),
  6: z.object({ goalsShort: text(), goalsLong: text(), approach: text(200), frequency: text(200), planNotes: text() }),
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
