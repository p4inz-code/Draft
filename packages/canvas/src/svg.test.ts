// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseSvgDimensions } from "./svg";

describe("parseSvgDimensions", () => {
  it("reads explicit width/height attributes", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"></svg>`;
    expect(parseSvgDimensions(svg)).toEqual({ width: 120, height: 80 });
  });

  it("strips px units from width/height", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="80px"></svg>`;
    expect(parseSvgDimensions(svg)).toEqual({ width: 120, height: 80 });
  });

  it("falls back to viewBox when width/height are absent", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"></svg>`;
    expect(parseSvgDimensions(svg)).toEqual({ width: 640, height: 480 });
  });

  it("falls back to viewBox when width/height are percentages", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 100"></svg>`;
    expect(parseSvgDimensions(svg)).toEqual({ width: 200, height: 100 });
  });

  it("prefers explicit width/height over viewBox when both are present", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="25" viewBox="0 0 200 100"></svg>`;
    expect(parseSvgDimensions(svg)).toEqual({ width: 50, height: 25 });
  });

  it("returns null when neither width/height nor viewBox is present", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;
    expect(parseSvgDimensions(svg)).toBeNull();
  });

  it("returns null for malformed XML", () => {
    expect(parseSvgDimensions("<svg><unclosed></svg>")).toBeNull();
  });

  it("returns null for a non-SVG document", () => {
    expect(parseSvgDimensions("<html><body>not an svg</body></html>")).toBeNull();
  });

  it("returns null for a viewBox with non-numeric parts", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 abc 100"></svg>`;
    expect(parseSvgDimensions(svg)).toBeNull();
  });
});
