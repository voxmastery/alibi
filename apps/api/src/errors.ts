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
