import { defineConfig } from "vitest/config";

// Unit and static-analysis suites run in the default Node environment.
// DOM-dependent suites opt into a DOM environment per-file when they land.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/static/**/*.test.ts"],
  },
});
