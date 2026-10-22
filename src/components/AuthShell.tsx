import Image from "next/image";
import { LoginSmile } from "./LoginSmile";

/** The cream page with the logo and the corner smiley that the sign-in screens share. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#f8f4f2] px-4">
      <div className="absolute right-5 top-5 sm:right-8 sm:top-7">
        <LoginSmile />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Image src="/brand/mindlap-logo.png" alt="Mindlap" width={630} height={173} unoptimized priority className="h-10 w-auto" />
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight text-[#1c1c1c]">{title}</h1>
        <p className="mb-8 mt-1.5 text-[15px] text-[#5f6663]">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}
