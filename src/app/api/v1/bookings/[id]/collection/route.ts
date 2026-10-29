import { collectionTokenInput } from "@/features/bookings/bookings.schemas";
import { app } from "@/features/container";
import { apiRoute, jsonBody } from "@/lib/api";
import { bookingReference } from "@/features/bookings/bookings.dto";
export const POST = apiRoute("website", async (req, { params }) => {
  const input = collectionTokenInput.parse(await jsonBody(req));
  const b = await app().bookings.paymentRequest(params.id, input.token);
  const s = await app().settings.get();
  // Server-to-server only: the Worker needs the phone to report the captured payment against this client.
  return { id: b.id, reference: bookingReference(s.bookingPrefix, b.number), amountPaise: b.amountPaise, status: b.paymentStatus, phone: b.clientPhone, name: b.clientName, serviceName: b.serviceName };
});
