import Link from "next/link";
import { redirect } from "next/navigation";
import { app } from "@/features/container";
import { AuthShell } from "@/components/AuthShell";
import { Notice } from "@/components/Notice";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  if (!token) {
    return (
      <AuthShell title="Link not valid" subtitle="This reset link is missing or incomplete.">
        <Link className="login-primary block text-center" href="/forgot-password">
          Get a new link
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 8 characters.">
      <Notice error={error} />
      <form
        className="flex flex-col gap-3"
        action={async (form: FormData) => {
          "use server";
          const back = (message: string) => redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${encodeURIComponent(message)}`);
          const password = String(form.get("password") ?? "");
          if (password !== String(form.get("confirm") ?? "")) back("The two passwords don't match.");
          try {
            await app().staff.resetPassword(token, password);
          } catch (err) {
            if (err instanceof Error && err.name === "DomainError") back(err.message);
            throw err;
          }
          redirect("/login?reset=1");
        }}
      >
        <input className="login-field" type="password" name="password" placeholder="New password" required minLength={8} autoComplete="new-password" />
        <input className="login-field" type="password" name="confirm" placeholder="Repeat new password" required minLength={8} autoComplete="new-password" />
        <button className="login-primary mt-1" type="submit">
          Save password
        </button>
      </form>
    </AuthShell>
  );
}
