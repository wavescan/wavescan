import { ref } from "vue";
import type { KeyValueStorage } from "@/review/scanStore";

// The name the player gave the main character in game ("Clover"). The echo panel shows it
// instead of "Rover" ("Equipped by Clover"), so it's the only way to tell an echo equipped by
// the main character (src/session/equippedBy.ts). Kept in the webview's localStorage on this
// PC only: it's never exported (the scan file says "Rover"), and Diagnostics and bug reports
// hide it (`redactPlayerName`). See ADR 0030.

export const PLAYER_NAME_KEY = "wavescan.playerName";

/** Longer than any in-game name; just stops a pasted paragraph. */
export const MAX_PLAYER_NAME_LENGTH = 32;

function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // no window (tests) or storage blocked
  }
}

let storage: KeyValueStorage | null = browserStorage();
const name = ref<string | null>(read());

function read(): string | null {
  try {
    return storage?.getItem(PLAYER_NAME_KEY) || null;
  } catch {
    return null;
  }
}

/** The player's in-game name, or null when they haven't entered it. Reactive. */
export function playerName(): string | null {
  return name.value;
}

/** Saves the in-game name. Blank clears it. */
export function setPlayerName(value: string): void {
  const trimmed = value.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
  name.value = trimmed || null;
  try {
    if (name.value) storage?.setItem(PLAYER_NAME_KEY, name.value);
    else storage?.removeItem(PLAYER_NAME_KEY);
  } catch {
    // Storage full or blocked: the name still applies until the app closes.
  }
}

/** Swaps the storage (tests use a Map) and reloads the name from it. */
export function usePlayerNameStorage(next: KeyValueStorage | null): void {
  storage = next;
  name.value = read();
}
