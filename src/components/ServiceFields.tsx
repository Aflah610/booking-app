import type { ServiceDTO } from "@/features/catalog/catalog.dto";

export function ServiceFields({ s }: { s?: ServiceDTO }) {
  return (
    <>
      <div className="sm:col-span-2"><label className="label" htmlFor="name">Name</label><input className="input" id="name" name="name" defaultValue={s?.name} required /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="description">Description</label><textarea className="input" id="description" name="description" rows={2} defaultValue={s?.description ?? ""} /></div>
      <div><label className="label" htmlFor="durationMin">Duration (minutes)</label><input className="input" id="durationMin" name="durationMin" type="number" min={5} step={5} defaultValue={s?.durationMin ?? 30} required /></div>
      <div><label className="label" htmlFor="priceDisplay">Price shown</label><input className="input" id="priceDisplay" name="priceDisplay" placeholder="e.g. ₹1,500" defaultValue={s?.priceDisplay ?? ""} /></div>
      <div><label className="label" htmlFor="bufferBeforeMin">Buffer before (minutes)</label><input className="input" id="bufferBeforeMin" name="bufferBeforeMin" type="number" min={0} defaultValue={s?.bufferBeforeMin ?? 0} /></div>
      <div><label className="label" htmlFor="bufferAfterMin">Buffer after (minutes)</label><input className="input" id="bufferAfterMin" name="bufferAfterMin" type="number" min={0} defaultValue={s?.bufferAfterMin ?? 0} /></div>
      <p className="text-sm text-zinc-500 sm:col-span-2">Leave these empty to use the business defaults.</p>
      <div><label className="label" htmlFor="slotIntervalMin">Start times every (minutes)</label><input className="input" id="slotIntervalMin" name="slotIntervalMin" type="number" min={5} defaultValue={s?.slotIntervalMin ?? ""} /></div>
      <div><label className="label" htmlFor="minNoticeMin">Minimum notice (minutes)</label><input className="input" id="minNoticeMin" name="minNoticeMin" type="number" min={0} defaultValue={s?.minNoticeMin ?? ""} /></div>
      <div><label className="label" htmlFor="maxNoticeDays">Book up to (days ahead)</label><input className="input" id="maxNoticeDays" name="maxNoticeDays" type="number" min={1} defaultValue={s?.maxNoticeDays ?? ""} /></div>
    </>
  );
}
