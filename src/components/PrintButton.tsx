"use client";

/** Opens the browser's print box, where "Save as PDF" turns the page into a report file. */
export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn-ghost" onClick={() => window.print()}>
      {label}
    </button>
  );
}
