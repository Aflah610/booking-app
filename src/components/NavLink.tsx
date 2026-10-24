"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export function NavLink({ href, icon, children, exact, count }: { href: string; icon: IconName; children: React.ReactNode; exact?: boolean; count?: number }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={`nav-link ${active ? "nav-link-active" : ""}`} aria-current={active ? "page" : undefined}>
      <Icon name={icon} />
      <span>{children}</span>
      {count ? <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-5 text-white" aria-label={`${count} new`}>{count > 99 ? "99+" : count}</span> : null}
    </Link>
  );
}
