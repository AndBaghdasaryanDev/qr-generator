import type { z } from "zod";

/** Invalid input; safe to show to the user. */
export class ValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function zodToValidationError(error: z.ZodError): ValidationError {
  const issue = error.issues[0];
  return new ValidationError(issue?.message ?? "Invalid request.", issue?.path.map(String).join(".") || undefined);
}

export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}
/** Server-wide storage budget reached. */
export class QuotaExceededError extends Error {}
