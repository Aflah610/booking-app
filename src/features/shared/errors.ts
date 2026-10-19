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
