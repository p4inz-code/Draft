import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
  },
});
