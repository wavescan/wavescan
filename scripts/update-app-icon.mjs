#!/usr/bin/env node
// Regenerates every app icon in src-tauri/icons from the two SVG sources there.
// Run: npm run icons:update
//
// `tauri icon` draws all sizes from one picture. At 16-32 px the mark's smallest pixel turns
// into a smudge, so those sizes come from source-small.svg (no smallest pixel, mark drawn
// larger) and everything else from source.svg:
//   1. `tauri icon source.svg` renders the full set; only the files tauri.conf.json uses
//      (KEEP) are copied over, not the Windows Store, Android and iOS extras.
//   2. `tauri icon source-small.svg --png 16,24,32` and `source.svg --png 48,64,256` render
//      the .ico sizes into a temporary folder.
//   3. icon.ico is rebuilt from those six PNGs, and 32x32.png is replaced by the small one.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ICONS = fileURLToPath(new URL("../src-tauri/icons/", import.meta.url));
const FULL = join(ICONS, "source.svg");
const SMALL = join(ICONS, "source-small.svg");
const SMALL_SIZES = [16, 24, 32];
const LARGE_SIZES = [48, 64, 256];
const KEEP = ["32x32.png", "64x64.png", "128x128.png", "128x128@2x.png", "icon.png", "icon.icns"];

/** Runs the Tauri CLI from node_modules (works the same on Windows, macOS and Linux). */
function tauriIcon(...args) {
  const cli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));
  execFileSync(process.execPath, [cli, "icon", ...args], { stdio: "inherit" });
}

/**
 * An .ico file is a 6-byte header, one 16-byte entry per size, then each image. Modern
 * Windows accepts PNG data as the image, which is what `tauri icon` writes too.
 */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((png) => png.data)]);
}

const temp = mkdtempSync(join(tmpdir(), "wavescan-icon-"));
try {
  tauriIcon(FULL, "--output", join(temp, "full"));
  for (const file of KEEP) copyFileSync(join(temp, "full", file), join(ICONS, file));
  tauriIcon(SMALL, "--output", join(temp, "small"), "--png", SMALL_SIZES.join(","));
  tauriIcon(FULL, "--output", join(temp, "large"), "--png", LARGE_SIZES.join(","));
  const read = (folder, size) => ({ size, data: readFileSync(join(temp, folder, `${size}x${size}.png`)) });
  const pngs = [...SMALL_SIZES.map((size) => read("small", size)), ...LARGE_SIZES.map((size) => read("large", size))];
  writeFileSync(join(ICONS, "icon.ico"), buildIco(pngs));
  copyFileSync(join(temp, "small", "32x32.png"), join(ICONS, "32x32.png"));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log("icons: full set from source.svg, 16-32 px from source-small.svg");
