/** One connected WhatsApp number. Ids are Meta's: the WhatsApp Business account and the phone number in it. */
export type WhatsAppSlot = { wabaId: string | null; phoneNumberId: string | null; connectedAt: Date | null };

/**
 * The firm's two numbers: `leads` is the one clients chat with (each new chat becomes a lead); `messages` is the one the
 * booking app sends reminders and confirmations from, whose replies the CCD answers on the phone.
 */
export const WHATSAPP_PURPOSES = ["leads", "messages"] as const;
export type WhatsAppPurpose = (typeof WHATSAPP_PURPOSES)[number];
export type WhatsAppConnection = Record<WhatsAppPurpose, WhatsAppSlot>;

/** What the embedded sign-up window hands back once someone has linked their WhatsApp Business app. */
export type SignupResult = { code: string; wabaId: string; phoneNumberId: string };

/**
 * The two Meta calls the connection needs. Injected so tests run without Meta: swap the code for a business token, and
 * subscribe our app to the account so its messages reach the webhook.
 */
export type MetaGraph = {
  exchangeCode(code: string): Promise<string>;
  subscribeApp(wabaId: string, token: string): Promise<void>;
};
