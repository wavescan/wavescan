import { isSupportedAspect } from "@/diagnostics/regions";
import type { AppInfo, GameWindow } from "@/ipc/types";

// The "Game setup" checklist on Home. It only claims what Wavescan can actually check
// without capturing anything: that the game window exists, isn't minimised and has a
// supported shape, and (Windows) whether auto mode could run. Things it can't check yet
// (language, HDR, which screen is open) are listed as reminders, not as passed checks.

export type ReadinessStatus = "ok" | "todo" | "unknown";

export interface ReadinessItem {
  id: "game" | "visible" | "shape" | "admin";
  label: string;
  detail: string;
  status: ReadinessStatus;
}

export type WindowOutcome = { ok: true; value: GameWindow } | { ok: false; kind: string | null; message: string };

/** Reminders shown under the checklist: Wavescan can't detect these yet. */
export const SETUP_REMINDERS = [
  "Game language set to English",
  "HDR off in the game's graphics settings",
  "Bag → Echoes open, sorted by Level",
] as const;

export function readinessItems(window: WindowOutcome | null, app: AppInfo | null): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  if (!window) {
    items.push({ id: "game", label: "Game running", detail: "Checking…", status: "unknown" });
  } else if (!window.ok) {
    items.push({
      id: "game",
      label: "Game running",
      detail: window.kind === "WindowNotFound" ? "Start Wuthering Waves" : window.message,
      status: "todo",
    });
  } else {
    const { width, height } = window.value.client_rect;
    items.push({ id: "game", label: "Game running", detail: "Wuthering Waves window found", status: "ok" });
    items.push({
      id: "visible",
      label: "Window open",
      detail: window.value.minimized ? "It's minimised. Open it from the taskbar" : "Not minimised",
      status: window.value.minimized ? "todo" : "ok",
    });
    if (!window.value.minimized) {
      const supported = isSupportedAspect(width, height);
      items.push({
        id: "shape",
        label: "Screen shape",
        detail: supported ? `${width}×${height}` : `${width}×${height}: needs 16:9 or 16:10`,
        status: supported ? "ok" : "todo",
      });
    }
  }
  if (app?.platform === "windows") {
    items.push({
      id: "admin",
      label: "Auto mode allowed",
      detail:
        app.elevated === true
          ? "Running as administrator"
          : app.elevated === false
            ? "Only watch mode: auto mode needs Run as administrator"
            : "Couldn't tell if running as administrator",
      status: app.elevated === true ? "ok" : app.elevated === false ? "todo" : "unknown",
    });
  }
  return items;
}

/** "3 of 4 ready", counting only the checks that apply to watch mode (not "admin"). */
export function readinessSummary(items: ReadinessItem[]): { ready: number; total: number } {
  const relevant = items.filter((i) => i.id !== "admin");
  return { ready: relevant.filter((i) => i.status === "ok").length, total: relevant.length };
}
