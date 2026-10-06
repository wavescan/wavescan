#!/usr/bin/env node
// Refreshes src/data/scanner-data.json from Wuthering Tools, after checking its format,
// version and hash. Run: npm run data:update [-- <url-or-path>]
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const SOURCE = process.argv[2] ?? "https://wutheringtools.com/scanner-data.json";
const TARGET = new URL("../src/data/scanner-data.json", import.meta.url);
const SUPPORTED_VERSION = 1;

const text = /^https?:/.test(SOURCE)
  ? await (async () => {
      const res = await fetch(SOURCE, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`${SOURCE}: HTTP ${res.status}`);
      return res.text();
    })()
  : await readFile(SOURCE, "utf8");

const file = JSON.parse(text);
if (file.format !== "WutheringToolsScannerData") throw new Error("not a scanner-data file");
if (file.version !== SUPPORTED_VERSION) throw new Error(`unsupported version ${file.version}`);
const actual = createHash("sha256").update(JSON.stringify(file.data)).digest("hex");
if (actual !== file.hash) throw new Error(`hash mismatch: file says ${file.hash}, content is ${actual}`);

let previous = null;
try {
  previous = JSON.parse(await readFile(TARGET, "utf8")).hash;
} catch {
  // no existing snapshot
}

await writeFile(TARGET, JSON.stringify(file, null, 1) + "\n");
const counts = `${Object.keys(file.data.echoes).length} echoes, ${file.data.characters.length} characters`;
console.log(
  previous === file.hash
    ? `scanner-data unchanged (${file.hash.slice(0, 12)}, ${counts})`
    : `scanner-data updated ${previous?.slice(0, 12) ?? "(none)"} → ${file.hash.slice(0, 12)} (${counts})`,
);
