// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("renders both light-bg and dark-bg variants for the theme media query to pick between", () => {
    render(<Logo />);
    const images = screen.getAllByRole("img", { name: "DRAFT" });
    expect(images).toHaveLength(2);
  });
});
