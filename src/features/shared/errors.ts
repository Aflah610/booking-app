export type DomainErrorCode = "not_found" | "invalid" | "conflict" | "forbidden";

/** Errors the booking core raises on purpose; API routes map `code` to an HTTP status. */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** A service we depend on (WhatsApp, an SMTP host) is not set up or refused us. API routes answer 503 or 502, not 500. */
export class UpstreamError extends Error {
  constructor(
    public readonly code: "not_configured" | "delivery_failed",
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
  get status() {
    return this.code === "not_configured" ? 503 : 502;
  }
}

/*
 * Recognise these errors by name as well as by class. The background worker loads its own copy of the app's modules when
 * the server starts and builds the shared container with it, so an error thrown by a service can come from a different copy
 * of the class than the page catching it, and `instanceof` alone then says no.
 */
const named = (err: unknown, name: string): boolean =>
  err instanceof Error && err.name === name && typeof (err as { code?: unknown }).code === "string";

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError || named(err, "DomainError");
}

export function isUpstreamError(err: unknown): err is UpstreamError {
  return err instanceof UpstreamError || named(err, "UpstreamError");
}
