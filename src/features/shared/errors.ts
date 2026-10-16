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
