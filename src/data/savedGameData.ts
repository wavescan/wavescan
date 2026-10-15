import type { KeyValueStorage } from "@/review/scanStore";
import { sha256Hex, type SignedFields } from "./signature";
import { validateScannerAssets, type LoadedScannerAssets, type ScannerAssetsFile } from "./scannerAssets";
import { validateScannerData, type ScannerDataFile } from "./scannerData";

// The last game data (and pictures) downloaded from Wuthering Tools, kept in the WebView's
// localStorage on this PC, so a launch without internet still uses it (ADR 0034). It's the
// same public file everyone downloads: nothing about the user is in it.
//
// It's checked again when read (format, hashes, signature), so a damaged copy, or one
// signed with a key a later version no longer trusts, is simply ignored.

export const SAVED_DATA_KEY = "wavescan.gameData";
export const SAVED_ASSETS_KEY = "wavescan.gameAssets";

/** Saved data, checked, with its pictures when they were saved too and still match. */
export interface SavedGameData {
  data: ScannerDataFile;
  assets: LoadedScannerAssets | null;
}

/**
 * Saves downloaded data, and its pictures when given (null keeps the saved pictures). A full
 * or blocked storage only means the next launch downloads again, so failures are ignored.
 */
export function saveGameData(
  storage: KeyValueStorage | null,
  data: ScannerDataFile,
  assets: ScannerAssetsFile | null,
): void {
  try {
    storage?.setItem(SAVED_DATA_KEY, JSON.stringify(data));
    if (assets) storage?.setItem(SAVED_ASSETS_KEY, JSON.stringify(assets));
  } catch (error) {
    console.warn("couldn't save the downloaded game data", error);
  }
}

function read(storage: KeyValueStorage | null, key: string): unknown {
  try {
    const text = storage?.getItem(key);
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

/**
 * The saved data if it's still valid (format, hash and signature), else null. Its pictures
 * are included only if they match the hash the data names.
 */
export async function loadSavedGameData(
  storage: KeyValueStorage | null,
  checkSignature: (file: SignedFields) => Promise<string | null>,
): Promise<SavedGameData | null> {
  const value = read(storage, SAVED_DATA_KEY);
  if (!value) return null;
  let data: ScannerDataFile;
  try {
    data = validateScannerData(value);
    if ((await sha256Hex(JSON.stringify(data.data))) !== data.hash) return null;
    if (await checkSignature(data)) return null;
  } catch {
    return null;
  }
  let assets: LoadedScannerAssets | null = null;
  try {
    const savedAssets = read(storage, SAVED_ASSETS_KEY);
    if (savedAssets) {
      const loaded = validateScannerAssets(savedAssets);
      const actual = await sha256Hex(JSON.stringify(loaded.file.data));
      if (actual === loaded.file.hash && actual === data.assets?.hash) assets = loaded;
    }
  } catch {
    // damaged pictures: the built-in ones are used and newer ones downloaded
  }
  return { data, assets };
}
