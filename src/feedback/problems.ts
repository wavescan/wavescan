import type { AutoScanStop } from "@/auto/autoScan";

// Turns an error from Rust (its `kind`, see src-tauri/src/error.rs) or the reason an auto
// scan ended into a card that says what went wrong and what to do about it. The technical
// message stays available under "Details" and goes into bug reports.

export interface Problem {
  /** Short headline in plain words. */
  title: string;
  /** One or two sentences on the likely cause. */
  cause: string;
  /** Numbered fix steps. Empty when there's nothing to do. */
  steps: string[];
  /** "warn" for things the user can fix quickly, "error" for things that stopped a scan. */
  tone: "warn" | "error" | "info" | "success";
  /** Whether "Report this" should be offered (not for problems with an obvious fix). */
  reportable: boolean;
}

type Platform = "windows" | "macos" | "linux" | null;

/** Guidance for a Rust error kind. Unknown kinds get a generic card showing the message. */
export function problemForError(kind: string | null, message: string, platform: Platform): Problem {
  const mac = platform === "macos";
  switch (kind) {
    case "WindowNotFound":
      return {
        title: "Wuthering Waves isn't running",
        cause: "Wavescan couldn't find the game window.",
        steps: ["Start Wuthering Waves", "Wait for the main screen, then try again"],
        tone: "warn",
        reportable: false,
      };
    case "WindowMinimized":
      return {
        title: "The game is minimised",
        cause: "Wavescan can only read the game while its window is open.",
        steps: ["Click the game in the taskbar" + (mac ? " (Dock)" : ""), "Try again"],
        tone: "warn",
        reportable: false,
      };
    case "PermissionDenied":
      return mac
        ? {
            title: "macOS needs your permission",
            cause: message,
            steps: [
              "Open System Settings → Privacy & Security",
              "Under Screen Recording (and Accessibility, for auto mode), turn on Wavescan",
              "Quit and reopen Wavescan",
            ],
            tone: "warn",
            reportable: false,
          }
        : {
            title: "Windows refused access",
            cause: message,
            steps: ["Close Wavescan and open it again", "If it keeps happening, run Diagnostics and report it"],
            tone: "error",
            reportable: true,
          };
    case "InputBlocked":
      return {
        title: "Clicks aren't reaching the game",
        cause: mac
          ? "macOS blocked the click. Auto mode needs the Accessibility permission."
          : "Windows blocks clicks from normal apps into the game. Auto mode needs Wavescan to run as administrator. Watch mode works without it.",
        steps: mac
          ? ["Open System Settings → Privacy & Security → Accessibility", "Turn on Wavescan, then try again"]
          : ["Close Wavescan", "Right-click it and choose Run as administrator"],
        tone: "error",
        reportable: false,
      };
    case "CaptureFailed":
      return {
        title: "Couldn't capture the game",
        cause: "Wavescan couldn't get pictures of the game window.",
        steps: ["Make sure the game isn't minimised", "Turn HDR off in the game", "Try again, then run Diagnostics"],
        tone: "error",
        reportable: true,
      };
    case "OcrUnavailable":
    case "OcrFailed":
      return {
        title: "Couldn't read the text",
        cause: "The text reader failed on this echo.",
        steps: ["Click the echo again in the game", "If it keeps failing, report it"],
        tone: "error",
        reportable: true,
      };
    case "FrameExpired":
      return {
        title: "The game changed too fast",
        cause: "The picture Wavescan was reading was replaced before it finished.",
        steps: ["Click the echo again in the game"],
        tone: "warn",
        reportable: false,
      };
    case "AutoModeAborted":
      return {
        title: "Auto mode stopped",
        cause: message,
        steps: [],
        tone: "info",
        reportable: false,
      };
    case "Unsupported":
      return {
        title: "Not supported on this system",
        cause: "This feature isn't available on your operating system yet.",
        steps: [],
        tone: "error",
        reportable: false,
      };
    default:
      return {
        title: "Something went wrong",
        cause: message,
        steps: ["Try again", "If it keeps happening, run Diagnostics and report it"],
        tone: "error",
        reportable: true,
      };
  }
}

/** Guidance for how an auto scan ended. `detail` is the navigator's own explanation. */
export function problemForAutoStop(reason: AutoScanStop, detail: string, echoes: number): Problem {
  const kept = echoes > 0 ? ` The ${echoes} echoes it read are kept.` : "";
  switch (reason) {
    case "end-of-list":
    case "below-min-level":
      return { title: "Auto scan finished", cause: detail, steps: [], tone: "success", reportable: false };
    case "stopped":
      return { title: "You stopped the scan", cause: detail + kept, steps: [], tone: "info", reportable: false };
    case "aborted":
      return {
        title: "Auto mode stopped for safety",
        cause: detail + kept,
        steps: ["Keep the mouse still and the game in front while it runs", "Start again to carry on"],
        tone: "warn",
        reportable: false,
      };
    case "unsupported-shape":
      return {
        title: "The game window isn't 16:9 or 16:10",
        cause: detail,
        steps: ["In the game's display settings, pick a 16:9 or 16:10 resolution", "Start again"],
        tone: "error",
        reportable: false,
      };
    case "grid-not-found":
      return {
        title: "This isn't the echo list",
        cause: detail,
        steps: ["In the game, open Bag → Echoes", "Close any menu on top of it", "Start again"],
        tone: "error",
        reportable: false,
      };
    case "clicks-not-landing":
      return {
        title: "Clicks aren't reaching the game",
        cause: detail,
        steps: ["Run Wavescan as administrator (Windows) or allow Accessibility (Mac)", "Start again"],
        tone: "error",
        reportable: true,
      };
    case "lost-track":
      return {
        title: "Auto mode lost its place",
        cause: `${detail} It stopped instead of guessing.${kept}`,
        steps: ["Review and export what you have now, or", "Scroll the game back to the top and start again"],
        tone: "warn",
        reportable: true,
      };
    case "not-started":
      return {
        title: "Auto scan didn't start",
        cause: detail,
        steps: [],
        tone: "error",
        reportable: true,
      };
  }
}
