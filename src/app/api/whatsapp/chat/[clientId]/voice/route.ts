import { app } from "@/features/container";
import { isDomainError } from "@/features/shared/errors";
import { currentStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

/** A voice note recorded on the chat page. The page sends the MP3 as form data under "audio". */
export async function POST(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const me = await currentStaff();
  if (!me) return Response.json({ error: "Sign in first" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob)) return Response.json({ error: "No recording was attached" }, { status: 400 });
  try {
    await app().whatsappChat.replyVoice(me, (await params).clientId, { bytes: await audio.arrayBuffer(), mimeType: audio.type });
    return Response.json({ ok: true });
  } catch (err) {
    if (isDomainError(err)) return Response.json({ error: err.message }, { status: err.code === "not_found" ? 404 : err.code === "forbidden" ? 403 : 400 });
    throw err;
  }
}
