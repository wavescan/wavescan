import { activity } from "@/feedback/activity";
import { checkSignature, sha256Hex, type SignedFields } from "./signature";
import { SUPPORTED_ASSETS_VERSION, validateScannerAssets, type LoadedScannerAssets } from "./scannerAssets";
import { SUPPORTED_DATA_VERSION, validateScannerData, type ScannerDataFile } from "./scannerData";

// Downloads the newest game data from Wuthering Tools and decides whether it can be used
// (ADR 0034). Nothing here applies or saves anything: gameData.ts does that with the result.
//
// A download is used only if every check passes:
// 1. it's a scanner-data file in a format this build understands
// 2. its hash matches its content
// 3. its signature is valid, from a key built into this build (signature.ts)
// 4. its pictures, when they changed, match the hash the signed file names
// Anything else keeps the data already in use, and the reason is shown in Diagnostics.

/** The one game-data address Wavescan contacts (README "internet connections"). */
export const SCANNER_DATA_URL = "https://www.wutheringtools.com/scanner-data.json";

/** Larger than either file will plausibly get (about 0.1 MB and 1 MB today). */
export const MAX_DOWNLOAD_CHARS = 8_000_000;

/** What the download needs from the outside world, so tests can fake it. */
export interface DownloadDeps {
  /** Downloads a URL as text. Throws on network errors and non-2xx responses. */
  fetchText: (url: string) => Promise<string>;
  /** Checks the signature: null when valid, else why not. Defaults to the built-in keys. */
  checkSignature?: (file: SignedFields) => Promise<string | null>;
}

/** The hashes of the data and pictures in use, to tell whether a download is newer. */
export interface CurrentHashes {
  dataHash: string;
  assetsHash: string | null;
}

export type DownloadResult =
  /** Wuthering Tools publishes exactly what's in use. */
  | { kind: "current"; publishedAt: string | null }
  /** Newer data (and, when they changed, pictures; null = keep the current ones). */
  | { kind: "updated"; data: ScannerDataFile; assets: LoadedScannerAssets | null }
  /** Wuthering Tools publishes a newer format: only a Wavescan update can read it. */
  | { kind: "appUpdateNeeded"; reason: string }
  /** Offline, or the file failed a check. */
  | { kind: "failed"; reason: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function download(deps: DownloadDeps, url: string): Promise<unknown> {
  const text = await deps.fetchText(url);
  if (text.length > MAX_DOWNLOAD_CHARS) throw new Error(`${url} is too large`);
  return JSON.parse(text) as unknown;
}

/** The pictures address: next to scanner-data.json, and only a plain file name there. */
function assetsUrl(file: string): string {
  if (!/^[a-z0-9-]+\.json$/.test(file)) throw new Error(`unexpected pictures file name "${file}"`);
  return new URL(file, SCANNER_DATA_URL).href;
}

/**
 * Downloads scanner-data.json (and scanner-assets.json when its hash differs from
 * `current.assetsHash`) and checks them. Never throws: every problem becomes a "failed"
 * result with a reason a person can read.
 */
export async function downloadGameData(current: CurrentHashes, deps: DownloadDeps): Promise<DownloadResult> {
  const verify = deps.checkSignature ?? ((file: SignedFields) => checkSignature(file));
  let data: ScannerDataFile;
  try {
    const value = await download(deps, SCANNER_DATA_URL);
    const version = (value as { version?: unknown } | null)?.version;
    if (typeof version === "number" && version > SUPPORTED_DATA_VERSION) {
      return { kind: "appUpdateNeeded", reason: `game data format ${version} needs a newer Wavescan` };
    }
    data = validateScannerData(value);
  } catch (error) {
    return { kind: "failed", reason: `couldn't download game data: ${message(error)}` };
  }
  try {
    if ((await sha256Hex(JSON.stringify(data.data))) !== data.hash) {
      return { kind: "failed", reason: "the downloaded game data doesn't match its hash" };
    }
    const problem = await verify(data);
    if (problem) return { kind: "failed", reason: `downloaded game data not used: ${problem}` };
  } catch (error) {
    return { kind: "failed", reason: `couldn't check the downloaded game data: ${message(error)}` };
  }
  // Signed files always name their pictures (checkSignature requires it).
  const assetsRef = data.assets as { file: string; hash: string };
  const assetsChanged = assetsRef.hash !== current.assetsHash;
  if (data.hash === current.dataHash && !assetsChanged) {
    return { kind: "current", publishedAt: data.publishedAt ?? null };
  }
  if (!assetsChanged) return { kind: "updated", data, assets: null };

  try {
    const value = await download(deps, assetsUrl(assetsRef.file));
    const version = (value as { version?: unknown } | null)?.version;
    if (typeof version === "number" && version > SUPPORTED_ASSETS_VERSION) {
      return { kind: "appUpdateNeeded", reason: `pictures format ${version} needs a newer Wavescan` };
    }
    const assets = validateScannerAssets(value);
    const actual = await sha256Hex(JSON.stringify(assets.file.data));
    if (assets.file.hash !== assetsRef.hash || actual !== assetsRef.hash) {
      return { kind: "failed", reason: "the downloaded pictures don't match the signed game data" };
    }
    return { kind: "updated", data, assets };
  } catch (error) {
    return { kind: "failed", reason: `couldn't download the pictures: ${message(error)}` };
  }
}

/**
 * Downloads a URL as text with the WebView's fetch: no cookies, no referrer, a time limit.
 * Counted in "What Wavescan did this session".
 */
export async function browserFetchText(url: string): Promise<string> {
  activity.downloads++;
  const res = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
