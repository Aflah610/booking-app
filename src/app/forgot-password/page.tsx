import Link from "next/link";
import { redirect } from "next/navigation";
import { app } from "@/features/container";
import { AuthShell } from "@/components/AuthShell";
import { Notice } from "@/components/Notice";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send you a link to choose a new one.">
      <Notice ok={sent ? "If that email belongs to a staff account, a reset link is on its way. It works for one hour." : undefined} />
      <form
        className="flex flex-col gap-3"
        action={async (form: FormData) => {
          "use server";
          await app().staff.requestPasswordReset(String(form.get("email") ?? ""));
          // Same answer whether or not the address is known.
          redirect("/forgot-password?sent=1");
        }}
      >
        <input className="login-field" type="email" name="email" placeholder="Email" required autoComplete="email" />
        <button className="login-primary mt-1" type="submit">
          Send reset link
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-[#5f6663] underline-offset-4 hover:text-[#253d34] hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
