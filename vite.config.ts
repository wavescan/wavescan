/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

// Ships tesseract.js's worker script and WebAssembly core with the app (ADR 0027), at
// fixed paths under `/tesseract/` next to the model (`public/tesseract/`). They're served
// straight from node_modules, so they always match the installed tesseract.js version and
// nothing is copied by hand. The reader points tesseract.js at these paths, so it never
// falls back to its default CDN.

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

/** Published path → file in node_modules. */
const TESSERACT_ASSETS: Record<string, string> = {
  "tesseract/worker.min.js": join(packageDir("tesseract.js"), "dist/worker.min.js"),
  // The core loads its WebAssembly from next to itself. (The single-file ".wasm.js" build
  // would first try to fetch its embedded copy as a data: URL, which the CSP blocks.)
  "tesseract/tesseract-core-simd-lstm.js": join(packageDir("tesseract.js-core"), "tesseract-core-simd-lstm.js"),
  "tesseract/tesseract-core-simd-lstm.wasm": join(packageDir("tesseract.js-core"), "tesseract-core-simd-lstm.wasm"),
};

const CONTENT_TYPES: Record<string, string> = { ".js": "text/javascript", ".wasm": "application/wasm" };

function tesseractAssets(): Plugin {
  return {
    name: "wavescan-tesseract-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = TESSERACT_ASSETS[(req.url ?? "").split("?")[0]!.replace(/^\//, "")];
        if (!file) return next();
        res.setHeader("Content-Type", CONTENT_TYPES[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(TESSERACT_ASSETS)) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(file) });
      }
    },
  };
}

// Tauri expects a fixed dev-server port and serves the built files from `dist/`.
// https://v2.tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [vue(), tailwindcss(), tesseractAssets()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  // The Tesseract reader runs in a module worker (src/ocr/tesseract.worker.ts).
  worker: { format: "es" },
  build: {
    // WebView2 (Windows) is evergreen Chromium; WKWebView on macOS 13+ is Safari 16+.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome120" : "safari16",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    include: ["tests/**/*.spec.ts", "src/**/*.spec.ts"],
    environment: "node",
  },
});
