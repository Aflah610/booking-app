/** website: what the firm's website may call. otp: send and verify WhatsApp codes only. staff: full staff-level API access. */
export const API_SCOPES = ["website", "otp", "staff"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export type ApiKeyDTO = { id: string; name: string; keyPrefix: string; scopes: string[] };

/** What the settings screen shows. Never includes the key or its hash. */
export type ApiKeyListItemDTO = ApiKeyDTO & { createdAt: Date; lastUsedAt: Date | null };
