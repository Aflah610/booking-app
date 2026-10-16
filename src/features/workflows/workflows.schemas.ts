import { z } from "zod";
import { CHANNELS, TIMINGS, TRIGGERS, type WorkflowDTO } from "./workflows.dto";
import { unknownPlaceholders } from "./templates";

const text = (max: number) =>
  z.string().trim().min(1, "Required").max(max).superRefine((v, ctx) => {
    const bad = unknownPlaceholders(v);
    if (bad.length) ctx.addIssue({ code: "custom", message: `Unknown variable ${bad.map((b) => `{{${b}}}`).join(", ")}` });
  });

const email = z.object({
  channel: z.literal("email"),
  recipient: z.enum(["client", "staff"]).default("client"),
  subject: text(200),
  body: text(5000),
  attachInvite: z.boolean().default(false),
});
const whatsapp = z.object({
  channel: z.literal("whatsapp"),
  // Meta template names are lower-case letters, digits and underscores.
  templateName: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, "Use the approved template name, e.g. booking_reminder"),
  language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, "Use a code like en or en_US").default("en"),
  params: z.array(text(500)).max(10).default([]),
});
const webhook = z.object({
  channel: z.literal("webhook"),
  url: z.string().trim().url().max(2000).refine((u) => {
    const { protocol, hostname } = new URL(u);
    // Plain http is only for trying things out against a local server.
    return protocol === "https:" || (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1"));
  }, "Use an https:// address"),
});

export const workflowInput = z
  .object({
    name: z.string().trim().min(1, "Give the workflow a name").max(100),
    active: z.boolean().default(true),
    trigger: z.enum(TRIGGERS),
    timing: z.enum(TIMINGS).default("immediately"),
    offsetMin: z.number().int().min(0).max(60 * 24 * 90).default(0),
    serviceIds: z.array(z.string().uuid()).default([]),
    action: z.discriminatedUnion("channel", [email, whatsapp, webhook]),
  })
  .superRefine((w, ctx) => {
    const timeBased = w.trigger === "appointment_start" || w.trigger === "appointment_end";
    if (w.timing === "before" && !timeBased) {
      ctx.addIssue({ code: "custom", path: ["timing"], message: "“Before” only works for “Appointment starts” and “Appointment ends”" });
    }
    if (w.timing !== "immediately" && w.offsetMin === 0) {
      ctx.addIssue({ code: "custom", path: ["offsetMin"], message: "Say how long before or after" });
    }
    if (w.timing === "immediately" && w.offsetMin !== 0) {
      ctx.addIssue({ code: "custom", path: ["offsetMin"], message: "Choose before or after to use a delay" });
    }
  });

export type WorkflowInput = z.input<typeof workflowInput>;
export type WorkflowData = z.output<typeof workflowInput>;
export { CHANNELS };

/** A saved workflow back in the form's shape, for the editor and for switching on or off. */
export const toWorkflowInput = (w: WorkflowDTO): WorkflowInput => ({
  name: w.name,
  active: w.active,
  trigger: w.trigger,
  timing: w.timing,
  offsetMin: w.offsetMin,
  serviceIds: w.serviceIds,
  action: { channel: w.channel, ...w.config } as WorkflowInput["action"],
});
