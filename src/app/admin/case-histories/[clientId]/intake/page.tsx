import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { app } from "@/features/container";
import type { CaseRecordDTO, IntakeFields } from "@/features/case-history/case-history.dto";
import { LABEL, RISK } from "@/features/case-history/choices";
import { ICD11 } from "@/features/case-history/icd11";
import { clientAge, clientReference } from "@/features/clients/clients.dto";
import { isDomainError } from "@/features/shared/errors";
import { dateLabel, isoDay, phoneLabel } from "@/lib/format";
import { allowed, requireStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { saveIntakeAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Case history" };

// The same six steps and questions as the MCH case history the psychologists already know.
const STEPS = ["Demographics", "Complaints & HPI", "Medical & Family", "Life History", "MSE & Observation", "Diagnosis & Plan"] as const;
const HEADINGS = [
  "Patient demographics",
  "Presenting complaints & history of present illness",
  "Past medical, psychiatric & family history",
  "Personal, educational, occupational, relationship & social history",
  "Mental status examination & clinical observation",
  "Risk assessment, diagnosis & treatment plan",
] as const;

type Field = { kind: "text" | "line"; name: keyof IntakeFields; label: string; placeholder: string; rows?: number; required?: boolean };

const FIELDS: Record<2 | 3 | 4 | 5, Field[]> = {
  2: [
    { kind: "text", name: "presentingComplaints", label: "Presenting complaints", placeholder: "Chief complaints in the client's own words...", rows: 4, required: true },
    { kind: "text", name: "historyPresent", label: "History of present illness (HPI)", placeholder: "Onset, course, triggers and intensity of symptoms...", rows: 6 },
  ],
  3: [
    { kind: "text", name: "medicalHistory", label: "Medical history", placeholder: "Chronic conditions, medications, surgeries..." },
    { kind: "text", name: "pastPsychiatric", label: "Past psychiatric history", placeholder: "Previous therapy, hospitalisations, psychiatric medication..." },
    { kind: "text", name: "familyHistory", label: "Family history", placeholder: "Mental illness or substance use in the family, family stressors..." },
  ],
  4: [
    { kind: "text", name: "personalHistory", label: "Personal developmental history", placeholder: "Birth, milestones, early childhood, trauma..." },
    { kind: "text", name: "educationalHistory", label: "Educational background", placeholder: "Academic performance, qualifications, school adjustment..." },
    { kind: "text", name: "occupationalHistory", label: "Occupational history", placeholder: "Employment, job stability, work stressors..." },
    { kind: "text", name: "relationshipHistory", label: "Relationship & marital history", placeholder: "Marital status, family dynamics, relationships..." },
    { kind: "text", name: "substanceUse", label: "Substance use history", placeholder: "Alcohol, tobacco, caffeine, other substances..." },
    { kind: "text", name: "socialHistory", label: "Social & living environment", placeholder: "Living situation, support network, financial or social stressors..." },
  ],
  5: [
    { kind: "line", name: "mseAppearance", label: "Appearance", placeholder: "e.g. Well-groomed, neat" },
    { kind: "line", name: "mseBehaviour", label: "Behaviour", placeholder: "e.g. Cooperative, calm, restless" },
    { kind: "line", name: "mseEyeContact", label: "Eye contact", placeholder: "e.g. Sustained, fleeting, avoided" },
    { kind: "line", name: "mseSpeech", label: "Speech", placeholder: "e.g. Normal rate, volume and rhythm" },
    { kind: "line", name: "mseMoodAffect", label: "Mood & affect", placeholder: "e.g. Anxious mood, congruent affect" },
    { kind: "line", name: "mseThoughtProcess", label: "Thought process", placeholder: "e.g. Goal-directed, linear" },
    { kind: "line", name: "mseThoughtContent", label: "Thought content", placeholder: "e.g. No delusions or suicidal ideation" },
    { kind: "line", name: "msePerception", label: "Perception", placeholder: "e.g. No hallucinations" },
    { kind: "line", name: "mseCognition", label: "Cognition", placeholder: "e.g. Oriented x4, memory intact" },
    { kind: "line", name: "mseInsightJudgement", label: "Insight & judgement", placeholder: "e.g. Good insight and judgement" },
    { kind: "text", name: "clinicalObservation", label: "Clinical observation notes", placeholder: "Affect, non-verbal cues, how the client engaged..." },
  ],
};

const RISKS: { name: keyof IntakeFields; label: string }[] = [
  { name: "riskSuicide", label: "Suicide risk" },
  { name: "riskSelfHarm", label: "Self-harm risk" },
  { name: "riskOthers", label: "Homicide risk" },
];

export default async function IntakePage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ step?: string; ok?: string; error?: string }> }) {
  const me = await requireStaff();
  const { clientId } = await params;
  const sp = await searchParams;
  const step = Math.min(6, Math.max(1, Number(sp.step) || 1));
  let r: CaseRecordDTO;
  try {
    r = await app().caseHistory.open(me, clientId);
  } catch (err) {
    if (isDomainError(err) && err.code === "not_found") notFound();
    if (isDomainError(err) && err.code === "forbidden") redirect(`/admin/case-histories/${clientId}`);
    throw err;
  }
  const [c, s] = await Promise.all([app().clients.get(clientId), app().settings.get()]);
  const value = (name: keyof IntakeFields) => (r[name] as string | null) ?? "";

  const age = clientAge(c, isoDay(new Date(), s.timezone));
  const emergency = [c.emergencyName, c.emergencyRelation && `(${c.emergencyRelation})`, c.emergencyPhone && phoneLabel(c.emergencyPhone)].filter(Boolean).join(" ");
  const details: [string, string | null][] = [
    ["Full name", c.name],
    ["Client code", c.mchCode ? `${clientReference(c.number)} · MCH ${c.mchCode}` : clientReference(c.number)],
    ["Gender", c.gender],
    ["Age", age != null ? `${age} years` : null],
    ["Registration date", dateLabel(c.createdAt, s.timezone)],
    ["Occupation", c.occupation],
    ["Education", c.education],
    ["Marital status", c.maritalStatus],
    ["Current location", c.location],
  ];
  // Psychologists don't see contact details (Settings > Roles & access); in MCH this showed "Intake desk only".
  if (allowed(me, "clients.contact")) details.push(["Phone", phoneLabel(c.phoneE164)], ["Email", c.email], ["Address", c.address], ["Emergency contact", emergency || null]);

  const box = (f: Field) => (
    <div key={f.name}>
      <label className="label" htmlFor={f.name}>{f.label}{f.required && <span className="text-red-600"> *</span>}</label>
      {f.kind === "text"
        ? <textarea className="input" id={f.name} name={f.name} rows={f.rows ?? 3} placeholder={f.placeholder} defaultValue={value(f.name)} />
        : <input className="input" id={f.name} name={f.name} placeholder={f.placeholder} defaultValue={value(f.name)} />}
    </div>
  );

  return (
    <>
      <Link href={`/admin/case-histories/${clientId}`} className="text-sm text-zinc-600 hover:text-black">← {c.name}&apos;s case history</Link>
      <div className="mb-6 mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">Case history</h1>
        <p className="mt-1 text-sm text-zinc-600">{c.name} · <span className="font-mono">{clientReference(c.number)}</span> · each step saves on its own</p>
      </div>
      <Notice ok={sp.ok} error={sp.error} />

      <nav className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Case history steps">
        {STEPS.map((label, i) => (
          <Link key={label} href={`?step=${i + 1}`} aria-current={step === i + 1 ? "step" : undefined}
            className={`rounded-lg border px-3 py-2 text-sm ${step === i + 1 ? "border-black bg-black text-white" : "border-zinc-200 text-zinc-700 hover:border-zinc-400"}`}>
            <span className={`block text-[11px] uppercase tracking-wider ${step === i + 1 ? "text-zinc-300" : "text-zinc-500"}`}>Step {i + 1}</span>
            {label}
          </Link>
        ))}
      </nav>

      {step === 1 ? (
        <section className="card max-w-4xl p-5">
          <h2 className="mb-4 font-semibold">Step 1: {HEADINGS[0]}</h2>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {details.map(([k, v]) => (
              <div key={k} className="flex gap-2"><dt className="shrink-0 text-zinc-600">{k}:</dt><dd className={v ? "font-medium" : "text-zinc-500"}>{v ?? "Not recorded"}</dd></div>
            ))}
            {!allowed(me, "clients.contact") && (
              <div className="flex gap-2"><dt className="shrink-0 text-zinc-600">Contact details:</dt><dd className="italic text-zinc-500">Front desk only</dd></div>
            )}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className="btn" href="?step=2">Continue</Link>
            {allowed(me, "clients.view") && <Link className="btn-ghost" href={`/admin/clients/${clientId}/edit`}>Edit client details</Link>}
          </div>
        </section>
      ) : (
        <form action={saveIntakeAction.bind(null, clientId, step)} className="card grid max-w-4xl gap-4 p-5">
          <h2 className="font-semibold">Step {step}: {HEADINGS[step - 1]}</h2>

          {step === 2 || step === 3 ? FIELDS[step].map(box) : null}
          {step === 4 && <div className="grid gap-4 md:grid-cols-2">{FIELDS[4].map(box)}</div>}
          {step === 5 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{FIELDS[5].filter((f) => f.kind === "line").map(box)}</div>
              {FIELDS[5].filter((f) => f.kind === "text").map(box)}
            </>
          )}

          {step === 6 && (
            <>
              <fieldset className="grid gap-4 rounded-lg border border-red-200 bg-red-50/40 p-4 sm:grid-cols-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-red-800">Risk assessment</legend>
                {RISKS.map((x) => (
                  <div key={x.name}>
                    <label className="label" htmlFor={x.name}>{x.label}</label>
                    <select className="input" id={x.name} name={x.name} defaultValue={value(x.name)}>
                      <option value="">Not assessed</option>
                      {RISK.map((v) => <option key={v} value={v}>{LABEL[v]}</option>)}
                    </select>
                  </div>
                ))}
                <div className="sm:col-span-3">
                  <label className="label" htmlFor="riskNotes">Risk notes & rationale</label>
                  <textarea className="input" id="riskNotes" name="riskNotes" rows={2} placeholder="e.g. No acute suicidal or homicidal intent" defaultValue={value("riskNotes")} />
                </div>
              </fieldset>

              <div>
                <label className="label" htmlFor="diagnosisLabel">Primary clinical diagnosis (DSM-5 / ICD-11)<span className="text-red-600"> *</span></label>
                <input className="input" id="diagnosisLabel" name="diagnosisLabel" list="icd11" placeholder="e.g. 6B00 Generalised anxiety disorder" defaultValue={value("diagnosisLabel")} />
                <datalist id="icd11">{ICD11.map((d) => <option key={d.code} value={`${d.code} ${d.title}`} />)}</datalist>
                <p className="mt-1.5 text-xs text-zinc-600">Type it as you would write it, or pick an ICD-11 code from the suggestions.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="diagnosisSecondary">Secondary diagnosis (optional)</label>
                  <input className="input" id="diagnosisSecondary" name="diagnosisSecondary" placeholder="e.g. Insomnia" defaultValue={value("diagnosisSecondary")} />
                </div>
                <div>
                  <label className="label" htmlFor="diagnosisSpecifiers">Specifiers & subtypes (optional)</label>
                  <input className="input" id="diagnosisSpecifiers" name="diagnosisSpecifiers" placeholder="e.g. Moderate, with anxious distress" defaultValue={value("diagnosisSpecifiers")} />
                </div>
              </div>

              <fieldset className="grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-2">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-700">Treatment plan & goals</legend>
                <div>
                  <label className="label" htmlFor="goalsShort">Short-term therapy goals</label>
                  <textarea className="input" id="goalsShort" name="goalsShort" rows={3} defaultValue={value("goalsShort")} />
                </div>
                <div>
                  <label className="label" htmlFor="goalsLong">Long-term therapy goals</label>
                  <textarea className="input" id="goalsLong" name="goalsLong" rows={3} defaultValue={value("goalsLong")} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="approach">Therapeutic modality / approach</label>
                  <input className="input" id="approach" name="approach" placeholder="e.g. CBT" defaultValue={value("approach")} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="planNotes">Overall treatment strategy / notes</label>
                  <textarea className="input" id="planNotes" name="planNotes" rows={3} placeholder="Strategy, how often to meet, referrals..." defaultValue={value("planNotes")} />
                </div>
              </fieldset>

              <div>
                <label className="label" htmlFor="therapistNotes">Therapist notes</label>
                <textarea className="input" id="therapistNotes" name="therapistNotes" rows={2} defaultValue={value("therapistNotes")} />
              </div>
              <div>
                <label className="label" htmlFor="remarks">Remarks</label>
                <textarea className="input" id="remarks" name="remarks" rows={2} defaultValue={value("remarks")} />
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="btn" type="submit" name="intent" value="save">{step < 6 ? "Save and continue" : "Save"}</button>
            {step === 6 && r.status === "intake_pending" && <button className="btn-ghost" type="submit" name="intent" value="complete">Save and mark complete</button>}
            <Link className="btn-ghost" href={`?step=${step - 1}`}>Back</Link>
          </div>
          {step === 6 && r.status === "intake_pending" && <p className="text-xs text-zinc-600"><span className="text-red-600">*</span> Presenting complaints (step 2) and the primary diagnosis are needed to mark it complete.</p>}
        </form>
      )}
    </>
  );
}
