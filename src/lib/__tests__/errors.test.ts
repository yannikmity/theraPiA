import { describe, it, expect } from "vitest";
import {
  AppError,
  NotAuthenticatedError,
  NotFoundError,
  ValidationError,
  DuplicateEntryError,
  ErrorCode,
} from "../errors";

describe("NotAuthenticatedError", () => {
  it("has correct defaults", () => {
    const error = new NotAuthenticatedError();
    expect(error.message).toBe("Nicht angemeldet");
    expect(error.code).toBe(ErrorCode.NOT_AUTHENTICATED);
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe("NotAuthenticatedError");
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });

  it("accepts custom message", () => {
    const error = new NotAuthenticatedError("Session expired");
    expect(error.message).toBe("Session expired");
  });
});

describe("NotFoundError", () => {
  it("includes entity name in message", () => {
    const error = new NotFoundError("Patient");
    expect(error.message).toBe("Patient nicht gefunden");
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
    expect(error.statusCode).toBe(404);
    expect(error.name).toBe("NotFoundError");
  });
});

describe("ValidationError", () => {
  it("has correct code and status", () => {
    const error = new ValidationError("Invalid input");
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.statusCode).toBe(400);
    expect(error.fieldErrors).toEqual({});
  });

  it("includes field errors", () => {
    const fieldErrors = { email: ["Required"], password: ["Too short"] };
    const error = new ValidationError("Invalid input", fieldErrors);
    expect(error.fieldErrors).toEqual(fieldErrors);
  });
});

describe("DuplicateEntryError", () => {
  it("includes entity name in message", () => {
    const error = new DuplicateEntryError("User");
    expect(error.message).toBe("User existiert bereits");
    expect(error.code).toBe(ErrorCode.DUPLICATE_ENTRY);
    expect(error.statusCode).toBe(409);
  });
});
