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
import { classifyScreen, type ScreenKind } from "./classifyScreen";
import { echoReadRegions, equippedByRowRegion } from "./echoRegions";
import { extractEcho, type ExtractedEcho } from "./echoExtract";
import { createEquippedByWatch, equippedRowFingerprint, hasEquippedByLine, type EquippedByWatch } from "./equippedByWatch";
import { readingOrder } from "./ocrText";
import { panelSampleRegions, splitPanelSamples } from "./panelSamples";
import { decodeSamples, type Sample } from "./samples";
import { isBelowScanLevel } from "./scanLevel";

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
  /**
   * Who the echo is equipped by, as set in the review screen: a character key, "Rover" (the
   * main character) or null (not equipped). Undefined until the user sets it; the read line
   * is used until then (`src/session/equippedBy.ts`).
   */
  equippedByFix?: string | null;
  /**
   * True when the "Equipped by" line was read a moment after the rest of the echo, because
   * the game drew it late (`equippedByWatch.ts`). Flagged for review until the user checks it.
   */
  equippedByLate?: boolean;
}

export interface SessionStats {
  /** Echoes read and kept. */
  scanned: number;
  /** Stable panels skipped because that exact echo was already scanned. */
  duplicates: number;
  /** Reads that failed (OCR error, window gone, …). */
  errors: number;
  /** Settled frames skipped because the game wasn't on Bag → Echoes (`classifyScreen`). */
  wrongScreen: number;
  /** Echoes skipped because they're below +5 (`MIN_SCAN_LEVEL`). */
  belowMinLevel: number;
  /** The screen the last read frame showed, or null before the first read. */
  screen: ScreenKind | null;
}

/** What the session needs from the outside world (real IPC in the app, fakes in tests). */
export interface EchoSessionDeps {
  sampleRegions(regions: FracRect[], maxWidth: number): Promise<ArrayBuffer>;
  readRegions(seq: number, regions: RegionRead[]): Promise<RegionText[]>;
  /** Size of the captured game frame (for aspect-ratio adjustment of regions). */
  frameSize(): FrameSize;
  onCandidate(candidate: EchoCandidate): void;
  /**
   * An echo already reported got its "Equipped by" line, which the game drew after the read.
   * `candidate` has the same `id` as the one passed to `onCandidate`.
   */
  onCandidateUpdate?(candidate: EchoCandidate): void;
  /** Milliseconds from any fixed point (`performance.now()` by default; a fake clock in tests). */
  now?(): number;
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
 * A frame from another screen (`classifyScreen`) is counted in `wrongScreen`, not read as
 * an echo, and an echo below +5 (`MIN_SCAN_LEVEL`) is counted in `belowMinLevel`, not kept.
 * After reading an echo with no "Equipped by" line, it watches that box for a
 * moment in case the game draws the line late (`equippedByWatch.ts`).
 */
export function createEchoSession(deps: EchoSessionDeps) {
  const detector = createStableFrameDetector();
  const seen = createDedupeSet();
  const stats: SessionStats = { scanned: 0, duplicates: 0, errors: 0, wrongScreen: 0, belowMinLevel: 0, screen: null };
  let reading = false;
  const now = deps.now ?? (() => performance.now());
  /** The echo whose "Equipped by" box is being watched, if any. */
  let late: { watch: EquippedByWatch; candidate: EchoCandidate } | null = null;

  const publish = () => deps.onStats?.({ ...stats });

  async function tick(): Promise<void> {
    if (reading) return; // a read is in flight; sampling resumes when it finishes
    const frame = deps.frameSize();
    let samples;
    try {
      // The extractor's samples are taken with the fingerprints, so they come from the frame that's read.
      const regions = [...panelSampleRegions(frame), equippedByRowRegion(frame)];
      samples = decodeSamples(await deps.sampleRegions(regions, SAMPLE_WIDTH));
    } catch {
      return; // no frame yet, or the window is momentarily unavailable
    }
    const { panel, stats: statsArea, extras } = splitPanelSamples(samples.images);
    const equippedRow = samples.images[4];
    if (!panel || !statsArea) return;

    const fingerprints = {
      panel: computeFingerprint(asImageData(panel), PANEL_FINGERPRINT_GRID),
      stats: computeFingerprint(asImageData(statsArea), STATS_FINGERPRINT_GRID),
    };
    const rowFingerprint = equippedRow ? equippedRowFingerprint(equippedRow) : null;
    const event = detector.observe(fingerprints);

    if (late) {
      const step = rowFingerprint ? late.watch.step(event, fingerprints, rowFingerprint, now()) : "end";
      if (step === "read") {
        await readLateLine(late.candidate, samples.seq, frame);
        late = null;
        return;
      }
      if (step === "end") late = null;
    }

    if (event !== "stable-novel") return;
    detector.commitScan(fingerprints);
    late = null;

    reading = true;
    try {
      const results = await deps.readRegions(samples.seq, echoReadRegions(frame));
      stats.screen = classifyScreen(results);
      if (stats.screen !== "bag.echoes") {
        stats.wrongScreen += 1;
        return;
      }
      const echo = extractEcho(results, extras);
      if (isBelowScanLevel(echo.level)) {
        stats.belowMinLevel += 1;
      } else if (seen.has(echo.signature)) {
        stats.duplicates += 1;
      } else {
        seen.add(echo.signature);
        stats.scanned += 1;
        const candidate: EchoCandidate = { ...echo, id: `echo-${stats.scanned}`, index: stats.scanned };
        deps.onCandidate(candidate);
        if (rowFingerprint && echo.raw.equippedBy !== undefined && !hasEquippedByLine(echo.raw.equippedBy)) {
          late = { watch: createEquippedByWatch(fingerprints, rowFingerprint, now()), candidate };
        }
      }
    } catch (error) {
      stats.errors += 1;
      deps.onError?.(errorMessage(error), errorKind(error)); // Rust rejects with { kind, message }, not an Error
    } finally {
      reading = false;
      publish();
    }
  }

  /**
   * OCRs only the "Equipped by" box of frame `seq`. When it now has a line, reports the echo
   * again with it, flagged as read late. A failed read is left as it was: the echo already
   * went out without a line, as before this watch existed.
   */
  async function readLateLine(candidate: EchoCandidate, seq: number, frame: FrameSize) {
    reading = true;
    try {
      const box = echoReadRegions(frame).filter(({ id }) => id === "equippedBy");
      const [result] = await deps.readRegions(seq, box);
      // Same as the extractor's `raw.equippedBy`.
      const text = readingOrder(result?.lines ?? [])
        .map((l) => l.text)
        .join("\n")
        .trim();
      if (!hasEquippedByLine(text)) return;
      deps.onCandidateUpdate?.({ ...candidate, raw: { ...candidate.raw, equippedBy: text }, equippedByLate: true });
    } catch {
      // Not counted as an error: the echo itself was read fine.
    } finally {
      reading = false;
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
