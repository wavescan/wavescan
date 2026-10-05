import { invoke } from "@tauri-apps/api/core";
import type {
  AppInfo,
  CaptureStatus,
  FracRect,
  GameWindow,
  IpcError,
  OcrResult,
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

export function startCapture(maxFps: number): Promise<GameWindow> {
  return invoke<GameWindow>("start_capture", { maxFps });
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
