import { ZodError } from "zod";
import { collectionCommandInput } from "@/features/bookings/bookings.schemas";
import { NextRequest, NextResponse } from "next/server";
import { app } from "@/features/container";
import { isDomainError } from "@/features/shared/errors";
import { callerKey, rateLimit } from "@/lib/rate-limit";
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (!rateLimit(`collection:${callerKey(req.headers)}`, 20, 60000).ok) return reply({ error: "Please wait a moment before trying again." }, 429);
  try {
    const { id } = await ctx.params;
    const body = collectionCommandInput.parse(await req.json().catch(() => null));
    const b = await app().bookings.paymentRequest(id, body.token);
    if (b.paymentStatus === "paid") return reply({ booked: true, success: true });
    const response = await fetch(`https://mindlap-booking-api.nasheel.workers.dev/api/payment/ccd-${body.op}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_id: id, collection_token: body.token, ...(body.op === "verify" ? { razorpay_order_id: body.razorpay_order_id, razorpay_payment_id: body.razorpay_payment_id, razorpay_signature: body.razorpay_signature } : {}) }), cache: "no-store", signal: AbortSignal.timeout(30000) });
    return reply(await response.json(), response.status);
  } catch (error) {
    if (error instanceof ZodError) return reply({ error: "Invalid payment request" }, 400);
    if (isDomainError(error)) return reply({ error: "This payment link is unavailable. Ask your coordinator for a new link." }, 400);
    return reply({ error: "Payment is unavailable right now. Please try again shortly." }, 503);
  }
}
