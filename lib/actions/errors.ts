export type ActionErrorCode = "VALIDATION" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";

/** Raised by actions when a rule rejects the request. Nothing is written. */
export class ActionError extends Error {
  readonly code: ActionErrorCode;
  readonly details: string[];

  constructor(code: ActionErrorCode, message: string, details: string[] = []) {
    super(details.length > 0 ? `${message}: ${details.join("; ")}` : message);
    this.name = "ActionError";
    this.code = code;
    this.details = details;
  }
}

export function httpStatusFor(err: ActionError): number {
  switch (err.code) {
    case "VALIDATION":
      return 400;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
  }
}
