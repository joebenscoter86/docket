import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("renders the Docket heading", () => {
    render(<Home />);
    expect(screen.getByText("Docket")).toBeInTheDocument();
  });

  it("renders the tagline", () => {
    render(<Home />);
    expect(
      screen.getByText("Invoice processing for small businesses")
    ).toBeInTheDocument();
  });
});
