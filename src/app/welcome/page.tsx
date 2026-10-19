import { LoginSmile } from "@/components/LoginSmile";
import { WelcomeRedirect } from "@/components/WelcomeRedirect";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

// Shown for a moment right after signing in, then the app opens. Skipped by anyone who goes straight to a page.
export default async function WelcomePage() {
  const me = await requireStaff();
  const first = me.name.trim().split(/\s+/)[0];
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f8f4f2] px-4 text-center">
      <LoginSmile />
      <h1 className="welcome-rise mt-6 text-[28px] font-semibold tracking-tight text-[#1c1c1c]">Welcome to Waky Labs</h1>
      <p className="welcome-rise mt-1.5 text-[15px] text-[#5f6663]" style={{ animationDelay: "0.25s" }}>
        Good to see you, {first}.
      </p>
      <div className="welcome-bar mt-8" aria-hidden="true">
        <span />
      </div>
      <WelcomeRedirect to="/" afterMs={2600} />
    </main>
  );
}
