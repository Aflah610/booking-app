import { NextResponse } from "next/server";
import { app } from "@/features/container";
import { missingEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Health check for AppSail / load balancers. No API key needed. Lists missing setting names
 * (never values) so a misconfigured deploy is easy to diagnose.
 */
export async function GET() {
  const missing = missingEnv();
  if (missing.length) {
    return NextResponse.json({ status: "misconfigured", missingSettings: missing }, { status: 503 });
  }
  if (await app().health.databaseReachable()) return NextResponse.json({ status: "ok" });
  return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503 });
}
