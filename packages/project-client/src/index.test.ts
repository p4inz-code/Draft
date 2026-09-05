import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue("0.1.0"),
}));

describe("getCoreVersion", () => {
  it("invokes the app_version Tauri command and returns its result", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const { getCoreVersion } = await import("./index");

    const version = await getCoreVersion();

    expect(invoke).toHaveBeenCalledWith("app_version");
    expect(version).toBe("0.1.0");
  });
});
