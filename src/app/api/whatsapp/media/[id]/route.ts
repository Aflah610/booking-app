import { app } from "@/features/container";
import { isDomainError } from "@/features/shared/errors";
import { currentStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

/** A photo, voice note or file from a chat, fetched from Meta for someone allowed to open that chat. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentStaff();
  if (!me) return new Response("Sign in first", { status: 401 });
  try {
    const { bytes, mimeType } = await app().whatsappChat.media(me, (await params).id);
    const showable = /^(image|audio|video)\//.test(mimeType) && mimeType !== "image/svg+xml";
    return new Response(bytes, {
      headers: { "Content-Type": mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": showable ? "inline" : "attachment" },
    });
  } catch (err) {
    if (isDomainError(err)) return new Response("Not found", { status: 404 });
    throw err;
  }
}
