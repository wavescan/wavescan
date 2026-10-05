// TypeScript mirrors of the Rust IPC types in `src-tauri/src/commands.rs`,
// `traits.rs`, `geometry.rs` and `error.rs`. Change both sides together (CLAUDE.md).

/** Basic facts about the running app, shown on the home and diagnostics screens. */
export interface AppInfo {
  name: string;
  version: string;
  /** Operating system the app was built for. */
  platform: "windows" | "macos" | "linux";
  /** Short commit id for CI-built tester/release builds; null for local builds. */
  build: string | null;
}

/** Every error a Rust command can return, serialized as `{ kind, message }`. */
export interface IpcError {
  kind: string;
  message: string;
}

/** Pixel rectangle (`geometry::Rect`). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rectangle as 0–1 fractions of the game's client area (`geometry::FracRect`). */
export interface FracRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The game window right now (`traits::GameWindow`). `id` is opaque. */
export interface GameWindow {
  id: number;
  client_rect: Rect;
  scale_factor: number;
  focused: boolean;
  minimized: boolean;
}

/** A window whose title mentions Wuthering Waves (`traits::WindowCandidate`). */
export interface WindowCandidate {
  title: string;
  class: string;
  matched: boolean;
}

export interface FrameInfo {
  seq: number;
  width: number;
  height: number;
}

export interface CaptureStatus {
  running: boolean;
  fps: number;
  frame: FrameInfo | null;
}

export interface OcrLine {
  text: string;
  bounds: Rect;
}

export interface OcrResult {
  lines: OcrLine[];
  elapsed_ms: number;
  width: number;
  height: number;
}

/** A point as 0–1 fractions of the game's client area (`geometry::FracPoint`). */
export interface FracPoint {
  x: number;
  y: number;
}

/** Why auto mode stopped (`safety::AbortReason`). */
export type AbortReason =
  | "UserInput"
  | "Hotkey"
  | "FocusLost"
  | "WindowGone"
  | "ActionCapReached"
  | "InvalidTarget"
  | "InputRejected"
  | "CheckFailed";

/** `safety::AutoModeState` as serialized by serde. */
export type AutoModeState = "Disarmed" | "Armed" | { Aborted: AbortReason };

export interface AutoModeStatus {
  state: AutoModeState;
  actions_used: number;
}
