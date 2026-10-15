import bundled from "./scanner-assets.json";
import { loadEchoIcons, useEchoIcons } from "./echoIcons";
import { loadSetIcons, useSetIcons } from "./setIcons";

// The pictures Wavescan uses, from Wuthering Tools' scanner-assets.json (WT ADR 0041): the
// set-icon references that recognise an echo's set, and the echo pictures on cards. A copy
// is bundled with each build; a newer one is downloaded at launch when scanner-data.json
// names a different hash (ADR 0034). Never hand-edit the bundled JSON: `npm run
// data:update` refreshes it.

/** The pictures format version this build understands. */
export const SUPPORTED_ASSETS_VERSION = 1;

export interface ScannerAssetsFile {
  format: "WutheringToolsScannerAssets";
  version: number;
  /** SHA-256 (hex) of `JSON.stringify(data)`; scanner-data.json names it, signed. */
  hash: string;
  data: {
    setIcons: { size: number; background: [number, number, number]; icons: Record<string, string> };
    echoIcons: { size: number; icons: Record<string, string> };
  };
}

/** A checked file with its pictures decoded, ready for `useScannerAssets`. */
export interface LoadedScannerAssets {
  file: ScannerAssetsFile;
  setIcons: ReturnType<typeof loadSetIcons>;
  echoIcons: ReturnType<typeof loadEchoIcons>;
}

/**
 * Checks that `value` is a pictures file this build can use and decodes it. Throws with a
 * specific message otherwise. Doesn't check the hash (gameDataDownload.ts does that for
 * downloads).
 */
export function validateScannerAssets(value: unknown): LoadedScannerAssets {
  const file = value as Partial<ScannerAssetsFile> | null;
  if (file?.format !== "WutheringToolsScannerAssets") throw new Error("not a Wuthering Tools pictures file");
  if (file.version !== SUPPORTED_ASSETS_VERSION) {
    throw new Error(`unsupported pictures version ${String(file.version)}`);
  }
  if (typeof file.hash !== "string" || !/^[0-9a-f]{64}$/.test(file.hash)) {
    throw new Error("pictures hash is missing or malformed");
  }
  const setIcons = loadSetIcons(file.data?.setIcons);
  if (setIcons.size === 0) throw new Error("pictures file has no set icons");
  return { file: file as ScannerAssetsFile, setIcons, echoIcons: loadEchoIcons(file.data?.echoIcons) };
}

/** Makes these the pictures used from now on. */
export function useScannerAssets(assets: LoadedScannerAssets): void {
  useSetIcons(assets.setIcons);
  useEchoIcons(assets.echoIcons);
}

/** The pictures bundled with this build, checked. Throws only if the build is broken. */
export function bundledScannerAssets(): LoadedScannerAssets {
  return validateScannerAssets(bundled);
}
