import { DomainError } from "@/features/shared/errors";

export type QuestionType = "text" | "longtext" | "choice";
export type Question = { id: string; label: string; type: QuestionType; required: boolean; options?: string[] };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

/**
 * One question per line, written the way an admin would type it:
 *   Reason for visit*              required short answer
 *   Anything we should know (long) longer answer box
 *   Preferred language: English, Hindi, Tamil    pick one
 */
export function parseQuestions(text: string): Question[] {
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const raw of text.split("\n")) {
    let line = raw.trim();
    if (!line) continue;
    let required = false;
    if (line.endsWith("*")) {
      required = true;
      line = line.slice(0, -1).trim();
    }
    let type: QuestionType = "text";
    let options: string[] | undefined;
    const colon = line.indexOf(":");
    if (colon > 0 && line.slice(colon + 1).trim()) {
      options = [...new Set(line.slice(colon + 1).split(",").map((o) => o.trim()).filter(Boolean))];
      line = line.slice(0, colon).trim();
      if (options.length >= 2) type = "choice";
      else options = undefined;
    } else if (/\(long\)$/i.test(line)) {
      type = "longtext";
      line = line.replace(/\s*\(long\)$/i, "").trim();
    }
    if (!line) continue;
    if (line.length > 120) throw new DomainError("invalid", `Question "${line.slice(0, 30)}…" is too long (120 characters at most)`);
    let id = slug(line) || `q${out.length + 1}`;
    for (let n = 2; seen.has(id); n++) id = `${slug(line) || "q"}_${n}`;
    seen.add(id);
    out.push({ id, label: line, type, required, ...(options ? { options } : {}) });
  }
  if (out.length > 10) throw new DomainError("invalid", "A service can ask up to 10 extra questions");
  return out;
}

/** The reverse of `parseQuestions`, for showing the saved questions in the editor. */
export function formatQuestions(questions: Question[]): string {
  return questions
    .map((q) => `${q.label}${q.type === "longtext" ? " (long)" : ""}${q.type === "choice" ? `: ${q.options?.join(", ")}` : ""}${q.required ? "*" : ""}`)
    .join("\n");
}

/**
 * Checks a client's answers against the service's questions. Returns them keyed by the question's wording
 * at booking time, so the booking still reads correctly if the question is edited later.
 */
export function checkAnswers(questions: Question[], given: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions) {
    const value = typeof given[q.id] === "string" ? (given[q.id] as string).trim().slice(0, q.type === "longtext" ? 2000 : 500) : "";
    if (!value) {
      if (q.required) throw new DomainError("invalid", `Please answer "${q.label}"`, { reason: "answer_required", question: q.id });
      continue;
    }
    if (q.type === "choice" && !q.options?.includes(value)) {
      throw new DomainError("invalid", `"${value}" isn't one of the choices for "${q.label}"`, { reason: "answer_invalid", question: q.id });
    }
    out[q.label] = value;
  }
  return out;
}
