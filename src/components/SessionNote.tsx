import type { SessionNoteDTO } from "@/features/case-history/case-history.dto";
import { LABEL, PROGRESS, RESPONSE, RISK } from "@/features/case-history/choices";
import { addAddendumAction, deleteDraftAction, updateDraftAction } from "@/app/admin/case-histories/actions";
import { dateLabel, longDayLabel, timeLabel } from "@/lib/format";
import { Initials, RiskBadge } from "./CaseBadges";

const stamp = (d: Date, tz: string) => `${dateLabel(d, tz)}, ${timeLabel(d, tz)}`;

function Choice({ name, label, values, value }: { name: string; label: string; values: readonly string[]; value?: string | null }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select className="input" id={name} name={name} defaultValue={value ?? ""}>
        <option value="">Not recorded</option>
        {values.map((v) => <option key={v} value={v}>{LABEL[v]}</option>)}
      </select>
    </div>
  );
}

/** The fields of a note, shared by the new-note form and a draft's edit form. */
export function NoteFields({ note }: { note?: SessionNoteDTO }) {
  return (
    <>
      <div className="sm:col-span-3">
        <label className="label" htmlFor="summary">Session summary</label>
        <textarea className="input" id="summary" name="summary" rows={5} required defaultValue={note?.summary ?? ""} placeholder="What was covered, what the client reported, observations." />
      </div>
      <Choice name="risk" label="Risk this session" values={RISK} value={note?.risk} />
      <Choice name="response" label="Client's response" values={RESPONSE} value={note?.response} />
      <Choice name="progress" label="Progress since last session" values={PROGRESS} value={note?.progress} />
      <div className="sm:col-span-2"><label className="label" htmlFor="nextPlan">Next plan</label><input className="input" id="nextPlan" name="nextPlan" defaultValue={note?.nextPlan ?? ""} /></div>
      <div><label className="label" htmlFor="followUpOn">Follow-up on</label><input className="input" id="followUpOn" name="followUpOn" type="date" defaultValue={note?.followUpOn ?? ""} /></div>
      <div className="sm:col-span-3"><label className="label" htmlFor="homework">Homework</label><input className="input" id="homework" name="homework" defaultValue={note?.homework ?? ""} /></div>
    </>
  );
}

export function SessionNoteCard({ n, clientId, tz, meId }: { n: SessionNoteDTO; clientId: string; tz: string; meId: string }) {
  const draft = !n.signedAt;
  const mine = n.authorId === meId;
  return (
    <li className="card grid gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-black px-2 py-0.5 text-xs font-semibold text-white">Session {n.number}</span>
          <span className="text-sm font-medium">{longDayLabel(n.sessionAt, tz)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {n.risk && <RiskBadge risk={n.risk} prefix="Risk: " />}
          {n.response && <span className="badge">{LABEL[n.response]}</span>}
          {n.progress && <span className={`badge ${n.progress === "improved" ? "border-green-300 text-green-700" : n.progress === "worse" ? "border-red-300 text-red-700" : ""}`}>{LABEL[n.progress]}</span>}
          <span className={`badge ${draft ? "border-dashed border-zinc-400 text-zinc-700" : "border-zinc-200 text-zinc-600"}`}>{draft ? "Draft" : "Signed"}</span>
        </div>
      </div>

      <p className="whitespace-pre-line text-sm leading-6">{n.summary}</p>
      {(n.nextPlan || n.homework || n.followUpOn) && (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          {n.nextPlan && <div><dt className="inline text-zinc-600">Next plan: </dt><dd className="inline">{n.nextPlan}</dd></div>}
          {n.homework && <div><dt className="inline text-zinc-600">Homework: </dt><dd className="inline">{n.homework}</dd></div>}
          {n.followUpOn && <div><dt className="inline text-zinc-600">Follow-up: </dt><dd className="inline">{dateLabel(new Date(`${n.followUpOn}T12:00:00Z`), "UTC")}</dd></div>}
        </dl>
      )}

      {n.addenda.length > 0 && (
        <ul className="grid gap-2 border-l-2 border-zinc-200 pl-3">
          {n.addenda.map((a) => (
            <li key={a.id} className="text-sm">
              <p className="whitespace-pre-line">{a.text}</p>
              <p className="text-xs text-zinc-600">Addendum by {a.authorName} · {stamp(a.createdAt, tz)}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
        <p className="flex items-center gap-2 text-xs text-zinc-600">
          <Initials name={n.authorName} />
          <span>Written by <span className="font-medium text-black">{n.authorName}</span> · {stamp(n.createdAt, tz)}{n.signedAt ? ` · signed ${stamp(n.signedAt, tz)}` : ""}</span>
        </p>
        {draft && mine && (
          <form action={deleteDraftAction.bind(null, clientId, n.id)}><button className="text-xs text-red-700 hover:underline" type="submit">Delete draft</button></form>
        )}
      </div>

      {draft && mine && (
        <details>
          <summary className="cursor-pointer text-sm font-medium underline underline-offset-4">Edit draft</summary>
          <form action={updateDraftAction.bind(null, clientId, n.id)} className="mt-3 grid gap-3 sm:grid-cols-3">
            <NoteFields note={n} />
            <div className="flex gap-2 sm:col-span-3">
              <button className="btn-ghost" type="submit" name="intent" value="draft">Save draft</button>
              <button className="btn" type="submit" name="intent" value="sign">Save and sign</button>
            </div>
          </form>
        </details>
      )}
      {!draft && (
        <details>
          <summary className="cursor-pointer text-sm text-zinc-600 underline underline-offset-4">Add addendum</summary>
          <form action={addAddendumAction.bind(null, clientId, n.id)} className="mt-3 grid gap-2">
            <label className="sr-only" htmlFor={`add-${n.id}`}>Addendum</label>
            <textarea className="input" id={`add-${n.id}`} name="text" rows={3} required placeholder="A correction or later remark. The signed note stays as it is." />
            <div><button className="btn-ghost" type="submit">Add addendum</button></div>
          </form>
        </details>
      )}
    </li>
  );
}
