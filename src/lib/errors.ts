export enum ErrorCode {
  NOT_AUTHENTICATED = "NOT_AUTHENTICATED",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  DUPLICATE_ENTRY = "DUPLICATE_ENTRY",
  INTERNAL = "INTERNAL",
  FORBIDDEN = "FORBIDDEN",
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;

  constructor(message: string, code: ErrorCode, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class NotAuthenticatedError extends AppError {
  constructor(message = "Nicht angemeldet") {
    super(message, ErrorCode.NOT_AUTHENTICATED, 401);
    this.name = "NotAuthenticatedError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string) {
    super(`${entity} nicht gefunden`, ErrorCode.NOT_FOUND, 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  readonly fieldErrors: Record<string, string[]>;

  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message, ErrorCode.VALIDATION_ERROR, 400);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export class DuplicateEntryError extends AppError {
  constructor(entity: string) {
    super(`${entity} existiert bereits`, ErrorCode.DUPLICATE_ENTRY, 409);
    this.name = "DuplicateEntryError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Keine Berechtigung") {
    super(message, ErrorCode.FORBIDDEN, 403);
    this.name = "ForbiddenError";
  }
}
