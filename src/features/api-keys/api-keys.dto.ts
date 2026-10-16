/** website: what the firm's website may call. staff: full staff-level API access. */
export const API_SCOPES = ["website", "staff"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export type ApiKeyDTO = { id: string; name: string; keyPrefix: string; scopes: string[] };
