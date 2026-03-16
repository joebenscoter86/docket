import "@testing-library/jest-dom/vitest";

// Mock IntersectionObserver for jsdom environments
if (typeof window !== "undefined") {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });
}
