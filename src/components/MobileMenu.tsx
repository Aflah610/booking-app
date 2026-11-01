"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** The phone menu: a plain <details> that closes itself once a page is picked. */
export function MobileMenu({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [path]);
  return (
    <details ref={ref} className="relative ml-auto md:hidden">
      {summary}
      {children}
    </details>
  );
}
