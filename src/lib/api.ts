import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { app } from "@/features/container";
import type { ApiKeyDTO, ApiScope } from "@/features/api-keys/api-keys.dto";
import { DomainError } from "@/features/shared/errors";

type Handler = (req: NextRequest, ctx: { key: ApiKeyDTO }) => Promise<unknown>;

const STATUS: Record<DomainError["code"], number> = { invalid: 400, forbidden: 403, not_found: 404, conflict: 409 };

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

function readKey(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return req.headers.get("x-api-key");
}

/**
 * Wraps a /api/v1 handler: checks the API key and scope, returns `{ data }` on success
 * and `{ error }` with the right status otherwise. A "staff" key may call website endpoints too.
 */
export function apiRoute(scope: ApiScope, handler: Handler) {
  return async (req: NextRequest) => {
    try {
      const key = await app().apiKeys.verify(readKey(req));
      if (!key) return apiError(401, "unauthorized", "Missing or invalid API key");
      if (!key.scopes.includes(scope) && !key.scopes.includes("staff")) {
        return apiError(403, "forbidden", "This API key cannot call this endpoint");
      }
      const data = await handler(req, { key });
      return NextResponse.json({ data });
    } catch (err) {
      if (err instanceof ZodError) return apiError(400, "invalid", "Invalid request", err.issues);
      if (err instanceof DomainError) return apiError(STATUS[err.code], err.code, err.message, err.details);
      console.error(err);
      return apiError(500, "internal", "Something went wrong");
    }
  };
}
