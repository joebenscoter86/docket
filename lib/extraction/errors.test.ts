import { describe, it, expect } from "vitest";
import { isRetryableError, toUserFriendlyError } from "./errors";

describe("isRetryableError", () => {
  it("returns true for 429 rate limit errors", () => {
    const error = new Error('429 {"type":"error","error":{"type":"rate_limit_error","message":"Rate limit exceeded"}}');
    expect(isRetryableError(error)).toBe(true);
  });
  it("returns true for errors with RateLimitError name", () => {
    const error = new Error("Rate limit");
    error.name = "RateLimitError";
    expect(isRetryableError(error)).toBe(true);
  });
  it("returns true for 529 overloaded errors", () => {
    const error = new Error('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}');
    expect(isRetryableError(error)).toBe(true);
  });
  it("returns false for 400 validation errors", () => {
    expect(isRetryableError(new Error("Invalid request"))).toBe(false);
  });
  it("returns false for parse errors", () => {
    expect(isRetryableError(new Error("Could not parse extraction results"))).toBe(false);
  });
});

describe("toUserFriendlyError", () => {
  it("maps rate limit errors", () => {
    expect(toUserFriendlyError('429 {"type":"error","error":{"type":"rate_limit_error","message":"exceeded"}}')).toBe("Extraction service was temporarily busy. Please retry.");
  });
  it("maps timeout errors", () => {
    expect(toUserFriendlyError("Extraction timed out. Please retry.")).toBe("Extraction timed out. Please retry.");
  });
  it("maps unreadable document errors", () => {
    expect(toUserFriendlyError("Could not extract data from this document. The file may be unreadable or unsupported.")).toBe("Could not extract data from this document. The file may be unreadable or unsupported.");
  });
  it("maps file retrieval errors", () => {
    expect(toUserFriendlyError("Failed to retrieve uploaded file")).toBe("The uploaded file could not be read. It may be corrupted or in an unsupported format.");
  });
  it("maps complex invoice errors", () => {
    expect(toUserFriendlyError("This invoice is too complex to extract automatically. Please retry or enter the data manually.")).toBe("This invoice is too complex to extract automatically. Please retry or enter the data manually.");
  });
  it("maps parse errors to generic message", () => {
    expect(toUserFriendlyError("Could not parse extraction results. Raw response: {truncated...")).toBe("The document could not be processed. Please check the file and retry.");
  });
  it("maps unknown errors to generic message", () => {
    expect(toUserFriendlyError("some random internal error")).toBe("Extraction failed. Please retry or contact support.");
  });
});
