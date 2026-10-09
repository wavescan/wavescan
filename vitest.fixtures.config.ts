import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// `npm run test:fixtures`: replays the fixture screenshots through the OCR engines
// (tests/*.fixtures.ts): Tesseract on every OS, macOS Vision on macOS. Kept out of
// `npm test` because it takes a minute or so, and the Vision and grid replays need a Rust
// toolchain. See docs/fixtures.md.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.fixtures.ts"],
    environment: "node",
    // Always print the accuracy lines and the OCR text of fixtures with problems.
    silent: false,
    // The first run compiles the Rust OCR tool; Tesseract reads every fixture in beforeAll.
    hookTimeout: 20 * 60_000,
  },
});
