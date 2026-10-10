import { reactive } from "vue";

// "What Wavescan did this session", shown in Help & feedback. Counted at the IPC boundary
// (src/ipc/commands.ts) each time the app asks Rust to do something the user may care about,
// so it covers every screen. In memory only; it starts again at zero each launch.

export interface Activity {
  /** When the app started (ISO). */
  since: string;
  /** Times capture of the game window was started. */
  capturesStarted: number;
  /** Clicks sent to the game (auto mode and the Diagnostics click test only). */
  clicks: number;
  /** Mouse-wheel scrolls sent to the game (auto mode only). */
  scrolls: number;
  /** Pages opened in the user's browser (GitHub links). */
  pagesOpened: number;
}

export function createActivity(now: () => Date = () => new Date()): Activity {
  return reactive({ since: now().toISOString(), capturesStarted: 0, clicks: 0, scrolls: 0, pagesOpened: 0 });
}

/** The app's activity record. */
export const activity = createActivity();
