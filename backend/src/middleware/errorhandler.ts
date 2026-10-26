
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "./apperror.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
) => {
  if (error instanceof AppError) {
  res.status(error.statusCode).json({
    error: error.message,
  });
  return;
}
  // 1. Request validation errors
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  // 2. Authentication errors
  if (
    error instanceof Error &&
    error.message === "INVALID_CREDENTIALS"
  ) {
    res.status(401).json({
      error: "Invalid email or password",
    });
    return;
  }

  // 3. Safely inspect PostgreSQL errors
  if (typeof error === "object" && error !== null && "code" in error) {
    const pgError = error as {
      code?: unknown;
      constraint?: unknown;
    };

    // PostgreSQL unique-constraint violation
    if (pgError.code === "23505") {
      if (pgError.constraint === "users_email_unique") {
        res.status(409).json({
          error: "An account with this email already exists",
        });
        return;
      }

      if (pgError.constraint === "accounts_org_name_unique") {
        res.status(409).json({
          error: "An account with this name already exists in this organization",
        });
        return;
      }

      res.status(409).json({
        error: "A record with these details already exists",
      });
      return;
    }
  }

  // 4. Log unexpected errors on the server
  console.error("Unhandled application error:", error);

  // 5. Return a generic response without exposing internals
  res.status(500).json({
    error: "Internal server error",
  });
};
