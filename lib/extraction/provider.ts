import type { ExtractionProvider } from "./types";
import { ClaudeExtractionProvider } from "./claude";

export function getExtractionProvider(): ExtractionProvider {
  return new ClaudeExtractionProvider();
}
