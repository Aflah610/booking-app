import { AuthError } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { enabledLoginProviders, localLoginEnabled } from "@/lib/login-providers";
import { currentStaff } from "@/lib/session";
import { LoginSmile } from "@/components/LoginSmile";
import { Notice } from "@/components/Notice";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string }> }) {
  if (await currentStaff()) redirect("/");
  const { error, reset } = await searchParams;
  const providers = enabledLoginProviders();
  const local = localLoginEnabled();
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#f8f4f2] px-4">
      <div className="absolute right-5 top-5 sm:right-8 sm:top-7">
        <LoginSmile />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#253d34] text-lg font-semibold text-[#e9be65]">W</span>
          <span className="text-sm font-medium tracking-tight text-[#5f6663]">Waky Booking</span>
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[#1c1c1c]">Welcome back</h1>
        <p className="mb-8 mt-1.5 text-[15px] text-[#5f6663]">Sign in to your workspace.</p>
        <Notice
          ok={reset ? "Your password is changed. Sign in with the new one." : undefined}
          error={
            error === "CredentialsSignin"
              ? "That email and password don't match. Please try again."
              : error
                ? "That account isn't set up as staff yet. Ask an admin to add you."
                : undefined
          }
        />
        <form
          className="flex flex-col gap-3"
          action={async (form: FormData) => {
            "use server";
            try {
              await signIn("password", {
                email: String(form.get("email") ?? ""),
                password: String(form.get("password") ?? ""),
                redirectTo: "/welcome",
              });
            } catch (err) {
              // signIn redirects by throwing on success, so only Auth.js errors are failures.
              if (err instanceof AuthError) redirect(`/login?error=${err.type}`);
              throw err;
            }
          }}
        >
          <input className="login-field" type="email" name="email" placeholder="Email" required autoComplete="email" />
          <input className="login-field" type="password" name="password" placeholder="Password" required autoComplete="current-password" />
          <button className="login-primary mt-1" type="submit">
            Sign in
          </button>
          <Link href="/forgot-password" className="text-center text-sm text-[#5f6663] underline-offset-4 hover:text-[#253d34] hover:underline">
            Forgot password?
          </Link>
        </form>
        {providers.length > 0 && (
          <div className="mt-6 flex flex-col gap-3">
            <p className="text-center text-xs uppercase tracking-widest text-[#9aa19d]">or</p>
            {providers.map(({ id, name }) => (
              <form
                key={id}
                action={async () => {
                  "use server";
                  await signIn(id, { redirectTo: "/welcome" });
                }}
              >
                <button className="login-secondary" type="submit">
                  Continue with {name}
                </button>
              </form>
            ))}
          </div>
        )}
        {local && (
          <form
            className="mt-6 flex flex-col gap-3"
            action={async (form: FormData) => {
              "use server";
              try {
                await signIn("local", {
                  email: String(form.get("email") ?? ""),
                  password: String(form.get("password") ?? ""),
                  redirectTo: "/welcome",
                });
              } catch (err) {
                if (err instanceof AuthError) redirect(`/login?error=${err.type}`);
                throw err;
              }
            }}
          >
            <input className="login-field" type="email" name="email" placeholder="Local test email" required autoComplete="email" />
            <input className="login-field" type="password" name="password" placeholder="Local test password" required autoComplete="current-password" />
            <button className="login-secondary" type="submit">Local sign in</button>
            <p className="text-xs text-[#5f6663]">Local testing only. Not available on the live site.</p>
          </form>
        )}
      </div>
    </main>
  );
}
