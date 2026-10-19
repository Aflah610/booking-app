"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Sends the signed-in person on to the app once the greeting has played. */
export function WelcomeRedirect({ to, afterMs }: { to: string; afterMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.replace(to), afterMs);
    return () => clearTimeout(timer);
  }, [router, to, afterMs]);
  return null;
}
