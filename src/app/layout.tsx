import { connection } from "next/server";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Mindlap", template: "%s · Mindlap" }, description: "Mindlap: appointments, payments and reminders" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-request CSP nonces cannot be attached to HTML generated at build time.
  await connection();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
