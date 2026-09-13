// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsSidebar } from "./SettingsSidebar";

describe("SettingsSidebar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  function dock(container: HTMLElement) {
    return container.querySelector(".settings-sidebar-dock") as HTMLElement;
  }

  function handle(container: HTMLElement) {
    return container.querySelector(".settings-sidebar-handle") as HTMLElement;
  }

  it("starts closed and opens when the handle is clicked", () => {
    const { container } = render(<SettingsSidebar coreVersion="0.1.0" />);
    expect(dock(container).className).not.toMatch(/is-open/);

    fireEvent.click(handle(container));
    expect(dock(container).className).toMatch(/is-open/);
  });

  it("auto-collapses after 3 seconds of no interaction, matching the toolbar's own idle-fade", () => {
    const { container } = render(<SettingsSidebar coreVersion="0.1.0" />);
    fireEvent.click(handle(container));
    expect(dock(container).className).toMatch(/is-open/);

    act(() => {
      vi.advanceTimersByTime(3001);
    });
    expect(dock(container).className).not.toMatch(/is-open/);
  });

  it("does not auto-collapse while there's ongoing interaction inside it", () => {
    const { container } = render(<SettingsSidebar coreVersion="0.1.0" />);
    fireEvent.click(handle(container));

    // Just under the timeout, a pointermove inside the panel resets it —
    // the same "reset the countdown on activity" pattern Toolbar.tsx uses.
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    fireEvent.pointerMove(dock(container));
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(dock(container).className).toMatch(/is-open/);
  });

  it("closes on Escape", () => {
    const { container } = render(<SettingsSidebar coreVersion="0.1.0" />);
    fireEvent.click(handle(container));
    expect(dock(container).className).toMatch(/is-open/);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(dock(container).className).not.toMatch(/is-open/);
  });

  it("clicking the handle again while open closes it immediately", () => {
    const { container } = render(<SettingsSidebar coreVersion="0.1.0" />);
    fireEvent.click(handle(container));
    expect(dock(container).className).toMatch(/is-open/);

    fireEvent.click(handle(container));
    expect(dock(container).className).not.toMatch(/is-open/);
  });

  it("shows every section's content by default, all expanded like Figma's own panel", () => {
    const { container, getByText } = render(<SettingsSidebar coreVersion="0.1.0" />);
    fireEvent.click(handle(container));

    expect(getByText("Choose how DRAFT looks on this device.")).toBeTruthy();
    expect(getByText("Live access — already on")).toBeTruthy();
    expect(getByText("Check for updates")).toBeTruthy();
    expect(getByText("0.1.0")).toBeTruthy();
  });

  it("collapses and re-expands a section's body when its header is clicked", () => {
    const { container, getByText, queryByText } = render(<SettingsSidebar coreVersion="0.1.0" />);
    fireEvent.click(handle(container));
    expect(getByText("Live access — already on")).toBeTruthy();

    fireEvent.click(getByText("Agents"));
    expect(queryByText("Live access — already on")).toBeNull();

    fireEvent.click(getByText("Agents"));
    expect(getByText("Live access — already on")).toBeTruthy();
  });

  it("persists the update preference and honestly reports checks aren't wired up yet", () => {
    localStorage.clear();
    const { container, getByText } = render(<SettingsSidebar coreVersion="0.1.0" />);
    fireEvent.click(handle(container));

    // Defaults to "Ask first" when nothing is stored.
    expect(getByText("Ask first").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(getByText("Download automatically"));
    expect(getByText("Download automatically").getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("draft.updatePreference")).toBe("auto");

    fireEvent.click(getByText("Check for updates"));
    expect(getByText(/aren't set up yet/)).toBeTruthy();
  });
});
