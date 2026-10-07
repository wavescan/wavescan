import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// `npm run test:fixtures`: replays the fixture screenshots through this OS's OCR
// (tests/fixtureReplay.fixtures.ts). Kept out of `npm test` because it needs Windows or
// macOS and a Rust toolchain. See docs/fixtures.md.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.fixtures.ts"],
    environment: "node",
    // The first run compiles the Rust OCR tool.
    hookTimeout: 20 * 60_000,
  },
});
