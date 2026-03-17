import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime } from "./date";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 'just now' for times less than 1 minute ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:30Z"));
    expect(formatRelativeTime("2026-03-16T12:00:00Z")).toBe("just now");
  });

  it("shows minutes for times less than 1 hour ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:15:00Z"));
    expect(formatRelativeTime("2026-03-16T12:00:00Z")).toBe("15 minutes ago");
  });

  it("shows singular minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:01:30Z"));
    expect(formatRelativeTime("2026-03-16T12:00:00Z")).toBe("1 minute ago");
  });

  it("shows hours for times less than 1 day ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T14:00:00Z"));
    expect(formatRelativeTime("2026-03-16T12:00:00Z")).toBe("2 hours ago");
  });

  it("shows days for times less than 30 days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
    expect(formatRelativeTime("2026-03-16T12:00:00Z")).toBe("2 days ago");
  });

  it("shows the date for times more than 30 days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00Z"));
    const result = formatRelativeTime("2026-03-16T12:00:00Z");
    expect(result).toBe("Mar 16, 2026");
  });
});
