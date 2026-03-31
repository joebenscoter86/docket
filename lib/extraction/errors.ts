/**
 * Determines if an extraction error is retryable (rate limit, overload, temporary).
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "RateLimitError") return true;
  if (error.name === "InternalServerError") return true;
  if (error.name === "APIConnectionError") return true;
  const message = error.message;
  if (message.startsWith("429 ")) return true;
  if (message.startsWith("529 ")) return true;
  if (message.startsWith("500 ")) return true;
  if (message.startsWith("503 ")) return true;
  return false;
}

/**
 * Maps raw technical error messages to user-friendly descriptions.
 */
export function toUserFriendlyError(rawMessage: string): string {
  if (rawMessage.startsWith("429 ") || rawMessage.includes("rate_limit_error")) {
    return "Extraction service was temporarily busy. Please retry.";
  }
  if (rawMessage.startsWith("529 ") || rawMessage.includes("overloaded_error")) {
    return "Extraction service was temporarily busy. Please retry.";
  }
  if (rawMessage === "Extraction timed out. Please retry.") return rawMessage;
  if (rawMessage === "Extraction service is busy. Please retry in a moment.") {
    return "Extraction service was temporarily busy. Please retry.";
  }
  if (rawMessage === "Extraction service unavailable. Please retry.") return rawMessage;
  if (rawMessage.startsWith("Could not extract data from this document")) return rawMessage;
  if (rawMessage.startsWith("This invoice is too complex")) return rawMessage;
  if (rawMessage.includes("Failed to retrieve uploaded file")) {
    return "The uploaded file could not be read. It may be corrupted or in an unsupported format.";
  }
  if (rawMessage.includes("Could not parse extraction results")) {
    return "The document could not be processed. Please check the file and retry.";
  }
  if (rawMessage.includes("Failed to store")) {
    return "Extraction succeeded but results could not be saved. Please retry.";
  }
  return "Extraction failed. Please retry or contact support.";
}
