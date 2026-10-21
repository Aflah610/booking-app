import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { DomainError } from "@/features/shared/errors";

function message(err: unknown): string {
  if (err instanceof DomainError || err instanceof RangeError) return err.message;
  if (err instanceof ZodError) return err.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ");
  throw err;
}

/**
 * Runs `fn`, then redirects with ?ok= or ?error=. On success `fn` may return a different path to land on
 * (e.g. the new booking's page).
 */
export async function act(path: string, ok: string, fn: () => Promise<unknown>): Promise<never> {
  let error: string | undefined;
  let target = path;
  try {
    const next = await fn();
    if (typeof next === "string" && next.startsWith("/")) target = next;
  } catch (err) {
    error = message(err);
  }
  // `path` may carry a query (e.g. ?tab=credits) so the person lands back where they were; only the page itself is revalidated.
  revalidatePath(path.split("?")[0]);
  const [base, query] = target.split("?");
  const params = new URLSearchParams(query);
  params.set(error ? "error" : "ok", error ?? ok);
  redirect(`${base}?${params}`);
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const optional = (f: FormData, k: string) => str(f, k) || null;
export const optionalNumber = (f: FormData, k: string) => (str(f, k) ? Number(str(f, k)) : null);

/** Answers to a service's extra questions: fields named q_<question id>. */
export function answersFromForm(f: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("q_") && typeof v === "string") out[k.slice(2)] = v;
  return out;
}
