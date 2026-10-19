import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { enabledLoginProviders, localLoginEnabled } from "@/lib/login-providers";
import { currentStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentStaff()) redirect("/");
  const { error } = await searchParams;
  const providers = enabledLoginProviders();
  const local = localLoginEnabled();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <span className="mb-8 grid h-10 w-10 place-items-center rounded-lg bg-black text-lg font-bold text-white">W</span>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Staff sign in</h1>
      <p className="mb-8 text-sm text-zinc-600">Use your work account.</p>
      <Notice
        error={
          error === "CredentialsSignin"
            ? "Wrong email or password, or that email isn't set up as staff yet."
            : error
              ? "That account isn't set up as staff yet. Ask an admin to add you."
              : undefined
        }
      />
      <div className="flex flex-col gap-3">
        {providers.map(({ id, name }) => (
          <form
            key={id}
            action={async () => {
              "use server";
              await signIn(id, { redirectTo: "/" });
            }}
          >
            <button className="btn w-full justify-center py-2.5" type="submit">
              Continue with {name}
            </button>
          </form>
        ))}
        <form
          className="flex flex-col gap-3"
          action={async (form: FormData) => {
            "use server";
            try {
              await signIn("password", {
                email: String(form.get("email") ?? ""),
                password: String(form.get("password") ?? ""),
                redirectTo: "/",
              });
            } catch (err) {
              // signIn redirects by throwing on success, so only Auth.js errors are failures.
              if (err instanceof AuthError) redirect(`/login?error=${err.type}`);
              throw err;
            }
          }}
        >
          {providers.length > 0 && <p className="text-center text-xs text-zinc-500">or with your email</p>}
          <input className="input" type="email" name="email" placeholder="Email" required autoComplete="email" />
          <input className="input" type="password" name="password" placeholder="Password" required autoComplete="current-password" />
          <button className="btn w-full justify-center py-2.5" type="submit">
            Sign in
          </button>
        </form>
        {local && (
          <form
            className="flex flex-col gap-3"
            action={async (form: FormData) => {
              "use server";
              try {
                await signIn("local", {
                  email: String(form.get("email") ?? ""),
                  password: String(form.get("password") ?? ""),
                  redirectTo: "/",
                });
              } catch (err) {
                // signIn redirects by throwing on success, so only Auth.js errors are failures.
                if (err instanceof AuthError) redirect(`/login?error=${err.type}`);
                throw err;
              }
            }}
          >
            <input className="input" type="email" name="email" placeholder="Email" required autoComplete="email" />
            <input className="input" type="password" name="password" placeholder="Password" required autoComplete="current-password" />
            <button className="btn w-full justify-center py-2.5" type="submit">
              Sign in
            </button>
            <p className="text-xs text-zinc-600">Local testing only. Not available on the live site.</p>
          </form>
        )}
      </div>
    </main>
  );
}
