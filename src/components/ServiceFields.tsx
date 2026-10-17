import type { ServiceDTO } from "@/features/catalog/catalog.dto";
import { formatQuestions } from "@/features/catalog/questions";

export function ServiceFields({ s }: { s?: ServiceDTO }) {
  return (
    <>
      <div className="sm:col-span-2"><label className="label" htmlFor="name">Name</label><input className="input" id="name" name="name" defaultValue={s?.name} required /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="description">Description</label><textarea className="input" id="description" name="description" rows={2} defaultValue={s?.description ?? ""} /></div>
      <div><label className="label" htmlFor="durationMin">Duration (minutes)</label><input className="input" id="durationMin" name="durationMin" type="number" min={5} step={5} defaultValue={s?.durationMin ?? 30} required /></div>
      <div>
        <label className="label" htmlFor="priceDisplay">Price</label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-zinc-600">₹</span>
          <input className="input input-prefixed" id="priceDisplay" name="priceDisplay" placeholder="1500" defaultValue={s?.priceDisplay?.replace(/^₹/, "") ?? ""} />
        </div>
        <p className="mt-1 text-xs text-zinc-600">A plain amount like 1500 is what your website charges online{s?.pricePaise ? ` (now ${s.pricePaise} paise)` : ""}. Text like “From ₹500” is only shown.</p>
      </div>
      <div><label className="label" htmlFor="bufferBeforeMin">Buffer before (minutes)</label><input className="input" id="bufferBeforeMin" name="bufferBeforeMin" type="number" min={0} defaultValue={s?.bufferBeforeMin ?? 0} /></div>
      <div><label className="label" htmlFor="bufferAfterMin">Buffer after (minutes)</label><input className="input" id="bufferAfterMin" name="bufferAfterMin" type="number" min={0} defaultValue={s?.bufferAfterMin ?? 0} /></div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="meetingType">How it happens</label>
        <select className="input" id="meetingType" name="meetingType" defaultValue={s?.meetingType ?? "in_person"}>
          <option value="in_person">In person</option>
          <option value="google_meet">Online with Google Meet</option>
        </select>
        <p className="mt-1 text-xs text-zinc-600">Online sessions get a Meet link in the therapist&apos;s calendar event. It needs &ldquo;Online sessions&rdquo; switched on in Settings and the therapist&apos;s Google Calendar connected.</p>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="location">Where it happens</label>
        <input className="input" id="location" name="location" defaultValue={s?.location ?? ""} placeholder="Clinic address, or a meeting link like https://meet.google.com/…" />
        <p className="mt-1 text-xs text-zinc-600">Shown to the client and added to their calendar invite.</p>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="questions">Questions for the client</label>
        <textarea className="input font-mono" id="questions" name="questions" rows={4} defaultValue={s ? formatQuestions(s.questions) : ""} placeholder={"Reason for visit*\nAnything we should know (long)\nPreferred language: English, Hindi, Tamil"} />
        <p className="mt-1 text-xs text-zinc-600">One per line, asked on the booking form. End with * if required. Add <code>(long)</code> for a bigger box, or <code>: A, B, C</code> to pick one.</p>
      </div>
      <p className="border-t border-zinc-200 pt-4 text-sm text-zinc-600 sm:col-span-2">Leave these empty to use the business defaults.</p>
      <div><label className="label" htmlFor="slotIntervalMin">Start times every (minutes)</label><input className="input" id="slotIntervalMin" name="slotIntervalMin" type="number" min={5} defaultValue={s?.slotIntervalMin ?? ""} /></div>
      <div><label className="label" htmlFor="minNoticeMin">Minimum notice (minutes)</label><input className="input" id="minNoticeMin" name="minNoticeMin" type="number" min={0} defaultValue={s?.minNoticeMin ?? ""} /></div>
      <div><label className="label" htmlFor="maxNoticeDays">Book up to (days ahead)</label><input className="input" id="maxNoticeDays" name="maxNoticeDays" type="number" min={1} defaultValue={s?.maxNoticeDays ?? ""} /></div>
      <div><label className="label" htmlFor="maxPerDay">Most bookings per day</label><input className="input" id="maxPerDay" name="maxPerDay" type="number" min={1} defaultValue={s?.maxPerDay ?? ""} placeholder="No limit" /></div>
    </>
  );
}
