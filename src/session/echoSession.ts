import {
  PANEL_FINGERPRINT_GRID,
  STATS_FINGERPRINT_GRID,
  computeFingerprint,
  createDedupeSet,
  createStableFrameDetector,
  type FrameSize,
} from "@wutheringtools/scanner-core";
import { errorKind, errorMessage } from "@/ipc/commands";
import type { FracRect, RegionRead, RegionText } from "@/ipc/types";
import { echoReadRegions } from "./echoRegions";
import { extractEcho, type ExtractedEcho } from "./echoExtract";
import { panelSampleRegions, splitPanelSamples } from "./panelSamples";
import { decodeSamples, type Sample } from "./samples";

/** A scanned echo as kept by the session (an ExtractedEcho plus bookkeeping). */
export interface EchoCandidate extends ExtractedEcho {
  id: string;
  /** Order in which it was captured (1, 2, 3, …). */
  index: number;
  /**
   * Fields the user checked against the game in the review screen (`src/review/fields.ts`).
   * A fix also raises that field's confidence; this list covers what confidence can't, such
   * as "the substat count is right even though it looks short for the level".
   */
  checked?: string[];
}

export interface SessionStats {
  /** Echoes read and kept. */
  scanned: number;
  /** Stable panels skipped because that exact echo was already scanned. */
  duplicates: number;
  /** Reads that failed (OCR error, window gone, …). */
  errors: number;
}

/** What the session needs from the outside world (real IPC in the app, fakes in tests). */
export interface EchoSessionDeps {
  sampleRegions(regions: FracRect[], maxWidth: number): Promise<ArrayBuffer>;
  readRegions(seq: number, regions: RegionRead[]): Promise<RegionText[]>;
  /** Size of the captured game frame (for aspect-ratio adjustment of regions). */
  frameSize(): FrameSize;
  onCandidate(candidate: EchoCandidate): void;
  onStats?(stats: SessionStats): void;
  /** A read failed. `kind` is the Rust error kind (src-tauri/src/error.rs), or null. */
  onError?(message: string, kind: string | null): void;
}

/** Sample width for fingerprints: STATS_FINGERPRINT_GRID is 64 cells wide. */
const SAMPLE_WIDTH = 128;

function asImageData(sample: Sample): ImageData {
  // computeFingerprint only reads data/width/height.
  return { data: sample.rgba, width: sample.width, height: sample.height, colorSpace: "srgb" } as ImageData;
}

/**
 * Watch mode for Bag → Echoes: call `tick()` on a timer (≈8 per second). Each tick
 * samples the panel; when it settles on an echo not seen before, the session reads that
 * exact frame (pinned by the sample), extracts the echo and reports it. Sends no input.
 */
export function createEchoSession(deps: EchoSessionDeps) {
  const detector = createStableFrameDetector();
  const seen = createDedupeSet();
  const stats: SessionStats = { scanned: 0, duplicates: 0, errors: 0 };
  let reading = false;

  const publish = () => deps.onStats?.({ ...stats });

  async function tick(): Promise<void> {
    if (reading) return; // a read is in flight; sampling resumes when it finishes
    const frame = deps.frameSize();
    let samples;
    try {
      // The extractor's samples are taken with the fingerprints, so they come from the frame that's read.
      samples = decodeSamples(await deps.sampleRegions(panelSampleRegions(frame), SAMPLE_WIDTH));
    } catch {
      return; // no frame yet, or the window is momentarily unavailable
    }
    const { panel, stats: statsArea, extras } = splitPanelSamples(samples.images);
    if (!panel || !statsArea) return;

    const fingerprints = {
      panel: computeFingerprint(asImageData(panel), PANEL_FINGERPRINT_GRID),
      stats: computeFingerprint(asImageData(statsArea), STATS_FINGERPRINT_GRID),
    };
    if (detector.observe(fingerprints) !== "stable-novel") return;
    detector.commitScan(fingerprints);

    reading = true;
    try {
      const echo = extractEcho(await deps.readRegions(samples.seq, echoReadRegions(frame)), extras);
      if (seen.has(echo.signature)) {
        stats.duplicates += 1;
      } else {
        seen.add(echo.signature);
        stats.scanned += 1;
        deps.onCandidate({ ...echo, id: `echo-${stats.scanned}`, index: stats.scanned });
      }
    } catch (error) {
      stats.errors += 1;
      deps.onError?.(errorMessage(error), errorKind(error)); // Rust rejects with { kind, message }, not an Error
    } finally {
      reading = false;
      publish();
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    tick,
    /** Starts ticking every `intervalMs` (default 125 ms ≈ 8 per second). */
    start(intervalMs = 125) {
      if (timer) return;
      timer = setInterval(() => void tick(), intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    stats: () => ({ ...stats }),
  };
}

export type EchoSession = ReturnType<typeof createEchoSession>;
