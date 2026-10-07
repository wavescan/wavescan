#!/usr/bin/env node
// Refreshes src/data/set-icons.json: a small copy of every sonata set's icon, used to tell
// an echo's set from the icon on its panel (src/session/setIcon.ts, ADR 0022). The icon
// URLs come from the bundled scanner-data.json, so run this after `data:update` fetched it
// (`npm run data:update` runs both).
//
// Each icon is flattened onto BACKGROUND (the icons are transparent outside their ring),
// shrunk to SIZE×SIZE and stored as base64 RGB. The app and the tests use these numbers
// directly, so nothing decodes images at runtime and the app never downloads icons.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SIZE = 32;
const BACKGROUND = { r: 40, g: 40, b: 40 };
const DATA = new URL("../src/data/scanner-data.json", import.meta.url);
const TARGET = new URL("../src/data/set-icons.json", import.meta.url);

const scannerData = JSON.parse(await readFile(DATA, "utf8"));
const icons = {};
const sources = {};
for (const [key, set] of Object.entries(scannerData.data.echoSets).sort(([a], [b]) => a.localeCompare(b))) {
  if (!set.icon) {
    console.warn(`${key}: no icon in scanner-data, skipped`);
    continue;
  }
  const res = await fetch(set.icon);
  if (!res.ok) throw new Error(`${key}: ${set.icon}: HTTP ${res.status}`);
  const file = Buffer.from(await res.arrayBuffer());
  const rgb = await sharp(file)
    .flatten({ background: BACKGROUND })
    .resize(SIZE, SIZE, { fit: "fill", kernel: "mitchell" })
    .removeAlpha()
    .raw()
    .toBuffer();
  if (rgb.length !== SIZE * SIZE * 3) throw new Error(`${key}: unexpected decoded size ${rgb.length}`);
  icons[key] = rgb.toString("base64");
  sources[key] = { url: set.icon, sha256: createHash("sha256").update(file).digest("hex") };
}

const out = {
  format: "WavescanSetIcons",
  version: 1,
  size: SIZE,
  background: [BACKGROUND.r, BACKGROUND.g, BACKGROUND.b],
  scannerDataHash: scannerData.hash,
  icons,
  sources,
};
await writeFile(TARGET, JSON.stringify(out, null, 1) + "\n");
console.log(`set-icons: ${Object.keys(icons).length} sets from scanner-data ${scannerData.hash.slice(0, 12)}`);
