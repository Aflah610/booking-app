"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page from the server every `seconds` while the tab is visible, so new messages appear without a reload. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
