import { describe, expect, it } from "vitest";
import { newObjectId, parseObjectId, parsePageId } from "./ids";

describe("parseId", () => {
  it("accepts a well-formed scheme://uuid string", () => {
    const id = parseObjectId("object://0190f1e4-0000-7000-8000-000000000000");
    expect(id).toBe("object://0190f1e4-0000-7000-8000-000000000000");
  });

  it("rejects a mismatched scheme", () => {
    expect(() => parseObjectId("page://0190f1e4-0000-7000-8000-000000000000")).toThrow();
  });

  it("rejects a malformed uuid segment", () => {
    expect(() => parsePageId("page://not-a-uuid")).toThrow();
  });
});

describe("newObjectId", () => {
  it("generates ids that parse back as the same kind", () => {
    const id = newObjectId();
    expect(parseObjectId(id)).toBe(id);
  });

  it("generates unique ids", () => {
    expect(newObjectId()).not.toBe(newObjectId());
  });
});
