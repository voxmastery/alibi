import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Body-parser and similar errors carry a numeric status; anything else is a 500 with a generic message. */
  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
    if (status >= 400 && status < 500) {
      const message = error instanceof Error ? error.message : "Request could not be processed";
      return new ApiError(status, status === 400 ? "bad_request" : "request_error", message);
    }
    return new ApiError(500, "internal_error", "Something went wrong on our side. The failure has been logged.");
  }
}

export function errorBody(error: ApiError): { error: { code: string; message: string; field?: string } } {
  return { error: { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) } };
}

/**
 * Validates a request body or query against a schema and names the first thing that is wrong.
 * Every route validates before a service sees anything.
 */
export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue && issue.path.length > 0 ? issue.path.map(String).join(".") : undefined;
  throw new ApiError(400, "invalid_request", issue?.message ?? "The request could not be read.", field);
}
