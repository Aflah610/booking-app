import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { currentStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentStaff()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold">Staff sign in</h1>
      <p className="mb-6 text-sm text-zinc-500">Use your work Google account.</p>
      <Notice error={error ? "That account isn't set up as staff yet. Ask an admin to add you." : undefined} />
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button className="btn w-full justify-center" type="submit">Sign in with Google</button>
      </form>
    </main>
  );
}
