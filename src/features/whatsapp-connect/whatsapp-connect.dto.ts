/** The WhatsApp number new leads arrive on. Ids are Meta's: the WhatsApp Business account and the phone number in it. */
export type WhatsAppConnection = { wabaId: string | null; phoneNumberId: string | null; connectedAt: Date | null };

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
