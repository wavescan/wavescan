#!/usr/bin/env node
// Writes latest.json, the update file Wavescan checks on launch (ADR 0035), from the
// signed updater artifacts a CI build made. Tauri's updater reads it: `version`, `notes`,
// `pub_date`, and per platform the download URL and the minisign signature (the .sig
// file's content). `minimumVersion` is ours: older versions must update before scanning.
//
//   node scripts/updater-manifest.mjs --dir dist --version 0.2.0 \
//     --base-url https://github.com/wavescan/wavescan/releases/download/v0.2.0 \
//     [--notes "text"] [--minimum-version 0.1.3] > dist/latest.json
//
// Exits 1 if a platform is missing, so a release never offers an update to one platform
// and silently not the other.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

const dir = arg("dir");
const version = arg("version");
const baseUrl = arg("base-url");
if (!dir || !version || !baseUrl) {
  console.error("usage: updater-manifest.mjs --dir <dir> --version <v> --base-url <url> [--notes <text>] [--minimum-version <v>]");
  process.exit(1);
}

// Which artifact serves which platform (Tauri's updater keys).
const PLATFORMS = {
  "windows-x86_64": (file) => file.endsWith("-setup.exe"),
  "darwin-aarch64": (file) => file.endsWith(".app.tar.gz"),
};

const files = await readdir(dir);
const platforms = {};
for (const [platform, matches] of Object.entries(PLATFORMS)) {
  const file = files.find((f) => matches(f) && files.includes(`${f}.sig`));
  if (!file) {
    console.error(`no signed update for ${platform} in ${dir}`);
    process.exit(1);
  }
  platforms[platform] = {
    signature: (await readFile(join(dir, `${file}.sig`), "utf8")).trim(),
    url: `${baseUrl}/${encodeURIComponent(file)}`,
  };
}

const manifest = {
  version,
  notes: arg("notes") ?? `Wavescan ${version}`,
  pub_date: new Date().toISOString(),
  platforms,
};
const minimum = arg("minimum-version");
if (minimum) manifest.minimumVersion = minimum;
console.log(JSON.stringify(manifest, null, 2));
