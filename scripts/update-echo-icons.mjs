#!/usr/bin/env node
// Refreshes src/data/echo-icons.json: a small picture of every echo, shown next to its name
// on the Review screen (ADR 0029). People recognise an echo by its picture faster than by
// its name. The picture URLs come from the bundled scanner-data.json, so run this after
// `data:update` fetched it (`npm run data:update` runs all three scripts).
//
// The URLs point at the wuthering-waves-assets site or, for newer echoes, other image
// hosts. This script is the only thing that fetches them, when a developer runs it; each
// picture is decoded, shrunk to SIZE×SIZE (keeping transparency) and re-encoded as a WebP
// data URL, so the app never downloads anything. An echo with no https URL, or whose
// picture can't be fetched or decoded, is skipped and the app shows a placeholder.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SIZE = 80;
const QUALITY = 70;
const MAX_BYTES = 5 * 1024 * 1024;
const DATA = new URL("../src/data/scanner-data.json", import.meta.url);
const TARGET = new URL("../src/data/echo-icons.json", import.meta.url);

const scannerData = JSON.parse(await readFile(DATA, "utf8"));
const icons = {};
const sources = {};
const skipped = [];
for (const [key, echo] of Object.entries(scannerData.data.echoes).sort(([a], [b]) => a.localeCompare(b))) {
  if (!echo.icon?.startsWith("https://")) {
    skipped.push(`${key} (no https URL)`);
    continue;
  }
  let file;
  let webp;
  try {
    const res = await fetch(echo.icon);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    file = Buffer.from(await res.arrayBuffer());
    if (file.length > MAX_BYTES) throw new Error(`${file.length} bytes is too big for a picture`);
    webp = await sharp(file)
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: QUALITY })
      .toBuffer();
  } catch (error) {
    skipped.push(`${key} (${echo.icon}: ${error.message})`);
    continue;
  }
  icons[key] = `data:image/webp;base64,${webp.toString("base64")}`;
  sources[key] = { url: echo.icon, sha256: createHash("sha256").update(file).digest("hex") };
}

const out = {
  format: "WavescanEchoIcons",
  version: 1,
  size: SIZE,
  scannerDataHash: scannerData.hash,
  icons,
  sources,
};
await writeFile(TARGET, JSON.stringify(out, null, 1) + "\n");
console.log(`echo-icons: ${Object.keys(icons).length} echoes from scanner-data ${scannerData.hash.slice(0, 12)}`);
if (skipped.length) console.warn(`skipped, placeholder shown:\n  ${skipped.join("\n  ")}`);
