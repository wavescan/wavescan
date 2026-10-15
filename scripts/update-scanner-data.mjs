#!/usr/bin/env node
// Refreshes src/data/scanner-data.json from Wuthering Tools, after checking its format,
// version and hash. Run: npm run data:update [-- <url-or-path>]
//
// With --check (npm run data:check) it writes nothing: it only says whether the bundled
// snapshot matches the published one, and exits 2 when it doesn't (1 means the check itself
// failed, e.g. no network). CI uses that to flag builds made with stale game data (ADR 0033).
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const SOURCE = args.find((arg) => arg !== "--check") ?? "https://www.wutheringtools.com/scanner-data.json";
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

let previousFile = null;
try {
  previousFile = JSON.parse(await readFile(TARGET, "utf8"));
} catch {
  // no existing snapshot
}
const previous = previousFile?.hash ?? null;

// Lists which entries changed in each section (by key), so a data update can be reviewed
// without reading the whole JSON diff. Arrays (characters, weapons) are keyed by `key`.
function describeChanges(before, after) {
  const byKey = (section) =>
    Array.isArray(section)
      ? Object.fromEntries(section.map((entry, i) => [entry?.key ?? `#${i}`, entry]))
      : (section ?? {});
  const lines = [];
  for (const name of Object.keys({ ...before, ...after })) {
    if (JSON.stringify(before[name]) === JSON.stringify(after[name])) continue;
    const [old, now] = [byKey(before[name]), byKey(after[name])];
    if (typeof old !== "object" || typeof now !== "object") {
      lines.push(`${name}: changed`);
      continue;
    }
    const keys = Object.keys({ ...old, ...now });
    const added = keys.filter((key) => !(key in old));
    const removed = keys.filter((key) => !(key in now));
    const changed = keys.filter(
      (key) => key in old && key in now && JSON.stringify(old[key]) !== JSON.stringify(now[key]),
    );
    for (const [label, list] of [["added", added], ["removed", removed], ["changed", changed]]) {
      if (list.length) lines.push(`${name} ${label}: ${list.join(", ")}`);
    }
  }
  return lines;
}

if (CHECK) {
  if (previous === file.hash) {
    console.log(`scanner-data is current (${file.hash.slice(0, 12)})`);
    process.exit(0);
  }
  console.log(
    `scanner-data is stale: bundled ${previous?.slice(0, 12) ?? "(none)"}, published ${file.hash.slice(0, 12)}. Run npm run data:update`,
  );
  process.exit(2);
}

await writeFile(TARGET, JSON.stringify(file, null, 1) + "\n");
const counts = `${Object.keys(file.data.echoes).length} echoes, ${file.data.characters.length} characters`;
console.log(
  previous === file.hash
    ? `scanner-data unchanged (${file.hash.slice(0, 12)}, ${counts})`
    : `scanner-data updated ${previous?.slice(0, 12) ?? "(none)"} → ${file.hash.slice(0, 12)} (${counts})`,
);
if (previousFile && previous !== file.hash) {
  for (const line of describeChanges(previousFile.data ?? {}, file.data)) console.log(`  ${line}`);
}
