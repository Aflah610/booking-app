"use client";

import { useActionState, useRef, useState } from "react";
import { PLACEHOLDERS } from "@/features/workflows/templates";
import { TRIGGER_LABEL, type WorkflowTrigger } from "@/features/workflows/workflows.dto";
import type { WorkflowInput } from "@/features/workflows/workflows.schemas";

type Action = (prev: { error?: string } | null, form: FormData) => Promise<{ error?: string } | null>;
type Field = HTMLInputElement | HTMLTextAreaElement;

const UNITS = [["minutes", 1], ["hours", 60], ["days", 1440]] as const;
const EVENT_TRIGGERS: WorkflowTrigger[] = ["booked", "rescheduled", "cancelled", "completed", "no_show", "payment_success", "payment_failed"];
const TIME_TRIGGERS: WorkflowTrigger[] = ["appointment_start", "appointment_end"];

/** Splits a stored delay into the biggest whole unit, so 1440 shows as "1 day". */
function splitOffset(min: number) {
  const unit = [...UNITS].reverse().find(([, size]) => min > 0 && min % size === 0) ?? UNITS[0];
  return { value: min / unit[1], size: unit[1] };
}

export function WorkflowForm({
  initial,
  services,
  action,
  submitLabel,
}: {
  initial: WorkflowInput;
  services: { id: string; name: string }[];
  action: Action;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [name, setName] = useState(initial.name);
  const [active, setActive] = useState(initial.active ?? true);
  const [trigger, setTrigger] = useState<WorkflowTrigger>(initial.trigger);
  const [timing, setTiming] = useState(initial.timing ?? "immediately");
  const first = splitOffset(initial.offsetMin ?? 0);
  const [amount, setAmount] = useState(first.value || 1);
  const [size, setSize] = useState<number>(first.size);
  const [serviceIds, setServiceIds] = useState<string[]>(initial.serviceIds ?? []);
  const [channel, setChannel] = useState(initial.action.channel);
  const a = initial.action;
  const [recipient, setRecipient] = useState<"client" | "staff">(a.channel === "email" ? a.recipient ?? "client" : "client");
  const [subject, setSubject] = useState(a.channel === "email" ? a.subject : "");
  const [body, setBody] = useState(a.channel === "email" ? a.body : "");
  const [attachInvite, setAttachInvite] = useState(a.channel === "email" ? Boolean(a.attachInvite) : false);
  const [templateName, setTemplateName] = useState(a.channel === "whatsapp" ? a.templateName : "");
  const [language, setLanguage] = useState(a.channel === "whatsapp" ? a.language ?? "en" : "en");
  const [params, setParams] = useState(a.channel === "whatsapp" ? (a.params ?? []).join("\n") : "");
  const [url, setUrl] = useState(a.channel === "webhook" ? a.url : "https://");
  const lastField = useRef<Field | null>(null);

  const timeBased = TIME_TRIGGERS.includes(trigger);
  const delayed = timing !== "immediately";

  const choose = (t: WorkflowTrigger) => {
    setTrigger(t);
    // "Before" only makes sense relative to a start or end time.
    if (!TIME_TRIGGERS.includes(t) && timing === "before") setTiming("immediately");
  };

  /** Drops the variable where the cursor last was, in whichever message box was last used. */
  const insert = (key: string) => {
    const el = lastField.current;
    const tag = `{{${key}}}`;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + tag + el.value.slice(end);
    if (el.id === "subject") setSubject(next);
    else if (el.id === "body") setBody(next);
    else if (el.id === "params") setParams(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const payload: WorkflowInput = {
    name,
    active,
    trigger,
    timing: delayed ? timing : "immediately",
    offsetMin: delayed ? Math.round(amount * size) : 0,
    serviceIds,
    action:
      channel === "email"
        ? { channel, recipient, subject, body, attachInvite }
        : channel === "whatsapp"
          ? { channel, templateName, language, params: params.split("\n").map((p) => p.trim()).filter(Boolean) }
          : { channel, url },
  };

  const track = { onFocus: (e: React.FocusEvent<Field>) => (lastField.current = e.currentTarget) };

  return (
    <form action={formAction} className="grid max-w-3xl gap-6">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {state?.error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}

      <section className="card grid gap-4 p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">Name</label>
          <input className="input" id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reminder 24 hours before" required />
        </div>
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <input type="checkbox" className="toggle" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
      </section>

      <section className="card grid gap-4 p-6 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">When</h2>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="trigger">When this happens</label>
          <select className="input" id="trigger" value={trigger} onChange={(e) => choose(e.target.value as WorkflowTrigger)}>
            <optgroup label="Something changes">
              {EVENT_TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
            </optgroup>
            <optgroup label="Appointment time">
              {TIME_TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="timing">Send</label>
          <select className="input" id="timing" value={timing} onChange={(e) => setTiming(e.target.value as typeof timing)}>
            <option value="immediately">{timeBased ? "At that time" : "Straight away"}</option>
            {timeBased && <option value="before">Before</option>}
            <option value="after">After</option>
          </select>
        </div>
        {delayed && (
          <div>
            <label className="label" htmlFor="amount">How long</label>
            <div className="flex gap-2">
              <input className="input" id="amount" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              <select className="input" aria-label="Unit" value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {UNITS.map(([label, s]) => <option key={label} value={s}>{label}</option>)}
              </select>
            </div>
          </div>
        )}
        <fieldset className="sm:col-span-2">
          <legend className="label">For which services</legend>
          <p className="mb-2 text-xs text-zinc-600">Leave all unticked to use every service.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {services.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={serviceIds.includes(s.id)}
                  onChange={(e) => setServiceIds(e.target.checked ? [...serviceIds, s.id] : serviceIds.filter((x) => x !== s.id))}
                />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card grid gap-4 p-6">
        <h2 className="font-semibold">Then</h2>
        <div>
          <label className="label" htmlFor="channel">Action</label>
          <select className="input" id="channel" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
            <option value="email">Send an email</option>
            <option value="whatsapp">Send a WhatsApp message</option>
            <option value="webhook">Custom: send the booking to my own URL</option>
          </select>
        </div>

        {channel !== "webhook" && (
          <div>
            <p className="label">Insert a variable</p>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map(([key, hint]) => (
                <button key={key} type="button" title={hint} className="badge hover:bg-zinc-100" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(key)}>
                  {`{{${key}}}`}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-zinc-600">Click into a box first, then pick a variable.</p>
          </div>
        )}

        {channel === "email" && (
          <>
            <div>
              <label className="label" htmlFor="recipient">Send to</label>
              <select className="input" id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value as typeof recipient)}>
                <option value="client">The client</option>
                <option value="staff">The staff member booked</option>
              </select>
            </div>
            <div><label className="label" htmlFor="subject">Subject</label><input className="input" id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} {...track} /></div>
            <div><label className="label" htmlFor="body">Message</label><textarea className="input" id="body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} {...track} /></div>
            {recipient === "client" && (
              <label className="flex items-start gap-3 text-sm sm:col-span-2">
                <input type="checkbox" className="toggle mt-0.5" checked={attachInvite} onChange={(e) => setAttachInvite(e.target.checked)} />
                <span>
                  Attach a calendar invite
                  <span className="block text-zinc-600">
                    Gmail adds it to the client&apos;s Google Calendar automatically, and Outlook and Apple Mail show an &ldquo;Add to calendar&rdquo; button.
                    Used for booking, reschedule, cancel and payment-received emails; moving or cancelling updates the same entry.
                  </span>
                </span>
              </label>
            )}
          </>
        )}

        {channel === "whatsapp" && (
          <>
            <p className="text-sm text-zinc-600">WhatsApp only lets a business start a chat with a template Meta has approved. Use its exact name (see docs/whatsapp-templates.md).</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="templateName">Template name</label><input className="input" id="templateName" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="booking_reminder" /></div>
              <div><label className="label" htmlFor="language">Language code</label><input className="input" id="language" value={language} onChange={(e) => setLanguage(e.target.value)} /></div>
            </div>
            <div>
              <label className="label" htmlFor="params">Template values, one per line</label>
              <textarea className="input font-mono" id="params" rows={6} value={params} onChange={(e) => setParams(e.target.value)} {...track} placeholder={"{{client_name}}\n{{service}}"} />
              <p className="mt-1 text-xs text-zinc-600">Line 1 fills {"{{1}}"} in the template, line 2 fills {"{{2}}"}, and so on.</p>
            </div>
          </>
        )}

        {channel === "webhook" && (
          <div>
            <label className="label" htmlFor="url">Your URL</label>
            <input className="input" id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/booking" />
            <p className="mt-1 text-xs text-zinc-600">
              We POST the booking and client as JSON. If WORKFLOW_WEBHOOK_SECRET is set, each request carries an X-Signature header (HMAC-SHA256 of the body) so you can check it came from us.
            </p>
          </div>
        )}
      </section>

      <div><button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</button></div>
    </form>
  );
}
