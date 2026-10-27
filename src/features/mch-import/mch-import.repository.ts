import { eq } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { schema } from "@/db";
import { RISK, type Risk } from "@/features/case-history/choices";
import { ICD11 } from "@/features/case-history/icd11";
import { toE164 } from "@/features/shared/phone";
import { zonedToUtc } from "@/lib/time";

/**
 * Copies clients and their case histories from MCH, the old case history system, as exported by
 * deploy/aws/mch-export.sql. Safe to run again: every copied row keeps its MCH id and is skipped the second time.
 * It never prints or returns clinical text, only counts and MCH codes.
 */

type Id = number;
type Day = string | null;
export type MchExport = {
  users: { id: Id; name: string }[];
  psychologists: { id: Id; user_id: Id }[];
  clients: {
    id: Id; client_code: string; full_name: string; gender: string | null; age: number | null; dob: Day; phone: string; email: string | null;
    address: string | null; current_location: string | null; occupation: string | null; education: string | null; marital_status: string | null;
    registration_date: Day; emergency_contact: string | null; assigned_psychologist_id: Id | null; created_at: string;
    /** The MCH user who registered the client (exports made before this field was read don't have it). */
    created_by_id?: Id | null;
  }[];
  assignments: { id: Id; client_id: Id; psychologist_id: Id | null; start_date: string; end_date: Day; assigned_by_id: Id | null; reason: string | null }[];
  case_histories: {
    id: Id; client_id: Id; psychologist_id: Id | null; presenting_problems: string | null; history_of_present_illness: string | null;
    medical_history: string | null; psychiatric_history: string | null; family_history: string | null; personal_history: string | null;
    educational_history: string | null; occupational_history: string | null; relationship_history: string | null; substance_use: string | null;
    social_history: string | null; mental_status_examination: Record<string, string | undefined> | null; clinical_observation: string | null;
    diagnosis: Record<string, string | undefined> | null; treatment_goals: string | null; treatment_plan: Record<string, string | undefined> | null;
    risk_assessment: Record<string, string | undefined> | null; therapist_notes: string | null; remarks: string | null; created_at: string; updated_at: string;
  }[];
  session_notes: {
    id: Id; client_id: Id; psychologist_id: Id | null; session_number: number; session_date: string; duration: string | null; notes: string | null;
    clinical_observation: string | null; progress: string | null; risk_level: string | null; homework: string | null;
    treatment_recommendation: string | null; follow_up_date: Day; therapist_signature: string | null; created_at: string;
  }[];
};

export type MchImportOptions = {
  /** Staff member who signs session notes whose MCH psychologist has no account here. */
  fallbackAuthorId: string;
  /** MCH psychologist name → staff id here, for names spelt differently in the two systems. */
  staffByName?: Record<string, string>;
  /** Add MCH psychologists who have no account here as switched-off staff, instead of signing their notes with the fallback. */
  createMissingStaff?: boolean;
  /** Run everything, then roll back: for counting before the real copy. */
  dryRun?: boolean;
};

export type MchImportReport = {
  clientsCreated: number;
  clientsMatched: number;
  clientsSkipped: { code: string; why: string }[];
  periods: number;
  caseHistories: number;
  caseHistoriesSkipped: { code: string; why: string }[];
  notes: number;
  notesByFallbackAuthor: number;
  unmatchedPsychologists: string[];
  staffCreated: string[];
};

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const nameKey = (n: string) => n.toLowerCase().replace(/^dr\.?\s+/, "").replace(/\s+/g, " ").trim();
/** MCH stored dates only; the time of day is unknown, so it is put mid-morning in India. */
const onDay = (d: string) => zonedToUtc(`${d.slice(0, 10)}T10:00`, "Asia/Kolkata");
const risk = (v: string | null | undefined): Risk | null => {
  const r = v?.trim().toLowerCase();
  return r && (RISK as readonly string[]).includes(r) ? (r as Risk) : null;
};
const icd = (label: string | null) => {
  if (!label) return null;
  const l = label.toLowerCase();
  return ICD11.find((d) => l.startsWith(d.code.toLowerCase() + " ") || l === d.code.toLowerCase() || l === d.title.toLowerCase())?.code ?? null;
};

class Rollback extends Error {}

export async function importMch(db: Db, data: MchExport, opts: MchImportOptions): Promise<MchImportReport> {
  const report: MchImportReport = {
    clientsCreated: 0, clientsMatched: 0, clientsSkipped: [], periods: 0, caseHistories: 0, caseHistoriesSkipped: [], notes: 0, notesByFallbackAuthor: 0, unmatchedPsychologists: [], staffCreated: [],
  };
  try {
    await db.transaction(async (tx) => {
      await run(tx, data, opts, report);
      if (opts.dryRun) throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return report;
}

async function run(tx: Tx, data: MchExport, opts: MchImportOptions, report: MchImportReport) {
  const staffRows = await tx.select({ id: schema.staff.id, name: schema.staff.name }).from(schema.staff);
  const staffByKey = new Map(staffRows.map((s) => [nameKey(s.name), s.id]));
  for (const [name, id] of Object.entries(opts.staffByName ?? {})) staffByKey.set(nameKey(name), id);
  // "anasooya" is "Anasooya Pramod" and "Theresa Thomas" is "Theresa P Thomas": one name's words all in the other's, if only one person fits.
  const words = (k: string) => new Set(k.split(" "));
  const within = (a: Set<string>, b: Set<string>) => [...a].every((w) => b.has(w));
  const match = (name: string) => {
    const key = nameKey(name);
    if (!key) return null;
    if (staffByKey.has(key)) return staffByKey.get(key)!;
    const w = words(key);
    const fits = new Set(staffRows.filter((s) => within(w, words(nameKey(s.name))) || within(words(nameKey(s.name)), w)).map((s) => s.id));
    return fits.size === 1 ? [...fits][0] : null;
  };

  const userName = new Map(data.users.map((u) => [u.id, u.name]));
  const staffForUser = (userId: Id | null) => (userId == null ? null : match(userName.get(userId) ?? ""));
  const psychUser = new Map(data.psychologists.map((p) => [p.id, p.user_id]));
  const forPsych = new Map<Id, string | null>();
  for (const p of data.psychologists) {
    const name = userName.get(p.user_id)?.trim() || `MCH psychologist ${p.id}`;
    let id = staffForUser(p.user_id) ?? staffByKey.get(nameKey(name)) ?? null;
    if (!id && opts.createMissingStaff) {
      // Kept switched off, without a way to sign in, so their notes keep their name; the admin turns them on if they still work here.
      [{ id }] = await tx.insert(schema.staff).values({
        name, email: `mch-psychologist-${p.id}@import.invalid`, accessRole: "psychologist", designation: "Psychologist", active: false,
      }).returning({ id: schema.staff.id });
      staffByKey.set(nameKey(name), id);
      report.staffCreated.push(name);
    } else if (!id) report.unmatchedPsychologists.push(name);
    forPsych.set(p.id, id);
  }
  const staffForPsych = (psychId: Id | null) => (psychId == null ? null : forPsych.get(psychId) ?? null);

  // Two MCH clients with one phone number would land on the same client here, mixing two people's records; those are left out.
  const phoneCount = new Map<string, number>();
  for (const m of data.clients) {
    const p = toE164(m.phone ?? "");
    if (p) phoneCount.set(p, (phoneCount.get(p) ?? 0) + 1);
  }

  const clientFor = new Map<Id, { id: string; code: string }>();
  for (const m of data.clients) {
    const phone = toE164(m.phone ?? "");
    if (!phone) { report.clientsSkipped.push({ code: m.client_code, why: "phone number not valid" }); continue; }
    if ((phoneCount.get(phone) ?? 0) > 1) { report.clientsSkipped.push({ code: m.client_code, why: "phone number shared with another MCH client" }); continue; }

    const emergencyPhone = m.emergency_contact && /^[+\d\s()-]{8,}$/.test(m.emergency_contact.trim()) ? toE164(m.emergency_contact) : null;
    const fields = {
      email: blank(m.email)?.toLowerCase() ?? null,
      gender: blank(m.gender), age: m.dob ? null : m.age || null, dateOfBirth: m.dob, address: blank(m.address), location: blank(m.current_location),
      occupation: blank(m.occupation), education: blank(m.education), maritalStatus: blank(m.marital_status),
      emergencyName: emergencyPhone ? null : blank(m.emergency_contact), emergencyPhone,
      registeredBy: staffForUser(m.created_by_id ?? null),
    };
    const [existing] = await tx.select().from(schema.client).where(eq(schema.client.phoneE164, phone));
    if (existing) {
      if (existing.mchId != null && existing.mchId !== m.id) { report.clientsSkipped.push({ code: m.client_code, why: "phone number already used by another MCH client" }); continue; }
      // Details already here win; MCH only fills what is missing.
      const fill = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v != null && existing[k as keyof typeof existing] == null));
      await tx.update(schema.client).set({ ...fill, mchCode: m.client_code, mchId: m.id }).where(eq(schema.client.id, existing.id));
      clientFor.set(m.id, { id: existing.id, code: m.client_code });
      report.clientsMatched++;
    } else {
      const [row] = await tx.insert(schema.client).values({
        name: m.full_name.trim(), phoneE164: phone, ...fields, mchCode: m.client_code, mchId: m.id,
        createdAt: m.registration_date ? onDay(m.registration_date) : new Date(m.created_at),
      }).returning({ id: schema.client.id });
      clientFor.set(m.id, { id: row.id, code: m.client_code });
      report.clientsCreated++;
    }
  }

  // Psychologist history: only for clients who have none here yet, so the two systems' periods never overlap.
  for (const [mchId, c] of clientFor) {
    const [has] = await tx.select({ id: schema.clientTherapist.id }).from(schema.clientTherapist).where(eq(schema.clientTherapist.clientId, c.id)).limit(1);
    if (has) continue;
    const m = data.clients.find((x) => x.id === mchId)!;
    let periods = data.assignments
      .filter((a) => a.client_id === mchId)
      .map((a) => ({ staffId: staffForPsych(a.psychologist_id), startsAt: onDay(a.start_date), endsAt: a.end_date ? onDay(a.end_date) : null, assignedBy: staffForUser(a.assigned_by_id), reason: blank(a.reason) }))
      .filter((p): p is typeof p & { staffId: string } => p.staffId != null)
      // The open period is MCH's current psychologist, so it goes last even when a closed one started the same day or later.
      .sort((a, b) => Number(a.endsAt === null) - Number(b.endsAt === null) || a.startsAt.getTime() - b.startsAt.getTime());
    if (periods.length === 0) {
      const staffId = staffForPsych(m.assigned_psychologist_id);
      if (staffId) periods = [{ staffId, startsAt: m.registration_date ? onDay(m.registration_date) : new Date(m.created_at), endsAt: null, assignedBy: null, reason: null }];
    }
    // At most one open period: an earlier open one ends when the next begins.
    periods.forEach((p, i) => { if (!p.endsAt && i < periods.length - 1) p.endsAt = periods[i + 1].startsAt; });
    if (periods.length) await tx.insert(schema.clientTherapist).values(periods.map((p) => ({ clientId: c.id, ...p })));
    report.periods += periods.length;
  }

  for (const h of data.case_histories) {
    const c = clientFor.get(h.client_id);
    if (!c) continue;
    const mse = h.mental_status_examination ?? {}, dx = h.diagnosis ?? {}, plan = h.treatment_plan ?? {}, rk = h.risk_assessment ?? {};
    const diagnosisLabel = blank(dx.primaryDiagnosis);
    const presentingComplaints = blank(h.presenting_problems);
    const fields = {
      presentingComplaints, historyPresent: blank(h.history_of_present_illness), medicalHistory: blank(h.medical_history),
      pastPsychiatric: blank(h.psychiatric_history), familyHistory: blank(h.family_history), personalHistory: blank(h.personal_history),
      educationalHistory: blank(h.educational_history), occupationalHistory: blank(h.occupational_history), relationshipHistory: blank(h.relationship_history),
      substanceUse: blank(h.substance_use), socialHistory: blank(h.social_history),
      mseAppearance: blank(mse.appearance), mseBehaviour: blank(mse.behavior), mseEyeContact: blank(mse.eyeContact), mseSpeech: blank(mse.speech),
      mseMoodAffect: blank(mse.moodAndAffect), mseThoughtProcess: blank(mse.thoughtProcess), mseThoughtContent: blank(mse.thoughtContent),
      msePerception: blank(mse.perception), mseCognition: blank(mse.cognition), mseInsightJudgement: blank(mse.insightAndJudgment),
      clinicalObservation: blank(h.clinical_observation),
      riskSuicide: risk(rk.suicideRisk), riskSelfHarm: risk(rk.selfHarmRisk), riskOthers: risk(rk.homicideRisk), riskNotes: blank(rk.riskNotes),
      diagnosisLabel, diagnosisCode: icd(diagnosisLabel), diagnosisSecondary: blank(dx.secondaryDiagnosis), diagnosisSpecifiers: blank(dx.specifiers),
      goalsShort: blank(plan.shortTermGoals), goalsLong: blank(plan.longTermGoals), approach: blank(plan.modality), planNotes: blank(h.treatment_goals),
      therapistNotes: blank(h.therapist_notes), remarks: blank(h.remarks), mchId: h.id,
      // As in MCH: complaints and a primary diagnosis make a completed intake.
      ...(presentingComplaints && diagnosisLabel
        ? { status: "in_treatment" as const, intakeCompletedAt: new Date(h.updated_at), intakeCompletedBy: staffForPsych(h.psychologist_id) }
        : {}),
    };
    const [existing] = await tx.select().from(schema.caseHistory).where(eq(schema.caseHistory.clientId, c.id));
    if (existing?.mchId === h.id) continue;
    if (existing && (existing.mchId != null || existing.presentingComplaints || existing.diagnosisLabel)) {
      report.caseHistoriesSkipped.push({ code: c.code, why: "already has a case history here" });
      continue;
    }
    if (existing) await tx.update(schema.caseHistory).set(fields).where(eq(schema.caseHistory.id, existing.id));
    else await tx.insert(schema.caseHistory).values({ clientId: c.id, ...fields, createdAt: new Date(h.created_at) });
    report.caseHistories++;
  }

  const notesByClient = new Map<Id, MchExport["session_notes"]>();
  for (const n of data.session_notes) notesByClient.set(n.client_id, [...(notesByClient.get(n.client_id) ?? []), n]);
  for (const [mchClient, notes] of notesByClient) {
    const c = clientFor.get(mchClient);
    if (!c) continue;
    // A client with session notes but no MCH case history still gets an (empty) record to hold them.
    let [record] = await tx.select({ id: schema.caseHistory.id }).from(schema.caseHistory).where(eq(schema.caseHistory.clientId, c.id));
    if (!record) [record] = await tx.insert(schema.caseHistory).values({ clientId: c.id }).returning({ id: schema.caseHistory.id });
    const taken = new Set((await tx.select({ n: schema.sessionNote.number }).from(schema.sessionNote).where(eq(schema.sessionNote.caseHistoryId, record.id))).map((r) => r.n));
    const done = new Set((await tx.select({ m: schema.sessionNote.mchId }).from(schema.sessionNote).where(eq(schema.sessionNote.caseHistoryId, record.id))).map((r) => r.m));
    for (const n of [...notes].sort((a, b) => a.session_date.localeCompare(b.session_date) || a.id - b.id)) {
      if (done.has(n.id)) continue;
      let number = n.session_number > 0 && !taken.has(n.session_number) ? n.session_number : 1;
      while (taken.has(number)) number++;
      taken.add(number);
      const author = staffForPsych(n.psychologist_id);
      if (!author) report.notesByFallbackAuthor++;
      await tx.insert(schema.sessionNote).values({
        caseHistoryId: record.id, number, sessionAt: onDay(n.session_date), authorId: author ?? opts.fallbackAuthorId,
        summary: blank(n.notes) ?? "(No notes written in MCH)", risk: risk(n.risk_level), homework: blank(n.homework), nextPlan: blank(n.treatment_recommendation),
        followUpOn: n.follow_up_date, durationText: blank(n.duration), clinicalObservation: blank(n.clinical_observation), progressNotes: blank(n.progress),
        therapistSignature: blank(n.therapist_signature), mchId: n.id,
        // Notes in MCH were final once saved, so they come over signed.
        signedAt: new Date(n.created_at), createdAt: new Date(n.created_at),
      });
      report.notes++;
    }
  }

}
