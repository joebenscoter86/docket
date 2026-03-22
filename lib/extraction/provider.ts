import type { ExtractionProvider } from "./types";
import { ClaudeExtractionProvider } from "./claude";
import { MockExtractionProvider } from "./mock";

export function getExtractionProvider(): ExtractionProvider {
  if (process.env.EXTRACTION_PROVIDER === "mock") {
    return new MockExtractionProvider();
  }
  return new ClaudeExtractionProvider();
}
