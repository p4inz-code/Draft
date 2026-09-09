// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTheme, getStoredTheme, useTheme } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to system with nothing stored", () => {
    expect(getStoredTheme()).toBe("system");
  });

  it("ignores a corrupted/unrecognized stored value instead of crashing", () => {
    localStorage.setItem("draft.theme", "not-a-real-theme");
    expect(getStoredTheme()).toBe("system");
  });

  it("applyTheme sets data-theme for an explicit choice and persists it", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(getStoredTheme()).toBe("dark");

    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(getStoredTheme()).toBe("light");
  });

  it("applyTheme('system') removes the override so the OS setting wins again", () => {
    applyTheme("dark");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(getStoredTheme()).toBe("system");
  });

  it("useTheme applies the stored theme on mount and setTheme updates both state and the DOM", () => {
    localStorage.setItem("draft.theme", "dark");
    const { result } = renderHook(() => useTheme());

    expect(result.current[0]).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    act(() => {
      result.current[1]("light");
    });

    expect(result.current[0]).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
