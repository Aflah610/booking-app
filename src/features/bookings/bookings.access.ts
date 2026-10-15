import type { BookingActor, BookingsService } from "./bookings.service";

/** Website calls act for one client, so they must show that booking's manage token. Staff keys needn't. */
export async function assertCanManage(bookings: BookingsService, actor: BookingActor, bookingId: string, token: unknown) {
  if (actor.mode === "client") await bookings.verifyManageToken(bookingId, typeof token === "string" ? token : null);
}
