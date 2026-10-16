/**
 * One CSV cell. Values that start with = + - or @ are made harmless, because Excel and Sheets would
 * run them as formulas, and clients type some of these fields on a public form.
 */
export function csvCell(value: unknown): string {
  let s = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  // A "+91 98765 43210" or "-5" is just a number; anything else starting with + or - could be a formula.
  const plainNumber = /^[+-][\d\s().-]+$/.test(s);
  if (!plainNumber && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",");

/** With a byte-order mark so Excel reads names in other scripts correctly. */
export const toCsv = (header: string[], rows: unknown[][]) => "﻿" + [csvRow(header), ...rows.map(csvRow)].join("\r\n") + "\r\n";
