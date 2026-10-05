import type {
  AppInfo,
  CaptureStatus,
  GameWindow,
  OcrResult,
  WindowCandidate,
} from "@/ipc/types";
import { isSupportedAspect } from "./regions";

// Builds the Diagnostics report testers paste back to us. It contains facts about the
// app, window, capture and OCR only. No images, no User ID, no other apps' window titles
// (Rust only lists titles containing "Wuthering").

export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

export interface Check {
  id: "window" | "capture" | "aspect" | "frame-size" | "ocr";
  label: string;
  status: CheckStatus;
  detail: string;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string; kind: string | null };

export interface OcrTest {
  id: string;
  label: string;
  outcome: Outcome<OcrResult>;
}

export interface DiagnosticsInput {
  app: AppInfo | null;
  userAgent: string;
  window: Outcome<GameWindow> | null;
  candidates: WindowCandidate[];
  capture: Outcome<CaptureStatus> | null;
  ocr: OcrTest[];
}

export interface DiagnosticsReport {
  format: "WavescanDiagnostics";
  version: 1;
  generatedAt: string;
  app: AppInfo | null;
  userAgent: string;
  checks: Check[];
  window: Outcome<GameWindow> | null;
  candidates: WindowCandidate[];
  capture: Outcome<CaptureStatus> | null;
  ocr: { id: string; label: string; ms?: number; size?: string; text?: string[]; error?: string }[];
}

/** Frame rate below this is flagged: the game may be paused, minimised or throttled. */
export const MIN_GOOD_FPS = 20;

export function buildChecks(input: DiagnosticsInput): Check[] {
  const checks: Check[] = [];
  const win = input.window;

  if (!win) {
    checks.push({ id: "window", label: "Find game window", status: "skipped", detail: "Not run" });
  } else if (!win.ok) {
    checks.push({ id: "window", label: "Find game window", status: "fail", detail: win.error });
  } else if (win.value.minimized) {
    checks.push({
      id: "window",
      label: "Find game window",
      status: "fail",
      detail: "Found, but minimised",
    });
  } else {
    const { width, height } = win.value.client_rect;
    checks.push({
      id: "window",
      label: "Find game window",
      status: win.value.focused ? "pass" : "warn",
      detail: `${width}×${height} at ${Math.round(win.value.scale_factor * 100)}% scale${
        win.value.focused ? "" : " (not focused; fine for watch mode)"
      }`,
    });
  }

  const cap = input.capture;
  if (!cap) {
    checks.push({ id: "capture", label: "Capture", status: "skipped", detail: "Not run" });
  } else if (!cap.ok) {
    checks.push({ id: "capture", label: "Capture", status: "fail", detail: cap.error });
  } else if (!cap.value.frame) {
    checks.push({ id: "capture", label: "Capture", status: "fail", detail: "No frames arrived" });
  } else {
    const fps = cap.value.fps;
    checks.push({
      id: "capture",
      label: "Capture",
      status: fps >= MIN_GOOD_FPS ? "pass" : "warn",
      detail: `${fps.toFixed(0)} frames/second`,
    });
  }

  const frame = cap?.ok ? cap.value.frame : null;
  if (frame) {
    const supported = isSupportedAspect(frame.width, frame.height);
    checks.push({
      id: "aspect",
      label: "Screen shape",
      status: supported ? "pass" : "fail",
      detail: `${frame.width}×${frame.height} (${(frame.width / frame.height).toFixed(3)}:1)${
        supported ? "" : ", needs 16:9 or 16:10"
      }`,
    });

    if (win?.ok) {
      const { width, height } = win.value.client_rect;
      const matches = width === frame.width && height === frame.height;
      checks.push({
        id: "frame-size",
        label: "Captured area matches the game",
        status: matches ? "pass" : "warn",
        detail: matches
          ? "Yes"
          : `Window ${width}×${height}, captured ${frame.width}×${frame.height}`,
      });
    }
  }

  if (input.ocr.length === 0) {
    checks.push({ id: "ocr", label: "Read text", status: "skipped", detail: "Not run" });
  } else {
    const failures = input.ocr.filter((t) => !t.outcome.ok);
    const empty = input.ocr.filter((t) => t.outcome.ok && t.outcome.value.lines.length === 0);
    const times = input.ocr.flatMap((t) => (t.outcome.ok ? [t.outcome.value.elapsed_ms] : []));
    const slowest = times.length ? Math.max(...times) : 0;
    checks.push({
      id: "ocr",
      label: "Read text",
      status: failures.length ? "fail" : empty.length ? "warn" : "pass",
      detail: failures.length
        ? (failures[0]?.outcome.ok === false ? failures[0].outcome.error : "OCR failed")
        : empty.length
          ? "No text found. Is an echo selected on Bag → Echoes?"
          : `Slowest region ${slowest.toFixed(0)} ms`,
    });
  }

  return checks;
}

export function buildReport(input: DiagnosticsInput, now: Date = new Date()): DiagnosticsReport {
  return {
    format: "WavescanDiagnostics",
    version: 1,
    generatedAt: now.toISOString(),
    app: input.app,
    userAgent: input.userAgent,
    checks: buildChecks(input),
    window: input.window,
    candidates: input.candidates,
    capture: input.capture,
    ocr: input.ocr.map(({ id, label, outcome }) =>
      outcome.ok
        ? {
            id,
            label,
            ms: Math.round(outcome.value.elapsed_ms),
            size: `${outcome.value.width}×${outcome.value.height}`,
            text: outcome.value.lines.map((l) => l.text),
          }
        : { id, label, error: outcome.error },
    ),
  };
}

export function formatReport(report: DiagnosticsReport): string {
  return JSON.stringify(report, null, 2);
}
