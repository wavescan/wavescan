import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveEchoByNameAndCost, matchEchoName } from "@wutheringtools/scanner-core";
import {
  loadBundledScannerData,
  SUPPORTED_DATA_VERSION,
  validateScannerData,
} from "@/data/scannerData";

const snapshot = JSON.parse(readFileSync("src/data/scanner-data.json", "utf8"));

describe("bundled scanner-data snapshot", () => {
  it("is intact: its hash matches its content", () => {
    const actual = createHash("sha256").update(JSON.stringify(snapshot.data)).digest("hex");
    expect(actual).toBe(snapshot.hash);
  });

  it("loads into scanner-core and identifies real echoes from OCR text", () => {
    const info = loadBundledScannerData();
    expect(info.hash).toBe(snapshot.hash);
    expect(info.echoes).toBeGreaterThan(200);
    expect(info.characters).toBeGreaterThan(50);
    // Names read from the fixtures in fixtures/screens/echoes (with typical OCR noise).
    expect(matchEchoName("Thousand-Puppet Pavilion")?.key).toBeTruthy();
    expect(resolveEchoByNameAndCost("Sabercat Prowlor", "ATK 100").echo).toBe("SabercatProwler");
    expect(resolveEchoByNameAndCost("Bell-Borne Geochelone", "ATK 150").echo).toBe("BellBorneGeochelone");
  });
});

describe("validateScannerData", () => {
  const clone = () => structuredClone(snapshot);

  it("accepts the snapshot", () => {
    expect(validateScannerData(clone()).hash).toBe(snapshot.hash);
  });

  it("rejects other files, unknown versions and missing tables", () => {
    expect(() => validateScannerData({ hello: "world" })).toThrow(/not a Wuthering Tools/);
    expect(() => validateScannerData({ ...clone(), version: SUPPORTED_DATA_VERSION + 1 })).toThrow(
      /unsupported/,
    );
    expect(() => validateScannerData({ ...clone(), hash: "nope" })).toThrow(/hash/);
    const noEchoes = clone();
    noEchoes.data.echoes = {};
    expect(() => validateScannerData(noEchoes)).toThrow(/no echoes/);
    const noLabels = clone();
    delete noLabels.data.verboseStatLabelMap;
    expect(() => validateScannerData(noLabels)).toThrow(/verboseStatLabelMap/);
  });
});
