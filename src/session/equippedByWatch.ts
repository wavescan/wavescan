import {
  computeFingerprint,
  countChangedCells,
  findEquippedByName,
  fingerprintDistance,
  type FrameFingerprints,
  type StabilityEvent,
} from "@wutheringtools/scanner-core";
import type { Sample } from "./samples";

// Watch mode reads an echo as soon as its panel settles, but the game can draw the
// "Equipped by" line (and its character portrait) a moment after the stats: on a PC short
// of memory, late enough to miss the read (7 of 100+ equipped echoes, 2026-10-12). The
// panel fingerprint can't see the line arrive (it moves the fingerprint about 0.003, the
// detector needs 0.035), so the echo was never read again and exported as "not equipped".
//
// After a read that found no line, this watches just the "Equipped by" box for a short
// while. If a line appears there and holds still while the panel stays on the same echo,
// the session reads that one box again. Guards, so it can't put the wrong name on an echo:
// - it only fills in a missing line, never replaces one that was read;
// - it stops on the first tick the panel moves, on a different echo, or after WATCH_MS;
// - an echo filled in this way is flagged for review (`equippedByLate`), because a
//   different echo with identical stats could in theory have been clicked meanwhile.

/** Grid over the "Equipped by" box: fine enough that the text and portrait show up. */
export const EQUIPPED_ROW_GRID = { width: 32, height: 4 };
/** How long after the read the box is watched. */
export const WATCH_MS = 1500;
/** A cell's brightness change (0–1) that counts as "changed". Same as the stats grid's. */
export const CELL_THRESHOLD = 0.1;
/** Changed cells, against the read frame, that mean something was drawn in the box. */
export const APPEARED_CELLS = 4;
/** Changed cells, tick to tick, below which the box is holding still. */
export const STEADY_CELLS = 2;
/** Ticks in a row the new content must hold still before it's read (like the panel's settle). */
export const STEADY_TICKS = 2;
/**
 * How close the panel must stay to the frame that was read. Same as the detector's
 * thresholds for "an echo already read" (scanner-core `historyThreshold` and
 * `statsNoveltyCells`): stricter than its settle check, so another echo ends the watch.
 */
const SAME_PANEL_DISTANCE = 0.018;
const SAME_STATS_CELLS = 2;

/** True when the OCR'd "Equipped by" box (lines joined by "\n") has an "Equipped by <name>" line. */
export function hasEquippedByLine(text: string | undefined): boolean {
  return text !== undefined && findEquippedByName(text.split("\n")) !== null;
}

/** Fingerprint of a sample of the "Equipped by" box. */
export function equippedRowFingerprint(sample: Sample): Float32Array {
  // computeFingerprint only reads data/width/height.
  const image = { data: sample.rgba, width: sample.width, height: sample.height, colorSpace: "srgb" } as ImageData;
  return computeFingerprint(image, EQUIPPED_ROW_GRID);
}

/** What the session should do after this tick. */
export type WatchStep = "keep" | "read" | "end";

/**
 * Starts watching the "Equipped by" box of the echo just read from a frame with these
 * fingerprints. Call `step` once per tick; when it says "read", OCR the box on that tick's
 * frame and stop watching (one attempt per echo).
 */
export function createEquippedByWatch(read: FrameFingerprints, rowAtRead: Float32Array, startedAt: number) {
  let previousRow = rowAtRead;
  let steadyTicks = 0;

  return {
    /**
     * `event` is the stability detector's verdict on this tick, `frame` its fingerprints,
     * `row` the box's fingerprint, `now` in milliseconds.
     */
    step(event: StabilityEvent, frame: FrameFingerprints, row: Float32Array, now: number): WatchStep {
      if (now - startedAt > WATCH_MS) return "end";
      // The panel moved (another echo, a menu, a transition): this is no longer the echo read.
      if (event !== "stable-repeat") return "end";
      if (
        fingerprintDistance(frame.panel, read.panel) > SAME_PANEL_DISTANCE ||
        countChangedCells(frame.stats, read.stats, CELL_THRESHOLD) >= SAME_STATS_CELLS
      ) {
        return "end";
      }
      const appeared = countChangedCells(row, rowAtRead, CELL_THRESHOLD) >= APPEARED_CELLS;
      const steady = countChangedCells(row, previousRow, CELL_THRESHOLD) < STEADY_CELLS;
      previousRow = row;
      steadyTicks = appeared && steady ? steadyTicks + 1 : 0;
      return steadyTicks >= STEADY_TICKS ? "read" : "keep";
    },
  };
}

export type EquippedByWatch = ReturnType<typeof createEquippedByWatch>;
