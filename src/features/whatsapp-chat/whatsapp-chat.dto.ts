/** WhatsApp lets a business reply freely only this long after the person's last message; after that it needs a template. */
export const REPLY_WINDOW_HOURS = 24;

export type ChatDirection = "in" | "out";
export type ChatKind = "text" | "image" | "audio" | "video" | "document" | "other";
export type ChatStatus = "received" | "sent" | "delivered" | "read" | "failed";

export type ChatMessageDTO = {
  id: string;
  clientId: string;
  direction: ChatDirection;
  kind: ChatKind;
  body: string | null;
  mediaId: string | null;
  mimeType: string | null;
  status: ChatStatus;
  error: string | null;
  staffName: string | null;
  at: Date;
};

export type ChatConversation = {
  clientId: string;
  name: string;
  phoneE164: string;
  lastAt: Date;
  lastText: string | null;
  lastDirection: ChatDirection;
  unread: number;
};

/** The calls to Meta. Injected so tests run without it. */
export type ChatGraph = {
  sendText(from: string, to: string, text: string): Promise<string | undefined>;
  download(mediaId: string): Promise<{ bytes: ArrayBuffer; mimeType: string }>;
};
