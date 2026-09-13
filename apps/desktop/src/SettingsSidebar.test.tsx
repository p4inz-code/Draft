// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsSidebar } from "./SettingsSidebar";

describe("SettingsSidebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("is permanently docked — no toggle handle, always rendered", () => {
    const { container, getByText } = render(<SettingsSidebar coreVersion="0.1.0" />);
    expect(container.querySelector(".settings-sidebar-handle")).toBeNull();
    expect(container.querySelector(".settings-sidebar-panel")).not.toBeNull();
    expect(getByText("Settings")).toBeTruthy();
  });

  it("shows every section's content by default, all expanded like Figma's own panel", () => {
    const { getByText } = render(<SettingsSidebar coreVersion="0.1.0" />);

    expect(getByText("Choose how DRAFT looks on this device.")).toBeTruthy();
    expect(getByText("Live access — already on")).toBeTruthy();
    expect(getByText("Check for updates")).toBeTruthy();
    expect(getByText("0.1.0")).toBeTruthy();
  });

  it("collapses and re-expands a section's body when its header is clicked", () => {
    const { getByText, queryByText } = render(<SettingsSidebar coreVersion="0.1.0" />);
    expect(getByText("Live access — already on")).toBeTruthy();

    fireEvent.click(getByText("Agents"));
    expect(queryByText("Live access — already on")).toBeNull();

    fireEvent.click(getByText("Agents"));
    expect(getByText("Live access — already on")).toBeTruthy();
  });

  it("persists the update preference and honestly reports checks aren't wired up yet", () => {
    localStorage.clear();
    const { getByText } = render(<SettingsSidebar coreVersion="0.1.0" />);

    // Defaults to "Ask first" when nothing is stored.
    expect(getByText("Ask first").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(getByText("Download automatically"));
    expect(getByText("Download automatically").getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("draft.updatePreference")).toBe("auto");

    fireEvent.click(getByText("Check for updates"));
    expect(getByText(/aren't set up yet/)).toBeTruthy();
  });
});
