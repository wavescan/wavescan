#!/usr/bin/env node
// Sets the app version for a CI build (ADR 0035): package.json (which tauri.conf.json reads)
// and src-tauri/Cargo.toml (which the app reports in Help and bug reports). The updater
// installs only higher versions, so every published build needs its own:
//
//   node scripts/set-version.mjs 0.2.0              a release (from its tag)
//   node scripts/set-version.mjs 0.2.1-tester.57    a tester build
//
// CI only: nothing is committed. package.json's version stays what local builds report.
import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+(-tester\.\d+)?$/.test(version)) {
  console.error("usage: set-version.mjs <x.y.z | x.y.z-tester.N>");
  process.exit(1);
}

const pkgUrl = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(await readFile(pkgUrl, "utf8"));
pkg.version = version;
await writeFile(pkgUrl, JSON.stringify(pkg, null, 2) + "\n");

const cargoUrl = new URL("../src-tauri/Cargo.toml", import.meta.url);
const cargo = await readFile(cargoUrl, "utf8");
// The first `version = ` line is [package]'s (dependencies come after it).
const updated = cargo.replace(/^version = "[^"]*"$/m, `version = "${version}"`);
if (updated === cargo && !cargo.includes(`version = "${version}"`)) throw new Error("no version line in Cargo.toml");
await writeFile(cargoUrl, updated);
console.log(`version ${version}`);
