// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountCard } from "./AccountCard";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("AccountCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email and org name in read-only mode", () => {
    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    expect(screen.getByText("test@example.com")).toBeTruthy();
    expect(screen.getByText("Acme Inc")).toBeTruthy();
  });

  it("enters edit mode when Edit button is clicked", () => {
    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Edit"));
    expect(screen.getByDisplayValue("Acme Inc")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("cancels edit mode without API call", () => {
    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Acme Inc")).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("saves org name and returns to read-only on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { name: "New Name" } }),
    });

    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Edit"));

    const input = screen.getByDisplayValue("Acme Inc");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("New Name")).toBeTruthy();
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/settings/organization", expect.objectContaining({
      method: "PATCH",
    }));
  });

  it("triggers password reset and shows success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { message: "Password reset email sent." } }),
    });

    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Change password"));

    await waitFor(() => {
      expect(screen.getByText("Reset email sent")).toBeTruthy();
    });
  });

  it("saves on Enter key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { name: "Enter Name" } }),
    });

    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Edit"));

    const input = screen.getByDisplayValue("Acme Inc");
    fireEvent.change(input, { target: { value: "Enter Name" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Enter Name")).toBeTruthy();
    });
  });

  it("cancels on Escape key", () => {
    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Edit"));

    const input = screen.getByDisplayValue("Acme Inc");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.getByText("Acme Inc")).toBeTruthy();
    expect(screen.queryByDisplayValue("Acme Inc")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not show Edit button when no orgId", () => {
    render(<AccountCard email="test@example.com" orgName="" orgId="" />);
    expect(screen.getByText("\u2014")).toBeTruthy();
    expect(screen.queryByText("Edit")).toBeNull();
  });
});
