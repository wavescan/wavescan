import { reactive, watch } from "vue";
import type { KeyValueStorage } from "@/review/scanStore";
import { navigation } from "@/ui/navigation";
import { checkSignature, type SignedFields } from "./signature";
import { bundledScannerAssets, type LoadedScannerAssets } from "./scannerAssets";
import { bundledScannerData, useScannerData, type GameDataInfo, type GameDataSource, type ScannerDataFile } from "./scannerData";
import { downloadGameData, type DownloadDeps } from "./gameDataDownload";
import { loadSavedGameData, saveGameData } from "./savedGameData";

// Which game data Wavescan uses, and keeping it current (ADR 0034):
//
// 1. Startup (`startGameData`): the data built into this build, or the copy saved by an
//    earlier launch when that's newer. Scanning works straight away, with or without internet.
// 2. Right after (`refreshGameData`): download the newest data from Wuthering Tools. If it
//    passes every check (gameDataDownload.ts), save it and switch to it. A scan in progress
//    finishes with the data it started with; the switch happens when it ends.
//
// There's no setting to turn this off: stale data means misread echoes, and the download
// sends nothing about the user. Offline, the app keeps working with what it has.

/** What startup and refresh need from the outside world, so tests can fake it. */
export interface GameDataDeps extends DownloadDeps {
  storage: KeyValueStorage | null;
  /** The current time (ISO strings are stored in the summary). */
  now: () => Date;
  /** Runs `apply` now, or once no scan is running. */
  whenIdle: (apply: () => void) => void;
}

/** The hash of the pictures in use (null if unknown), to tell when newer ones exist. */
let assetsHashInUse: string | null = null;
let dataHashInUse = "";

function apply(
  info: GameDataInfo,
  data: ScannerDataFile,
  assets: LoadedScannerAssets | null,
  source: GameDataSource,
): void {
  const { checkedAt, problem, appUpdateNeeded } = info;
  Object.assign(info, useScannerData(data, assets, source), { checkedAt, problem, appUpdateNeeded });
  dataHashInUse = data.hash;
  if (assets) assetsHashInUse = assets.file.hash;
}

/**
 * Saved data is used only when it's newer than what this build bundles, so updating the
 * app never goes back to older saved data. A snapshot from before ADR 0034 has no date and
 * counts as oldest.
 */
export function isNewer(saved: ScannerDataFile, bundled: ScannerDataFile): boolean {
  return saved.hash !== bundled.hash && (saved.publishedAt ?? "") > (bundled.publishedAt ?? "");
}

/**
 * Loads the game data to start with: the bundled snapshot, or the saved download when it's
 * newer. Returns the summary, reactive, which `refreshGameData` keeps up to date.
 */
export async function startGameData(deps: Pick<GameDataDeps, "storage" | "checkSignature">): Promise<GameDataInfo> {
  const bundled = bundledScannerData();
  const assets = bundledScannerAssets();
  const info = reactive(useScannerData(bundled, assets, "built-in"));
  dataHashInUse = bundled.hash;
  assetsHashInUse = assets.file.hash;
  const verify = deps.checkSignature ?? ((file: SignedFields) => checkSignature(file));
  const saved = await loadSavedGameData(deps.storage, verify);
  if (saved && isNewer(saved.data, bundled)) apply(info, saved.data, saved.assets, "saved");
  return info;
}

/**
 * Downloads the newest game data and switches to it when it's valid and different. Updates
 * `info` with the outcome (checked time, or the problem). Never throws.
 */
export async function refreshGameData(info: GameDataInfo, deps: GameDataDeps): Promise<void> {
  const result = await downloadGameData({ dataHash: dataHashInUse, assetsHash: assetsHashInUse }, deps);
  const now = deps.now().toISOString();
  switch (result.kind) {
    case "current":
      Object.assign(info, { checkedAt: now, problem: null, appUpdateNeeded: false });
      return;
    case "updated":
      saveGameData(deps.storage, result.data, result.assets?.file ?? null);
      deps.whenIdle(() => {
        apply(info, result.data, result.assets, "downloaded");
        Object.assign(info, { checkedAt: now, problem: null, appUpdateNeeded: false });
      });
      return;
    case "appUpdateNeeded":
      Object.assign(info, { problem: result.reason, appUpdateNeeded: true });
      return;
    case "failed":
      Object.assign(info, { problem: result.reason });
      return;
  }
}

/** `whenIdle` for the app: applies now, or when the running scan ends. */
export function whenNotScanning(applyNow: () => void): void {
  if (!navigation.busy) {
    applyNow();
    return;
  }
  const stop = watch(
    () => navigation.busy,
    (busy) => {
      if (busy) return;
      stop();
      applyNow();
    },
  );
}
