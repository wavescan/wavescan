import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { activity } from "@/feedback/activity";
import { isAllowedUrl } from "@/feedback/links";
import type {
  AppInfo,
  AutoModeStatus,
  CaptureStatus,
  FracPoint,
  FracRect,
  GameWindow,
  IpcError,
  OcrResult,
  RegionRead,
  RegionText,
  WindowCandidate,
} from "./types";

// One typed wrapper per Rust command. Views call these, never `invoke` directly,
// so the command names and argument shapes live in exactly one place.

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}

export function findGameWindow(): Promise<GameWindow> {
  return invoke<GameWindow>("find_game_window");
}

export function getWindowCandidates(): Promise<WindowCandidate[]> {
  return invoke<WindowCandidate[]>("window_candidates");
}

export async function startCapture(maxFps: number): Promise<GameWindow> {
  const window = await invoke<GameWindow>("start_capture", { maxFps });
  activity.capturesStarted += 1;
  return window;
}

export function stopCapture(): Promise<void> {
  return invoke<void>("stop_capture");
}

export function getCaptureStatus(): Promise<CaptureStatus> {
  return invoke<CaptureStatus>("capture_status");
}

/** Raw preview bytes: `[width u32 LE][height u32 LE][RGBA…]`. Decode with `decodePreview`. */
export function getCapturePreview(maxWidth: number): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("capture_preview", { maxWidth });
}

export function ocrRegion(region: FracRect): Promise<OcrResult> {
  return invoke<OcrResult>("ocr_region", { region });
}

export function getAutoModeStatus(): Promise<AutoModeStatus> {
  return invoke<AutoModeStatus>("auto_mode_status");
}

/** Arms auto mode. `confirmation` must be the phrase shown with the Fair Play warning. */
export function armAutoMode(confirmation: string): Promise<AutoModeStatus> {
  return invoke<AutoModeStatus>("arm_auto_mode", { confirmation });
}

export function disarmAutoMode(): Promise<AutoModeStatus> {
  return invoke<AutoModeStatus>("disarm_auto_mode");
}

export function autoFocusGame(): Promise<AutoModeStatus> {
  return invoke<AutoModeStatus>("auto_focus_game");
}

export async function autoClick(target: FracPoint): Promise<AutoModeStatus> {
  const status = await invoke<AutoModeStatus>("auto_click", { target });
  activity.clicks += 1;
  return status;
}

/**
 * Scrolls the mouse wheel `ticks` notches at `target` (negative scrolls down), through the
 * same auto-mode checks as a click. At most 40 notches either way.
 */
export async function autoScroll(target: FracPoint, ticks: number): Promise<AutoModeStatus> {
  const status = await invoke<AutoModeStatus>("auto_scroll", { target, ticks });
  activity.scrolls += 1;
  return status;
}

/**
 * Small RGBA images of `regions` from the latest frame (for change detection), and pins
 * that frame for `readRegions`. Decode with `decodeSamples`.
 */
export function sampleRegions(regions: FracRect[], maxWidth: number): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("sample_regions", { regions, maxWidth });
}

/** OCRs `regions` of the frame pinned by the last `sampleRegions` call (`seq`). */
export function readRegions(seq: number, regions: RegionRead[]): Promise<RegionText[]> {
  return invoke<RegionText[]>("read_regions", { seq, regions });
}

/**
 * Full-size RGBA crops of `regions` from the frame pinned by `sampleRegions` (`seq`), for the
 * Tesseract reader on Windows (ADR 0027). Same User ID guard as `readRegions`. Decode with
 * `decodeCrops`.
 */
export function cropRegions(seq: number, regions: FracRect[]): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("crop_regions", { seq, regions });
}

/**
 * Opens a GitHub page (or the Fair Play policy) in the user's browser. Only URLs in
 * `src/feedback/links.ts` are allowed, and Rust's opener scope enforces the same list
 * (ADR 0028). Wavescan itself makes no connection; the browser does.
 */
export async function openUrl(url: string): Promise<void> {
  if (!isAllowedUrl(url)) throw new Error("Wavescan doesn't open that address");
  await invoke<void>("plugin:opener|open_url", { url });
  activity.pagesOpened += 1;
}

/** Normal window size, restored when leaving the mini window. */
const NORMAL_SIZE = { width: 1100, height: 760, minWidth: 720, minHeight: 520 };
/** The mini window: a small always-on-top counter for one-screen setups (ADR 0028). */
const MINI_SIZE = { width: 340, height: 220 };

/** Shrinks the app to the always-on-top mini window, or back to normal. */
export async function setMiniWindow(mini: boolean): Promise<void> {
  const window = getCurrentWindow();
  if (mini) {
    await window.setMinSize(new LogicalSize(MINI_SIZE.width, MINI_SIZE.height));
    await window.setSize(new LogicalSize(MINI_SIZE.width, MINI_SIZE.height));
    await window.setAlwaysOnTop(true);
  } else {
    await window.setAlwaysOnTop(false);
    await window.setSize(new LogicalSize(NORMAL_SIZE.width, NORMAL_SIZE.height));
    await window.setMinSize(new LogicalSize(NORMAL_SIZE.minWidth, NORMAL_SIZE.minHeight));
  }
}

/** Turns whatever a failed command rejected with into a readable message. */
export function errorMessage(error: unknown): string {
  if (isIpcError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** The error `kind` from Rust (e.g. "WindowNotFound"), or null for other failures. */
export function errorKind(error: unknown): string | null {
  return isIpcError(error) ? error.kind : null;
}

function isIpcError(error: unknown): error is IpcError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as IpcError).kind === "string" &&
    typeof (error as IpcError).message === "string"
  );
}
