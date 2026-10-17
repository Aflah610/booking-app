import { describe, expect, it } from "vitest";
import { BRAND, renderBrandedEmail, SAMPLE_VARS } from "@/features/workflows/email-design";

const make = (template: string, vars: Partial<typeof SAMPLE_VARS> = {}, logoUrl: string | null = "https://x.test/brand/logo.png") =>
  renderBrandedEmail({ template, vars: { ...SAMPLE_VARS, ...vars }, subject: "Hi", firmName: "Waky Booking", logoUrl });

describe("branded email", () => {
  it("puts the logo and firm name at the top, in the brand colours, with a plain-text copy", () => {
    const { html, text } = make("# Confirmed\n\nHi {{client_name}},");
    expect(html).toContain('<img src="https://x.test/brand/logo.png"');
    expect(html).toContain("Waky Booking");
    expect(html).toContain(BRAND.green);
    expect(html).toContain(BRAND.gold);
    expect(html).toContain(BRAND.cream);
    expect(text).toContain("CONFIRMED");
    expect(text).toContain("Hi Ravi Kumar,");
    expect(text).not.toContain("<");
  });

  it("leaves out the logo when there is none, and never lets a logo address be anything but http(s)", () => {
    expect(make("Hi", {}, null).html).not.toContain("<img");
    expect(make("Hi", {}, 'javascript:alert(1)"').html).not.toContain("<img");
  });

  it("turns a lone link into a button, a ~ link into a quiet one, and a link in a sentence into a link", () => {
    const { html, text } = make("[Join online]({{meeting_link}})\n\n[~Change it]({{manage_link}})\n\nSee [the site](https://example.org) now.");
    expect(html).toContain(`background:${BRAND.green};border-bottom:3px solid ${BRAND.gold}`);
    expect(html).toContain(`border:1.5px solid ${BRAND.green}`);
    expect(html).toMatch(/See <a href="https:\/\/example\.org"[^>]*>the site<\/a> now\./);
    expect(text).toContain("Join online: https://example.com/join/sample");
  });

  it("shows address variables as words, not as long addresses, and keeps the address in the plain text", () => {
    const { html, text } = make("Add it: {{add_to_google}}");
    expect(html).toContain('>Google Calendar</a>');
    expect(html).not.toContain(">https://calendar.google.com/<");
    expect(text).toContain("Add it: https://calendar.google.com/");
  });

  it("builds a details box from consecutive > lines, and bold text", () => {
    const { html } = make("> **When:** {{date}}\n> **With:** {{staff}}");
    expect(html.match(/border-left:4px solid/g)).toHaveLength(1);
    expect(html).toContain("<strong>When:</strong> Thursday, 22 October 2026<br><strong>With:</strong> Dr Meera");
  });

  it("drops a line, a button or a box line whose values are empty, instead of showing it blank", () => {
    const { html, text } = make("> **Where:** {{location}}\n> **When:** {{date}}\n\n[Join online]({{meeting_link}})", { location: "", meeting_link: "" });
    expect(html).not.toContain("Where:");
    expect(html).not.toContain("Join online");
    expect(html).toContain("When:");
    expect(text).not.toContain("Where");
  });

  it("escapes everything a client typed, so a name can't add markup, links or scripts", () => {
    const evil = '<script>alert(1)</script> [click](https://evil.test) **x** {{manage_link}}';
    const { html, text } = make("Hi {{client_name}}", { client_name: evil });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain('href="https://evil.test"');
    expect(html).not.toContain("<strong>x</strong>");
    expect(text).toContain(evil); // plain text keeps exactly what they typed
  });

  it("only makes links from web addresses", () => {
    const { html } = make("[Open]({{meeting_link}})\n\nA [bad](javascript:alert) link and [odd](not a link).", { meeting_link: "javascript:alert(1)" });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    expect(html).toContain("A bad link and odd.");
  });

  it("escapes the firm name and the footer note", () => {
    const { html } = renderBrandedEmail({ template: "Hi", vars: SAMPLE_VARS, subject: "x", firmName: "A & <B>", logoUrl: null, footer: "<i>note</i>" });
    expect(html).toContain("A &amp; &lt;B&gt;");
    expect(html).toContain("&lt;i&gt;note&lt;/i&gt;");
  });

  it("still looks right for a message written the old plain way", () => {
    const { html, text } = make("Hi {{client_name}},\n\nYour {{service}} is confirmed.\nJoin: {{meeting_link}}\nChange: {{manage_link}}");
    expect(html).toContain("Hi Ravi Kumar,");
    expect(html).toContain(">Join online</a>");
    expect(text).toContain("Join: https://example.com/join/sample");
  });
});
