import type { TemplateVars } from "./templates";

/** The brand, taken from the logo: forest green, gold and a soft cream. */
export const BRAND = { green: "#253d34", gold: "#e9be65", cream: "#f8f4f2", ink: "#1c1c1c", muted: "#5f6663", line: "#e6e0db" } as const;

const FONT = "Helvetica,Arial,sans-serif";

/** Variables that hold a web address, with the words to show for them instead of the long address. */
const URL_LABELS: Partial<Record<keyof TemplateVars, string>> = {
  meeting_link: "Join online",
  manage_link: "Change or cancel your booking",
  add_to_google: "Google Calendar",
  add_to_outlook: "Outlook",
  add_to_calendar: "Download for Apple Calendar",
  resume_link: "Complete your payment",
};

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
/** Only ordinary web addresses become links, so a value can never turn into `javascript:` or anything else. */
const isWebUrl = (s: string) => /^https?:\/\/[^\s"'<>]+$/i.test(s);

type Inline = { html: string; text: string; vars: number; filled: number };

// The pieces of a line, found in the template before any value is put in, so a client's name can never be read as markup.
const TOKEN = /\[([^\]\n]+)\]\(([^)\n]+)\)|\*\*([^*\n]+)\*\*|\{\{\s*([a-z_]+)\s*\}\}/g;
const VAR_ONLY = /^\{\{\s*([a-z_]+)\s*\}\}$/;

function inline(line: string, vars: TemplateVars): Inline {
  const out: Inline = { html: "", text: "", vars: 0, filled: 0 };
  const value = (name: string) => {
    const v = ((vars as Record<string, string | undefined>)[name] ?? "").trim();
    out.vars++;
    if (v) out.filled++;
    return v;
  };
  // Plain words (with variables filled in) for labels and bold text.
  const words = (s: string) => s.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, n: string) => value(n));
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const before = line.slice(last, m.index);
    out.html += escapeHtml(before);
    out.text += before;
    last = m.index! + m[0].length;
    if (m[4] !== undefined) {
      const v = value(m[4]);
      const label = URL_LABELS[m[4] as keyof TemplateVars];
      if (label && isWebUrl(v)) {
        out.html += `<a href="${escapeHtml(v)}" style="color:${BRAND.green};text-decoration:underline;">${label}</a>`;
        out.text += v;
      } else {
        out.html += escapeHtml(v);
        out.text += v;
      }
    } else if (m[3] !== undefined) {
      const w = words(m[3]);
      out.html += `<strong>${escapeHtml(w)}</strong>`;
      out.text += w;
    } else {
      const label = words(m[1]);
      const hrefVar = VAR_ONLY.exec(m[2].trim());
      const href = hrefVar ? value(hrefVar[1]) : m[2].trim();
      if (isWebUrl(href)) {
        out.html += `<a href="${escapeHtml(href)}" style="color:${BRAND.green};text-decoration:underline;">${escapeHtml(label)}</a>`;
        out.text += `${label} (${href})`;
      } else {
        out.html += escapeHtml(label);
        out.text += label;
      }
    }
  }
  const rest = line.slice(last);
  out.html += escapeHtml(rest);
  out.text += rest;
  return out;
}

/** A line whose variables are all empty ("Where: {{location}}" for an online session) is left out rather than shown blank. */
const empty = (i: Inline) => i.vars > 0 && i.filled === 0;

function button(label: string, href: string, secondary: boolean): string {
  const a = `font:600 16px/1 ${FONT};text-decoration:none;display:inline-block;padding:13px 24px;`;
  return secondary
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="border:1.5px solid ${BRAND.green};border-radius:8px;"><a href="${escapeHtml(href)}" style="${a}color:${BRAND.green};">${escapeHtml(label)}</a></td></tr></table>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="background:${BRAND.green};border-bottom:3px solid ${BRAND.gold};border-radius:8px;"><a href="${escapeHtml(href)}" style="${a}color:${BRAND.cream};">${escapeHtml(label)}</a></td></tr></table>`;
}

type Block = { html: string; text: string };

/**
 * Turns a message written in plain text into the branded email: HTML with inline styles and tables (what mail programs
 * handle), plus a plain-text copy. The message may use a few markers:
 *   `# Heading`            a headline
 *   `> line`               a line in the details box (several in a row make one box)
 *   `**bold**`             bold text
 *   `[Label](address)`     a link; alone on its own line it becomes a button, and `[~Label](…)` a quieter button
 * Values from variables are escaped, and only http(s) addresses become links.
 */
export function renderBrandedEmail(opts: { template: string; vars: TemplateVars; subject: string; firmName: string; logoUrl: string | null; footer?: string | null }): { html: string; text: string } {
  const { vars } = opts;
  const blocks: Block[] = [];
  let para: Inline[] = [];
  let box: Inline[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ html: `<p style="margin:0 0 16px;">${para.map((p) => p.html).join("<br>")}</p>`, text: para.map((p) => p.text).join("\n") });
      para = [];
    }
    if (box.length) {
      blocks.push({
        html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="background:${BRAND.cream};border-left:4px solid ${BRAND.green};border-radius:6px;padding:14px 18px;">${box.map((p) => p.html).join("<br>")}</td></tr></table>`,
        text: box.map((p) => p.text).join("\n"),
      });
      box = [];
    }
  };

  for (const raw of opts.template.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^#\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    const btn = /^\s*\[(~?)([^\]\n]+)\]\(([^)\n]+)\)\s*$/.exec(line);
    if (heading) {
      flush();
      const h = inline(heading[1], vars);
      if (!empty(h)) blocks.push({ html: `<h1 style="margin:0 0 16px;font:700 24px/1.25 ${FONT};color:${BRAND.green};">${h.html}</h1>`, text: h.text.toUpperCase() });
    } else if (quote) {
      if (para.length) flush();
      const q = inline(quote[1], vars);
      if (!empty(q)) box.push(q);
    } else if (btn) {
      flush();
      const label = inline(btn[2], vars);
      const hv = VAR_ONLY.exec(btn[3].trim());
      const href = hv ? ((vars as Record<string, string | undefined>)[hv[1]] ?? "").trim() : btn[3].trim();
      if (isWebUrl(href) && label.text.trim()) blocks.push({ html: button(label.text, href, btn[1] === "~"), text: `${label.text}: ${href}` });
    } else {
      if (box.length) flush();
      const p = inline(line, vars);
      if (!empty(p)) para.push(p);
    }
  }
  flush();

  const logo = opts.logoUrl && isWebUrl(opts.logoUrl)
    ? `<td style="vertical-align:middle;"><img src="${escapeHtml(opts.logoUrl)}" width="44" height="44" alt="" style="display:block;border:0;border-radius:8px;"></td>`
    : "";
  const footerNote = opts.footer ? `<br>${escapeHtml(opts.footer)}` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.cream};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BRAND.line};border-radius:12px;">
<tr><td style="background:${BRAND.cream};padding:18px 28px;border-bottom:3px solid ${BRAND.gold};border-radius:12px 12px 0 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo}<td style="vertical-align:middle;${logo ? "padding-left:12px;" : ""}font:600 18px/1.2 ${FONT};color:${BRAND.green};">${escapeHtml(opts.firmName)}</td></tr></table></td></tr>
<tr><td style="padding:28px;font:16px/1.55 ${FONT};color:${BRAND.ink};">${blocks.map((b) => b.html).join("\n")}</td></tr>
<tr><td style="background:${BRAND.cream};padding:16px 28px;font:12px/1.5 ${FONT};color:${BRAND.muted};border-radius:0 0 12px 12px;">${escapeHtml(opts.firmName)}<br>You received this email because of a booking made with us.${footerNote}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${opts.firmName}\n\n${blocks.map((b) => b.text).join("\n\n")}\n\n--\n${opts.firmName}${opts.footer ? `\n${opts.footer}` : ""}`;
  return { html, text };
}

/** Made-up values for the preview page and the design test email. */
export const SAMPLE_VARS: TemplateVars = {
  client_name: "Ravi Kumar",
  client_phone: "+91 98765 43210",
  service: "CBT with Junior psychologist",
  staff: "Dr Meera",
  date: "Thursday, 22 October 2026",
  time: "9:00 am",
  booking_id: "WKBA-7800006",
  location: "",
  meeting_link: "https://example.com/join/sample",
  manage_link: "https://example.com/manage/sample",
  add_to_google: "https://calendar.google.com/",
  add_to_outlook: "https://outlook.live.com/",
  add_to_calendar: "https://example.com/calendar.ics",
  amount: "₹1,500",
  resume_link: "https://example.com/resume/sample",
  firm_name: "Waky Booking",
  cancel_reason: "",
};
