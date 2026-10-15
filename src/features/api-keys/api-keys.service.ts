import { createHash, randomBytes } from "node:crypto";
import type { ApiKeyDTO, ApiScope } from "./api-keys.dto";
import type { ApiKeysRepository } from "./api-keys.repository";

const KEY_PREFIX = "bk_";

export const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

export function createApiKeysService({ apiKeysRepo }: { apiKeysRepo: ApiKeysRepository }) {
  return {
    /** Returns the raw key once; only its SHA-256 hash is stored. */
    async create(input: { name: string; scopes: ApiScope[] }): Promise<{ key: string; record: ApiKeyDTO }> {
      const key = KEY_PREFIX + randomBytes(32).toString("base64url");
      const record = await apiKeysRepo.insert({
        name: input.name,
        scopes: input.scopes,
        keyPrefix: key.slice(0, 10),
        keyHash: hashKey(key),
      });
      return { key, record };
    },

    /** The key's record if `raw` is a live key, otherwise null. */
    async verify(raw: string | null | undefined): Promise<ApiKeyDTO | null> {
      if (!raw || !raw.startsWith(KEY_PREFIX)) return null;
      // A 256-bit random key hashed with SHA-256 can be looked up directly; no timing-safe compare needed.
      const record = await apiKeysRepo.findLiveByHash(hashKey(raw));
      if (record) apiKeysRepo.touch(record.id).catch(() => {});
      return record;
    },

    revoke: (id: string) => apiKeysRepo.revoke(id),
  };
}

export type ApiKeysService = ReturnType<typeof createApiKeysService>;
