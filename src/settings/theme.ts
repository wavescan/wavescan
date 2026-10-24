import { reactive } from "vue";
import type { KeyValueStorage } from "@/review/scanStore";

// How Wavescan looks: one of three colour schemes, dark or light (ADR 0036). Echo Glass dark
// is the default because it matches the game's echo screen. The choice is kept in the
// webview's localStorage on this PC only; it's never exported or put in a report.
//
// The schemes themselves are daisyUI themes in src/style.css, named
// `wavescan-<scheme>-<dark|light>`. This module only decides which one is on, and sets it as
// `data-theme` on the page.

export const SCHEMES = ["glass", "solaris", "jade"] as const;
export type Scheme = (typeof SCHEMES)[number];

/** "system" follows the computer's dark/light setting. */
export const MODES = ["dark", "light", "system"] as const;
export type Mode = (typeof MODES)[number];

export interface ThemeChoice {
  scheme: Scheme;
  mode: Mode;
}

export const THEME_KEY = "wavescan.theme";
export const DEFAULT_THEME: ThemeChoice = { scheme: "glass", mode: "dark" };

/** What the picker shows for each scheme. */
export const SCHEME_INFO: Record<Scheme, { name: string; from: string }> = {
  glass: { name: "Echo Glass", from: "The game's echo screen" },
  solaris: { name: "Solaris Gold", from: "The official website" },
  jade: { name: "Jade & Blossom", from: "The Jinzhou artwork" },
};

/** The daisyUI theme name for a choice. `prefersDark` is the system setting, used for "system". */
export function themeName(choice: ThemeChoice, prefersDark: boolean): string {
  const dark = choice.mode === "dark" || (choice.mode === "system" && prefersDark);
  return `wavescan-${choice.scheme}-${dark ? "dark" : "light"}`;
}

/**
 * Reads a saved choice. Anything missing or unknown (an older build, a damaged value) falls
 * back to the default for that part, so a bad value never leaves the app unstyled.
 */
export function parseTheme(text: string | null): ThemeChoice {
  try {
    const saved = JSON.parse(text ?? "null") as Partial<Record<keyof ThemeChoice, unknown>> | null;
    const scheme = SCHEMES.find((s) => s === saved?.scheme) ?? DEFAULT_THEME.scheme;
    const mode = MODES.find((m) => m === saved?.mode) ?? DEFAULT_THEME.mode;
    return { scheme, mode };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // no window (tests) or storage blocked
  }
}

let storage: KeyValueStorage | null = browserStorage();
const current = reactive<ThemeChoice>(read());

function read(): ThemeChoice {
  try {
    return parseTheme(storage?.getItem(THEME_KEY) ?? null);
  } catch {
    return { ...DEFAULT_THEME };
  }
}

/** The current choice. Reactive, so the picker updates when it changes. */
export function theme(): Readonly<ThemeChoice> {
  return current;
}

/** Changes the scheme and/or mode, saves it, and applies it to the page. */
export function setTheme(change: Partial<ThemeChoice>): void {
  Object.assign(current, change);
  try {
    storage?.setItem(THEME_KEY, JSON.stringify({ scheme: current.scheme, mode: current.mode }));
  } catch {
    // Storage full or blocked: the look still applies until the app closes.
  }
  applyTheme();
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return true; // no window (tests): the game is dark, so dark is the safer guess
  }
}

/** Sets the current theme on the page (`<html data-theme>`). Does nothing without a page. */
export function applyTheme(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = themeName(current, systemPrefersDark());
}

/**
 * Applies the saved theme now and keeps "system" in step when the computer switches between
 * dark and light. Call once at startup, before the app is mounted, so it never flashes.
 */
export function startTheme(): void {
  applyTheme();
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (current.mode === "system") applyTheme();
    });
  } catch {
    // No matchMedia: "system" just uses the setting it had at startup.
  }
}

/** Swaps the storage (tests use a Map) and reloads the choice from it. */
export function useThemeStorage(next: KeyValueStorage | null): void {
  storage = next;
  Object.assign(current, read());
}
