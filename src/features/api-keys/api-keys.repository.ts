import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { apiKey } from "@/db/schema";
import type { ApiKeyDTO } from "./api-keys.dto";

const columns = { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.keyPrefix, scopes: apiKey.scopes };

export function createApiKeysRepository(db: Db) {
  return {
    async insert(data: { name: string; scopes: string[]; keyPrefix: string; keyHash: string }): Promise<ApiKeyDTO> {
      const [row] = await db.insert(apiKey).values(data).returning(columns);
      return row;
    },

    async findLiveByHash(keyHash: string): Promise<ApiKeyDTO | null> {
      const [row] = await db
        .select(columns)
        .from(apiKey)
        .where(and(eq(apiKey.keyHash, keyHash), isNull(apiKey.revokedAt)))
        .limit(1);
      return row ?? null;
    },

    async touch(id: string) {
      await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, id));
    },

    async revoke(id: string) {
      await db.update(apiKey).set({ revokedAt: new Date() }).where(eq(apiKey.id, id));
    },
  };
}

export type ApiKeysRepository = ReturnType<typeof createApiKeysRepository>;
