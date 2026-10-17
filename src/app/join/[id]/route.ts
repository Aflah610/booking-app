import { app } from "@/features/container";
import { isOnlineSession } from "@/features/bookings/meeting";

export const dynamic = "force-dynamic";

const page = (title: string, body: string, refresh = false) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">${
      refresh ? '<meta http-equiv="refresh" content="15">' : ""
    }<title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:20vh auto;padding:0 1.5rem;color:#111}p{color:#555;line-height:1.5}</style></head><body><h1 style="font-size:1.25rem">${title}</h1><p>${body}</p></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

/**
 * The link clients get for an online session. It stays the same for the life of the booking and sends them on to the video call,
 * so a message can go out before Google has made the Meet link, and moving the booking never breaks it. Needs the same signed
 * token as the manage page.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bookings, settings } = app();
  try {
    await bookings.verifyManageToken(id, new URL(req.url).searchParams.get("t"));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const b = await bookings.get(id);
  if (b.status === "cancelled") return page("This session was cancelled", "There is nothing to join. Please contact the firm if you think this is a mistake.");
  if (b.meetingUrl) return Response.redirect(b.meetingUrl, 302);
  const firm = await settings.get();
  if (isOnlineSession(b, firm.meetEnabled)) {
    return page("Your link is being prepared", "Your online session link will be ready in a minute. This page checks again by itself, or try again shortly.", true);
  }
  return page("No online link for this booking", "This session is not online. Please check your booking details.");
}
