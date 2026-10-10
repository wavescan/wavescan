import { reactive } from "vue";
import type { ExtractedEcho } from "@/session/echoExtract";
import type { EchoCandidate } from "@/session/echoSession";

// The echoes scanned so far, shared by the Scan, Review and Home screens. Both modes add to
// the same list. Fixes replace a candidate (fields.ts returns new objects) and the first
// version of each is kept so "Undo my changes" can restore it.
//
// The list is also kept in the webview's localStorage so a scan survives closing the app
// before exporting. It holds only what the export holds plus the raw OCR text of the echo
// panel (never pictures, never the User ID region, which is never read). See
// docs/architecture.md "Saved scan".

export type ScanMode = "watch" | "auto";

export interface ScanState {
  /** Oldest first. */
  candidates: EchoCandidate[];
  /** id → the candidate as first read, before any fix. */
  originals: Record<string, EchoCandidate>;
  /** Which mode added the most recent echoes (goes in the export's `meta.mode`). */
  mode: ScanMode;
  /** Game frame size the echoes were read at (export `meta.resolution`). */
  resolution: { width: number; height: number };
  /** When the list last changed (ISO), shown as "today 14:12" on Home. */
  updatedAt: string | null;
}

/** The parts of `Storage` the store uses (localStorage in the app, a Map in tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = "wavescan.scan.v1";

interface SavedScan {
  version: 1;
  state: ScanState;
}

function emptyState(): ScanState {
  return { candidates: [], originals: {}, mode: "watch", resolution: { width: 0, height: 0 }, updatedAt: null };
}

/** Reads a saved scan, or null if there's none or it isn't one this build understands. */
export function loadSaved(storage: KeyValueStorage | null): ScanState | null {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return null;
    const saved = JSON.parse(text) as Partial<SavedScan>;
    const state = saved.state;
    if (saved.version !== 1 || !state || !Array.isArray(state.candidates)) return null;
    return state.candidates.length > 0 ? state : null;
  } catch {
    return null; // storage blocked or the saved text is damaged: start fresh
  }
}

export function createScanStore(storage: KeyValueStorage | null, now: () => Date = () => new Date()) {
  const state = reactive<ScanState>(emptyState());
  /** The scan found in storage at startup, until the user continues or discards it. */
  const restorable = reactive<{ scan: ScanState | null }>({ scan: loadSaved(storage) });

  function persist() {
    try {
      if (state.candidates.length === 0) storage?.removeItem(STORAGE_KEY);
      else storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state } satisfies SavedScan));
    } catch {
      // Storage full or blocked. The scan is still in memory; only the safety copy is lost.
    }
  }

  function touch() {
    state.updatedAt = now().toISOString();
    restorable.scan = null; // a new scan replaces the saved one
    persist();
  }

  return {
    state,
    restorable,

    /** Adds a freshly read echo, numbered after everything already in the list. */
    add(echo: ExtractedEcho, mode: ScanMode): EchoCandidate {
      const index = (state.candidates.at(-1)?.index ?? 0) + 1;
      const candidate: EchoCandidate = { ...echo, id: `${mode}-${index}`, index };
      state.candidates.push(candidate);
      state.originals[candidate.id] = candidate;
      state.mode = mode;
      touch();
      return candidate;
    },

    /** Replaces a candidate with a fixed copy (from fields.ts). */
    update(next: EchoCandidate) {
      const i = state.candidates.findIndex((c) => c.id === next.id);
      if (i === -1) return;
      state.candidates[i] = next;
      touch();
    },

    /** Puts an echo back the way it was first read. */
    undo(id: string) {
      const original = state.originals[id];
      const i = state.candidates.findIndex((c) => c.id === id);
      if (!original || i === -1) return;
      state.candidates[i] = original;
      touch();
    },

    remove(id: string) {
      state.candidates = state.candidates.filter((c) => c.id !== id);
      delete state.originals[id];
      touch();
    },

    get(id: string): EchoCandidate | undefined {
      return state.candidates.find((c) => c.id === id);
    },

    setResolution(size: { width: number; height: number }) {
      if (size.width > 0 && size.height > 0) state.resolution = { ...size };
    },

    /** Starts a new, empty scan and forgets the saved copy. */
    clear() {
      Object.assign(state, emptyState());
      restorable.scan = null;
      persist();
    },

    /** Carries on with the scan saved last time. */
    restore() {
      if (!restorable.scan) return;
      Object.assign(state, restorable.scan);
      restorable.scan = null;
      persist();
    },

    /** Forgets the scan saved last time. */
    discardSaved() {
      restorable.scan = null;
      if (state.candidates.length === 0) persist();
    },
  };
}

export type ScanStore = ReturnType<typeof createScanStore>;

function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The app's one store (created on first use). */
let appStore: ScanStore | null = null;

export function useScanStore(): ScanStore {
  appStore ??= createScanStore(browserStorage());
  return appStore;
}
