import { NextResponse } from "next/server";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "NOT_IMPLEMENTED";

interface ApiErrorOptions {
  error: string;
  code: ErrorCode;
  status: number;
  details?: Record<string, unknown>;
}

export function apiError({ error, code, status, details }: ApiErrorOptions) {
  return NextResponse.json(
    { error, code, ...(details && { details }) },
    { status }
  );
}

export function validationError(message: string, details?: Record<string, unknown>) {
  return apiError({ error: message, code: "VALIDATION_ERROR", status: 400, details });
}

export function authError(message = "Unauthorized") {
  return apiError({ error: message, code: "AUTH_ERROR", status: 401 });
}

export function forbiddenError(message = "Forbidden") {
  return apiError({ error: message, code: "AUTH_ERROR", status: 403 });
}

export function notFound(message = "Resource not found") {
  return apiError({ error: message, code: "NOT_FOUND", status: 404 });
}

export function conflict(message: string) {
  return apiError({ error: message, code: "CONFLICT", status: 409 });
}

export function rateLimited(message = "Too many requests") {
  return apiError({ error: message, code: "RATE_LIMITED", status: 429 });
}

export function internalError(message = "Internal server error") {
  return apiError({ error: message, code: "INTERNAL_ERROR", status: 500 });
}

export function apiSuccess<T>(data: T) {
  return NextResponse.json({ data });
}
