import { NextResponse } from "next/server";
import { app } from "@/features/container";

export const dynamic = "force-dynamic";

/** Health check for AppSail / load balancers. No API key needed; reveals nothing. */
export async function GET() {
  if (await app().health.databaseReachable()) return NextResponse.json({ status: "ok" });
  return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503 });
}
