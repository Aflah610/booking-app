import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/features/container";
import { EDIT_SECTIONS, type CaseRecordDTO } from "@/features/case-history/case-history.dto";
import { LABEL, PART_OF_DAY } from "@/features/case-history/choices";
import { clientReference } from "@/features/clients/clients.dto";
import { isDomainError } from "@/features/shared/errors";
import { dateLabel, dayLabel, isoDay, timeLabel } from "@/lib/format";
import { requireStaff } from "@/lib/session";
import { Initials, RiskBadge, StatusBadge } from "@/components/CaseBadges";
import { Notice } from "@/components/Notice";
import { NoteFields, SessionNoteCard } from "@/components/SessionNote";
import { addNoteAction, sendFollowUpAction, requestIntakeEditAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Case history" };

export default async function CasePage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireStaff();
  const { clientId } = await params;
  const sp = await searchParams;
  let record: CaseRecordDTO;
  try {
    record = await app().caseHistory.open(me, clientId);
  } catch (err) {
    if (isDomainError(err) && err.code === "not_found") notFound();
    if (isDomainError(err) && err.code === "forbidden") return <Restricted clientId={clientId} />;
    throw err;
  }
  const [c, periods, s, noteable] = await Promise.all([
    app().clients.get(clientId),
    app().clients.therapistHistory(clientId),
    app().settings.get(),
    app().caseHistory.noteableBookings(me, clientId),
  ]);
  const writable = await app().caseHistory.canWrite(me, clientId);
  const editSteps = await app().caseHistory.intakeEditSteps(me, clientId);
  const requestable = writable && me.accessRole === "psychologist" && !me.clinicalAdmin && (Boolean(record.intakeCompletedAt) || record.status !== "intake_pending");
  const tz = s.timezone;
  const therapist = periods[0] && !periods[0].endsAt ? periods[0] : null;
  const r = record;
  const v = (x: string | null) => (x ? LABEL[x] ?? x : null);
  const empty = !r.presentingComplaints && !r.diagnosisLabel && !r.risk;

  return (
    <>
      <Link href="/admin/case-histories" className="text-sm text-zinc-600 hover:text-black">← Case histories</Link>
      <div className="mt-4"><Notice ok={sp.ok} error={sp.error} /></div>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
            <StatusBadge status={r.status} />
            {r.risk && <RiskBadge risk={r.risk} prefix="Risk: " />}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
            <span className="font-mono">{clientReference(c.number)}</span>
            <span aria-hidden="true">·</span>
            {therapist ? <><Initials name={therapist.staffName} /> {therapist.staffName}</> : "No therapist assigned"}
            {r.intakeCompletedAt && <><span aria-hidden="true">·</span> Intake completed {dateLabel(r.intakeCompletedAt, tz)}{r.intakeCompletedByName ? ` by ${r.intakeCompletedByName}` : ""}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/clients/${clientId}`} className="btn-ghost">Client profile</Link>
          {editSteps.length > 0 && <Link href={`/admin/case-histories/${clientId}/intake?step=${editSteps[0]}`} className="btn">{requestable ? "Edit approved section" : empty ? "Start case history" : "Edit case history"}</Link>}
          {requestable && <Link href="/admin/case-edit-requests" className="btn-ghost">My edit requests</Link>}
        </div>
      </header>

      {requestable && editSteps.length === 0 && <details className="card mb-6 p-5">
        <summary className="cursor-pointer font-medium">Request an edit to this completed case history</summary>
        <p className="my-3 text-sm text-zinc-600">A manager must approve the correction. Approval is for one save of the selected section, within 24 hours. Admins can see the request and decision.</p>
        <form action={requestIntakeEditAction.bind(null, clientId)} className="grid max-w-xl gap-3">
          <label className="label" htmlFor="edit-section">Section to correct</label>
          <select className="input" id="edit-section" name="step">{Object.entries(EDIT_SECTIONS).map(([step, title]) => <option key={step} value={step}>{title}</option>)}</select>
          <label className="label" htmlFor="edit-reason">Reason for requesting an edit</label>
          <textarea className="input" id="edit-reason" name="reason" rows={3} required minLength={10} maxLength={1000} placeholder="Explain the correction needed without copying clinical notes. The manager and admins will read this reason." />
          <div><button className="btn" type="submit">Send edit request</button></div>
        </form>
      </details>}
      {requestable && editSteps.length > 0 && <p className="mb-6 text-sm text-zinc-600">Your manager approved one correction. Saving the approved section locks it again.</p>}

      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Initial assessment</h2>
      {empty ? (
        <div className="card mb-10 px-6 py-10 text-center">
          <p className="font-medium">The intake hasn&apos;t been started</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-600">The same six steps as MCH: demographics, complaints, medical and family, life history, mental status, and diagnosis and plan. Each step saves on its own.</p>
        </div>
      ) : (
        <div className="mb-10 grid gap-4 lg:grid-cols-2">
          <Section title="Complaints & HPI" writable={editSteps.includes(2)} step={2} clientId={clientId}>
            <Text value={r.presentingComplaints} />
            <Facts rows={[["Onset", v(r.onset)], ["Duration", r.duration], ["Severity", v(r.severity)]]} />
            {r.historyPresent && <Text label="History of present illness" value={r.historyPresent} />}
          </Section>
          <Section title="Diagnosis" writable={editSteps.includes(6)} step={6} clientId={clientId}>
            {r.diagnosisLabel ? <p className="font-medium">{r.diagnosisLabel}{r.diagnosisCode && !r.diagnosisLabel.startsWith(r.diagnosisCode) && <span className="ml-2 text-sm font-normal text-zinc-600">{r.diagnosisCode}</span>}</p> : <p className="text-sm text-zinc-500">Not recorded</p>}
            <Facts rows={[["Secondary", r.diagnosisSecondary], ["Specifiers", r.diagnosisSpecifiers]]} />
            {r.formulation && <Text label="Formulation" value={r.formulation} />}
          </Section>
          <Section title="Mental status" writable={editSteps.includes(5)} step={5} clientId={clientId}>
            <Facts rows={[
              ["Appearance", r.mseAppearance], ["Behaviour", r.mseBehaviour ?? v(r.mseCooperation)], ["Eye contact", r.mseEyeContact], ["Rapport", v(r.mseRapport)],
              ["Speech", r.mseSpeech], ["Mood & affect", r.mseMoodAffect ?? ([r.mseMood, v(r.mseAffect)].filter(Boolean).join(", ") || null)],
              ["Thought process", r.mseThoughtProcess], ["Thought content", r.mseThoughtContent ?? r.mseThought], ["Perception", r.msePerception],
              ["Cognition", r.mseCognition], ["Insight & judgement", r.mseInsightJudgement ?? ([v(r.mseInsight), v(r.mseJudgement)].filter(Boolean).join(", ") || null)],
            ]} />
            {r.clinicalObservation && <Text label="Clinical observation" value={r.clinicalObservation} />}
          </Section>
          <Section title="Risk" writable={editSteps.includes(6)} step={6} clientId={clientId}>
            <dl className="grid gap-2 text-sm">
              {([["Suicide", r.riskSuicide], ["Self-harm", r.riskSelfHarm], ["Homicide", r.riskOthers]] as const).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3"><dt className="text-zinc-600">{label}</dt><dd><RiskBadge risk={value} /></dd></div>
              ))}
            </dl>
            {r.riskNotes && <Text label="Risk notes" value={r.riskNotes} />}
          </Section>
          <Section title="Treatment plan" writable={editSteps.includes(6)} step={6} clientId={clientId}>
            <Facts rows={[
              ["Modality", r.approach], ["Frequency", r.frequency], ["Short-term goals", r.goalsShort], ["Long-term goals", r.goalsLong],
              ["Overall strategy", r.planNotes], ["Therapist notes", r.therapistNotes], ["Remarks", r.remarks],
            ]} />
          </Section>
          <Section title="Medical & family" writable={editSteps.includes(3)} step={3} clientId={clientId}>
            <Facts rows={[["Medical", r.medicalHistory], ["Medication", r.medication], ["Past psychiatric", r.pastPsychiatric], ["Family", r.familyHistory]]} />
          </Section>
          <Section title="Life history" writable={editSteps.includes(4)} step={4} clientId={clientId}>
            <Facts rows={[
              ["Personal", r.personalHistory], ["Education", r.educationalHistory], ["Occupation", r.occupationalHistory],
              ["Relationships", r.relationshipHistory], ["Substance use", r.substanceUse], ["Social & living", r.socialHistory],
              ["Premorbid personality", r.premorbidPersonality],
            ]} />
          </Section>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <h2 className="pt-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Sessions <span className="tabular-nums">{r.notes.length}</span></h2>
        <Link href={`/admin/follow-ups/new?client=${clientId}`} className="btn-ghost ml-auto">Ask CCD to arrange next session</Link>
        {writable && <details className="group">
          <summary className="btn-ghost cursor-pointer list-none select-none">Send follow-up</summary>
          <form action={sendFollowUpAction.bind(null, clientId)} className="card mt-2 grid w-[min(28rem,calc(100vw-2rem))] gap-3 p-4">
            <p className="text-sm text-zinc-600">Suggest the client&apos;s next session. Nothing is booked: they arrange the actual time with you.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="suggestedOn">Suggested date</label><input className="input" id="suggestedOn" name="suggestedOn" type="date" required min={isoDay(new Date(), tz)} /></div>
              <div>
                <label className="label" htmlFor="partOfDay">Time of day</label>
                <select className="input" id="partOfDay" name="partOfDay" defaultValue="">
                  <option value="">Any time</option>
                  {PART_OF_DAY.map((p) => <option key={p} value={p}>{LABEL[p]}</option>)}
                </select>
              </div>
            </div>
            <div><label className="label" htmlFor="fuNote">Message (optional)</label><input className="input" id="fuNote" name="note" maxLength={500} placeholder="e.g. Bring your thought diary." /></div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="whatsapp" defaultChecked={c.whatsappOptIn} /> WhatsApp</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="email" defaultChecked={Boolean(c.email)} disabled={!c.email} /> Email{!c.email && <span className="text-zinc-500">(no address)</span>}</label>
            </div>
            <div><button className="btn" type="submit">Send</button></div>
          </form>
        </details>}
      </div>
      {r.followUps.length > 0 && (
        <ul className="mb-4 grid gap-2">
          {r.followUps.map((f) => (
            <li key={f.id} className="rounded-lg border border-dashed border-zinc-300 px-4 py-2.5">
              <p className="text-sm">Follow-up initiated for <span className="font-medium">{dayLabel(new Date(`${f.suggestedOn}T12:00:00Z`), "UTC")} {f.suggestedOn.slice(0, 4)}</span>{f.partOfDay && <span className="text-zinc-600"> · {LABEL[f.partOfDay].toLowerCase()}</span>}{f.note && <span className="text-zinc-600"> · &ldquo;{f.note}&rdquo;</span>}</p>
              <p className="text-[11px] text-zinc-500">
                {dateLabel(f.createdAt, tz)}, {timeLabel(f.createdAt, tz)} by {f.sentByName} · WhatsApp {DELIVERY_LABEL[f.whatsapp]} · Email {DELIVERY_LABEL[f.email]}
              </p>
            </li>
          ))}
        </ul>
      )}
      {writable && <details className="card mb-4 p-5" open={r.notes.length === 0 && !empty}>
        <summary className="cursor-pointer font-medium">Add session note</summary>
        <form action={addNoteAction.bind(null, clientId)} className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="bookingId">Session</label>
            <select className="input" id="bookingId" name="bookingId" defaultValue={noteable[0]?.id ?? ""}>
              {noteable.map((b) => <option key={b.id} value={b.id}>{dayLabel(b.startsAt, tz)}, {timeLabel(b.startsAt, tz)} · {b.serviceName} · {b.staffName}</option>)}
              <option value="">Not booked here (give the date)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sessionOn">Date, if not booked</label>
            <input className="input" id="sessionOn" name="sessionOn" type="date" />
          </div>
          <NoteFields />
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-ghost" type="submit" name="intent" value="draft">Save draft</button>
            <button className="btn" type="submit" name="intent" value="sign">Save and sign</button>
          </div>
          <p className="text-xs text-zinc-600 sm:col-span-3">A signed note can&apos;t be changed; corrections are added as dated addenda.</p>
        </form>
      </details>}

      {r.notes.length === 0 ? (
        <p className="card px-6 py-8 text-center text-sm text-zinc-600">No session notes yet.</p>
      ) : (
        <ol className="grid gap-4">
          {r.notes.map((n) => <SessionNoteCard key={n.id} n={n} clientId={clientId} tz={tz} meId={me.id} writable={writable} />)}
        </ol>
      )}
    </>
  );
}

const DELIVERY_LABEL: Record<string, string> = { sent: "sent", not_set_up: "not set up", no_contact: "no address", failed: "failed", not_chosen: "not chosen" };

function Section({ title, step, clientId, children, writable }: { writable: boolean; title: string; step: number; clientId: string; children: React.ReactNode }) {
  return (
    <section className="card grid content-start gap-3 p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        {writable && <Link href={`/admin/case-histories/${clientId}/intake?step=${step}`} className="text-sm text-zinc-600 underline-offset-4 hover:text-black hover:underline">Edit</Link>}
      </div>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, string | null][] }) {
  const filled = rows.filter(([, value]) => value);
  if (filled.length === 0) return <p className="text-sm text-zinc-500">Not recorded</p>;
  return (
    <dl className="grid gap-2 text-sm">
      {filled.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3"><dt className="text-zinc-600">{label}</dt><dd className="whitespace-pre-line break-words">{value}</dd></div>
      ))}
    </dl>
  );
}

function Text({ label, value }: { label?: string; value: string | null }) {
  if (!value) return <p className="text-sm text-zinc-500">Not recorded</p>;
  return (
    <div className="text-sm">
      {label && <p className="mb-1 text-zinc-600">{label}</p>}
      <p className="whitespace-pre-line leading-6">{value}</p>
    </div>
  );
}

function Restricted({ clientId }: { clientId: string }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg px-6 py-10 text-center">
      <p className="font-medium">This case history is private</p>
      <p className="mt-1 text-sm text-zinc-600">Only the client&apos;s therapist and clinical admins can open it.</p>
      <Link href={`/admin/clients/${clientId}`} className="btn-ghost mt-4">Open the client profile</Link>
    </div>
  );
}
