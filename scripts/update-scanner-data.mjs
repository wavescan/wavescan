#!/usr/bin/env node
// Refreshes the bundled game data from Wuthering Tools: src/data/scanner-data.json, and
// src/data/scanner-assets.json (set-icon references and echo pictures) when the data names
// different ones. Checks each file's format, version and hash, and the signature when the
// file is signed (ADR 0034). Run: npm run data:update [-- <url-or-path-of-scanner-data.json>]
//
// The snapshot is only rewritten when the data or pictures changed: every WT deploy has a
// new publish time and signature, and that alone shouldn't make a PR.
//
// With --check (npm run data:check) it writes nothing: it only says whether the bundled
// snapshot matches the published one, and exits 2 when it doesn't (1 means the check itself
// failed, e.g. no network). CI uses that to flag builds made with stale game data (ADR 0033).
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const SOURCE = args.find((arg) => arg !== "--check") ?? "https://www.wutheringtools.com/scanner-data.json";
const DATA_TARGET = new URL("../src/data/scanner-data.json", import.meta.url);
const ASSETS_TARGET = new URL("../src/data/scanner-assets.json", import.meta.url);
const KEYS = new URL("../src/data/trusted-keys.json", import.meta.url);
const SUPPORTED_VERSION = 1;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const short = (hash) => hash?.slice(0, 12) ?? "(none)";

/** Reads a URL or a path next to SOURCE (`name` replaces SOURCE's file name). */
async function load(name) {
  if (/^https?:/.test(SOURCE)) {
    const url = name ? new URL(name, SOURCE).href : SOURCE;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return JSON.parse(await res.text());
  }
  const path = name ? SOURCE.replace(/[^/\\]+$/, name) : SOURCE;
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJson(url) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch {
    return null;
  }
}

/** Same checks as the app (src/data/signature.ts), with node:crypto. */
async function checkSignature(file) {
  if (!file.signature) return "unsigned";
  const { keys } = await readJson(KEYS);
  const publicKey = keys[file.keyId];
  if (!publicKey) throw new Error(`signed with key ${file.keyId}, which src/data/trusted-keys.json doesn't have`);
  const payload = [file.format, file.version, file.publishedAt, file.hash, file.assets?.hash].join("\n");
  const key = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
  const valid = verify("sha256", Buffer.from(payload), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(file.signature, "base64"));
  if (!valid) throw new Error("the signature doesn't match: not using this file");
  return `signed (key ${file.keyId})`;
}

const file = await load();
if (file.format !== "WutheringToolsScannerData") throw new Error("not a scanner-data file");
if (file.version !== SUPPORTED_VERSION) throw new Error(`unsupported version ${file.version}`);
if (sha256(JSON.stringify(file.data)) !== file.hash) throw new Error(`hash mismatch: file says ${file.hash}`);
const signature = await checkSignature(file);

const previousFile = await readJson(DATA_TARGET);
const previousAssets = await readJson(ASSETS_TARGET);
const dataChanged = previousFile?.hash !== file.hash;
// Before WT published pictures (WT ADR 0041) the data didn't name any: keep the bundled ones.
const assetsChanged = Boolean(file.assets) && previousAssets?.hash !== file.assets.hash;

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
  if (!dataChanged && !assetsChanged) {
    console.log(`game data is current (data ${short(file.hash)}, pictures ${short(previousAssets?.hash)})`);
    process.exit(0);
  }
  console.log(
    `game data is stale: bundled data ${short(previousFile?.hash)}, published ${short(file.hash)}; ` +
      `bundled pictures ${short(previousAssets?.hash)}, published ${short(file.assets?.hash ?? previousAssets?.hash)}. ` +
      "Run npm run data:update",
  );
  process.exit(2);
}

const counts = `${Object.keys(file.data.echoes).length} echoes, ${file.data.characters.length} characters`;
if (dataChanged || assetsChanged) {
  // The signature fields are kept, so the bundled file names the exact publish it came from.
  await writeFile(DATA_TARGET, JSON.stringify(file, null, 1) + "\n");
}
console.log(
  dataChanged
    ? `scanner-data updated ${short(previousFile?.hash)} → ${short(file.hash)} (${counts}, ${signature})`
    : `scanner-data unchanged (${short(file.hash)}, ${counts}, ${signature})`,
);
if (previousFile && dataChanged) {
  for (const line of describeChanges(previousFile.data ?? {}, file.data)) console.log(`  ${line}`);
}

if (assetsChanged) {
  const assets = await load(file.assets.file);
  if (assets.format !== "WutheringToolsScannerAssets" || assets.version !== 1) throw new Error("not a pictures file");
  if (sha256(JSON.stringify(assets.data)) !== file.assets.hash || assets.hash !== file.assets.hash) {
    throw new Error("the pictures don't match the hash scanner-data.json names");
  }
  await writeFile(ASSETS_TARGET, JSON.stringify(assets, null, 1) + "\n");
  console.log(`scanner-assets updated ${short(previousAssets?.hash)} → ${short(assets.hash)}`);
  for (const section of ["setIcons", "echoIcons"]) {
    const changes = describeChanges(
      { [section]: previousAssets?.data?.[section]?.icons ?? {} },
      { [section]: assets.data[section].icons },
    );
    for (const line of changes) console.log(`  ${line}`);
  }
}
