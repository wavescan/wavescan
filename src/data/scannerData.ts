import type { InjectionKey } from "vue";
import { setScannerGameData, type ScannerGameData } from "@wutheringtools/scanner-core";
import bundled from "./scanner-data.json";
import { bundledScannerAssets, useScannerAssets, type LoadedScannerAssets } from "./scannerAssets";

// Game data from Wuthering Tools (`https://www.wutheringtools.com/scanner-data.json`, WT ADR
// 0035). A snapshot is bundled with each build so scanning works offline and on first
// launch; `npm run data:update` refreshes it. A signed copy is downloaded at every launch
// (gameData.ts, ADR 0034).

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
  /** When WT's deploy built the file (ISO 8601). Missing in snapshots older than ADR 0034. */
  publishedAt?: string;
  /** The pictures file and its hash (WT ADR 0041). */
  assets?: { file: string; hash: string };
  /** Which key signed the file, and the signature (see signature.ts). Null when unsigned. */
  keyId?: string | null;
  signature?: string | null;
}

/** Provides the loaded data summary to components (see main.ts). */
export const GAME_DATA_KEY: InjectionKey<GameDataInfo> = Symbol("gameData");

/** Where the game data in use came from. */
export type GameDataSource = "built-in" | "saved" | "downloaded";

/**
 * Summary shown on the Help screen and in Diagnostics reports and bug reports, so every
 * report names its exact data. Reactive in the app: it changes when newer data is applied.
 */
export interface GameDataInfo {
  hash: string;
  version: number;
  echoes: number;
  characters: number;
  /** Built into this build, saved from an earlier launch, or downloaded on this launch. */
  source: GameDataSource;
  /** When Wuthering Tools published this data, if known. */
  publishedAt: string | null;
  /** When this launch last confirmed the data is current, or null if it couldn't. */
  checkedAt: string | null;
  /** Why the last download didn't give us newer data, or null. */
  problem: string | null;
  /** Wuthering Tools publishes a newer data format: only a Wavescan update can read it. */
  appUpdateNeeded: boolean;
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
  if (value.publishedAt !== undefined && typeof value.publishedAt !== "string") {
    throw new Error("scanner-data publishedAt is malformed");
  }
  const assets = value.assets;
  if (assets !== undefined && !(isRecord(assets) && typeof assets.file === "string" && typeof assets.hash === "string")) {
    throw new Error("scanner-data assets is malformed");
  }
  return value as unknown as ScannerDataFile;
}

/** Sonata set key → display name ("MoltenRift" → "Molten Rift"), from the loaded data. */
let setNames: Record<string, string> = {};

/** Every playable character (key + display name), from the loaded data. */
let characters: { key: string; name: string }[] = [];

/** Every playable character in the loaded data, Rover's per-element entries included. */
export function allCharacters(): readonly { key: string; name: string }[] {
  return characters;
}

/** A set's display name, or the key itself if the data doesn't know it. */
export function setName(key: string): string {
  return setNames[key] ?? key;
}

/** Every sonata set key in the loaded data, sorted by display name. */
export function allSetKeys(): string[] {
  return Object.keys(setNames).sort((a, b) => setName(a).localeCompare(setName(b)));
}

/**
 * Hands a validated data file to scanner-core (and the pictures, when given) and returns
 * its summary. Everything that reads game data sees the new data from the next call on.
 */
export function useScannerData(
  file: ScannerDataFile,
  assets: LoadedScannerAssets | null,
  source: GameDataSource,
): GameDataInfo {
  setScannerGameData(file.data);
  setNames = Object.fromEntries(Object.entries(file.data.echoSets).map(([key, set]) => [key, set.name]));
  characters = file.data.characters.map(({ key, name }) => ({ key, name }));
  if (assets) useScannerAssets(assets);
  return {
    hash: file.hash,
    version: file.version,
    echoes: Object.keys(file.data.echoes).length,
    characters: file.data.characters.length,
    source,
    publishedAt: file.publishedAt ?? null,
    checkedAt: null,
    problem: null,
    appUpdateNeeded: false,
  };
}

/** The data snapshot bundled with this build, checked. Throws only if the build is broken. */
export function bundledScannerData(): ScannerDataFile {
  return validateScannerData(bundled);
}

/** Loads the data and pictures bundled with this build. Used at startup and by tests. */
export function loadBundledScannerData(): GameDataInfo {
  return useScannerData(bundledScannerData(), bundledScannerAssets(), "built-in");
}

/**
 * One line naming the data in use, for bug reports and "copy details": hash, size, where it
 * came from, when it was published, and the last download problem if any.
 */
export function describeGameData(info: GameDataInfo | null): string {
  if (!info) return "?";
  const published = info.publishedAt ? `, published ${info.publishedAt.slice(0, 10)}` : "";
  const problem = info.problem ? `; last check: ${info.problem}` : "";
  return `${info.hash.slice(0, 8)} (${info.echoes} echoes, ${info.source}${published})${problem}`;
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** A plain-language status for the Help screen: is the data current, and if not, why. */
export function gameDataStatus(info: GameDataInfo): string {
  const copy = info.source === "saved" ? "the copy saved earlier" : "the copy built into this version";
  const from = info.publishedAt ? ` (from ${day(info.publishedAt)})` : "";
  if (info.appUpdateNeeded) return `Update Wavescan to get the newest game data. Using ${copy}${from}.`;
  if (info.problem) return `Couldn't get the newest game data (${info.problem}). Using ${copy}${from}.`;
  if (info.checkedAt) return `Up to date with Wuthering Tools${from}.`;
  return `Checking Wuthering Tools for newer game data… Using ${copy}${from}.`;
}
