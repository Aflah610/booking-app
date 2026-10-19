import Link from "next/link";

const TABS = [
  ["overview", "Overview", "/admin/reports"],
  ["therapists", "Therapist performance", "/admin/reports/therapists"],
] as const;

/** The two Reports screens, side by side. */
export function ReportsNav({ active }: { active: (typeof TABS)[number][0] }) {
  return (
    <nav className="tabs" aria-label="Reports">
      {TABS.map(([key, label, href]) => (
        <Link key={key} href={href} className={`tab ${key === active ? "tab-active" : ""}`}>{label}</Link>
      ))}
    </nav>
  );
}
