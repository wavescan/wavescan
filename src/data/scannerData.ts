import type { InjectionKey } from "vue";
import { setScannerGameData, type ScannerGameData } from "@wutheringtools/scanner-core";
import bundled from "./scanner-data.json";

// Game data from Wuthering Tools (`https://wutheringtools.com/scanner-data.json`, WT ADR
// 0035). A snapshot is bundled with each build so scanning works offline and on first
// launch; `npm run data:update` refreshes it. A signed runtime refresh comes later (ADR 0020).

/** The data format version this build understands. */
export const SUPPORTED_DATA_VERSION = 1;

export interface ScannerDataPayload extends ScannerGameData {
  echoSets: Record<string, { name: string; icon: string | null }>;
  characters: { key: string; name: string; rarity: number; weapon: string }[];
  weapons: { key: string; name: string; type: string; rarity: number }[];
}

export interface ScannerDataFile {
  format: "WutheringToolsScannerData";
  version: number;
  /** SHA-256 (hex) of `JSON.stringify(data)`. */
  hash: string;
  data: ScannerDataPayload;
}

/** Provides the loaded data summary to components (see main.ts). */
export const GAME_DATA_KEY: InjectionKey<GameDataInfo> = Symbol("gameData");

/** Summary shown on the home screen and in Diagnostics reports. */
export interface GameDataInfo {
  hash: string;
  version: number;
  echoes: number;
  characters: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks that `value` is a scanner-data file this build can use. Throws with a specific
 * message otherwise. Used for the bundled snapshot now, and for downloaded copies later.
 */
export function validateScannerData(value: unknown): ScannerDataFile {
  if (!isRecord(value) || value.format !== "WutheringToolsScannerData") {
    throw new Error("not a Wuthering Tools scanner-data file");
  }
  if (value.version !== SUPPORTED_DATA_VERSION) {
    throw new Error(`unsupported scanner-data version ${String(value.version)}`);
  }
  if (typeof value.hash !== "string" || !/^[0-9a-f]{64}$/.test(value.hash)) {
    throw new Error("scanner-data hash is missing or malformed");
  }
  const data = value.data;
  if (!isRecord(data)) throw new Error("scanner-data has no data");
  for (const key of [
    "echoes",
    "echoCostByClass",
    "statsTable",
    "subStatsTable",
    "verboseStatLabelMap",
    "flatBonusesByRankByType",
    "echoSets",
  ]) {
    if (!isRecord(data[key])) throw new Error(`scanner-data is missing ${key}`);
  }
  if (!Array.isArray(data.characters) || !Array.isArray(data.weapons)) {
    throw new Error("scanner-data is missing characters or weapons");
  }
  if (Object.keys(data.echoes as object).length === 0) {
    throw new Error("scanner-data has no echoes");
  }
  return value as unknown as ScannerDataFile;
}

/** Hands a validated data file to scanner-core and returns its summary. */
export function useScannerData(file: ScannerDataFile): GameDataInfo {
  setScannerGameData(file.data);
  return {
    hash: file.hash,
    version: file.version,
    echoes: Object.keys(file.data.echoes).length,
    characters: file.data.characters.length,
  };
}

/** Loads the snapshot bundled with this build. Call once at startup. */
export function loadBundledScannerData(): GameDataInfo {
  return useScannerData(validateScannerData(bundled));
}
