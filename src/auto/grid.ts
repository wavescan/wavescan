import type { FrameSize, RegionFrac } from "@wutheringtools/scanner-core";
import type { FracPoint } from "@/ipc/types";
import type { Sample } from "@/session/samples";

// Reads the Bag → Echoes grid for auto mode: where the fully visible rows are, where to
// click, and how far a scroll moved the grid.
//
// The grid scrolls smoothly, so rows can sit at any height. Each card ends in a bright gold
// line right above its dark level bar ("+25"); that bright-to-dark edge is found in a
// brightness profile of the grid strip and marks each row. Columns never move.
//
// Measured on 16:10 captures (2880×1800 fixtures and a 2304×1440 recording), as fractions of
// the game area. See docs/screens/echoes.md "Grid". 16:9 isn't measured yet, so
// `isGridMeasured` refuses it rather than guess.

/** The strip sampled for row detection: every column, the whole scrolling area. */
export const GRID_STRIP: RegionFrac = { x: 0.09, y: 0.105, width: 0.52, height: 0.75 };

/** Width the strip is sampled at (about 0.0033 of the screen height per pixel at 16:10). */
export const GRID_SAMPLE_WIDTH = 256;

/** Centre x of each of the 6 columns. */
export const COLUMN_X: readonly number[] = [0, 1, 2, 3, 4, 5].map((k) => 0.13 + k * 0.092);

/** Half a card's width (cards are about 0.077 wide). */
const CARD_HALF_WIDTH = 0.0385;

/** Card art height above the gold line, and the level bar's height below it. */
export const CARD_ART_HEIGHT = 0.118;
export const LEVEL_BAR_HEIGHT = 0.04;

/** Distance between rows (measured 0.1753-0.1786). */
export const ROW_PITCH = 0.177;

/**
 * Brightness drop (0-255, averaged across the strip) from the row above the edge to the
 * row below it, and the most the row below may be. Gold line ≈ 180-215, bar ≈ 55-85.
 */
const EDGE_DROP = 55;
const EDGE_MAX_BELOW = 110;

/** Edges closer than this are the same row. */
const SAME_ROW = 0.03;

/** Small allowance when checking that a card is fully inside the scrolling area. */
const EDGE_SLACK = 0.005;

/** Whether the grid layout has been measured for this frame shape (16:10 only so far). */
export function isGridMeasured(frame: FrameSize): boolean {
  return Math.abs(frame.width / frame.height - 1.6) < 0.01;
}

/** One fully visible row of cards. */
export interface GridRow {
  /** y of the gold line / top of the level bar, as a fraction of the frame. */
  barTop: number;
  /**
   * Where to click each column (the middle of the card art). An empty slot (the end of the
   * list) can't be told from a card reliably here, because the grid fades out near its bottom
   * edge; the navigator notices that a click didn't select anything instead.
   */
  targets: { column: number; point: FracPoint }[];
}

/** Brightness (0-255) of one sample pixel. */
function lum(sample: Sample, x: number, y: number): number {
  const i = (y * sample.width + x) * 4;
  return 0.299 * sample.rgba[i]! + 0.587 * sample.rgba[i + 1]! + 0.114 * sample.rgba[i + 2]!;
}

/** Converts a sample row/column back to frame fractions. */
function frameY(sample: Sample, y: number): number {
  return GRID_STRIP.y + ((y + 0.5) / sample.height) * GRID_STRIP.height;
}
function sampleX(sample: Sample, x: number): number {
  return Math.round(((x - GRID_STRIP.x) / GRID_STRIP.width) * sample.width);
}
function sampleY(sample: Sample, y: number): number {
  return Math.round(((y - GRID_STRIP.y) / GRID_STRIP.height) * sample.height);
}

/**
 * Finds every gold-line / level-bar edge in a GRID_STRIP sample, top to bottom, as frame y
 * fractions. Includes rows that are only partly visible.
 */
export function findRowEdges(sample: Sample): number[] {
  const profile: number[] = [];
  for (let y = 0; y < sample.height; y++) {
    let sum = 0;
    for (let x = 0; x < sample.width; x++) sum += lum(sample, x, y);
    profile.push(sum / sample.width);
  }
  const edges: number[] = [];
  for (let y = 1; y < sample.height - 1; y++) {
    const drop = profile[y - 1]! - profile[y + 1]!;
    if (drop < EDGE_DROP || profile[y + 1]! > EDGE_MAX_BELOW) continue;
    const edge = frameY(sample, y);
    const last = edges.at(-1);
    if (last === undefined || edge - last > SAME_ROW) edges.push(edge);
  }
  return edges;
}

/**
 * The fully visible rows in a GRID_STRIP sample, with a click target for each column. A row
 * whose card top or level bar is cut off by the scrolling area is left out: clicking it
 * could scroll the grid by itself.
 */
export function visibleRows(sample: Sample): GridRow[] {
  const top = GRID_STRIP.y - EDGE_SLACK;
  const bottom = GRID_STRIP.y + GRID_STRIP.height + EDGE_SLACK;
  return findRowEdges(sample)
    .filter((edge) => edge - CARD_ART_HEIGHT >= top && edge + LEVEL_BAR_HEIGHT <= bottom)
    .map((barTop) => ({
      barTop,
      targets: COLUMN_X.map((x, column) => ({ column, point: { x, y: barTop - CARD_ART_HEIGHT / 2 } })),
    }));
}

/** Small brightness thumbnails of a row's cards (4×4 per card), to recognise it after a scroll. */
export function rowSignature(sample: Sample, row: GridRow): number[] {
  const signature: number[] = [];
  const cells = 4;
  for (let column = 0; column < COLUMN_X.length; column++) {
    const left = COLUMN_X[column]! - CARD_HALF_WIDTH;
    const artTop = row.barTop - CARD_ART_HEIGHT;
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const x0 = sampleX(sample, left + (cx / cells) * 2 * CARD_HALF_WIDTH);
        const x1 = sampleX(sample, left + ((cx + 1) / cells) * 2 * CARD_HALF_WIDTH);
        const y0 = sampleY(sample, artTop + (cy / cells) * CARD_ART_HEIGHT);
        const y1 = sampleY(sample, artTop + ((cy + 1) / cells) * CARD_ART_HEIGHT);
        let sum = 0;
        let count = 0;
        for (let y = Math.max(0, y0); y < Math.min(sample.height, y1); y++) {
          for (let x = Math.max(0, x0); x < Math.min(sample.width, x1); x++) {
            sum += lum(sample, x, y);
            count += 1;
          }
        }
        signature.push(count ? sum / count : 0);
      }
    }
  }
  return signature;
}

/** Mean absolute difference between two row signatures (0 = identical). */
export function signatureDistance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - (b[i] ?? 0));
  return sum / a.length;
}

/**
 * Signatures closer than this show the same row. Measured on a scrolling recording: the
 * same row scored 0-12 (12 with the mouse cursor over a card), different rows 20 or more.
 */
export const SAME_ROW_DISTANCE = 16;

/**
 * How many rows the grid moved up between two reads, by lining up the rows seen before
 * (`before`, top to bottom) with the rows seen after. Every overlapping pair has to match,
 * and only one shift may fit: identical rows (say, six copies of the same echo) could line
 * up more than one way, and then this returns null so the caller doesn't guess. 0 means
 * nothing moved (the end of the list). Null also when no row is in both reads.
 */
export function scrollShift(before: readonly (readonly number[])[], after: readonly (readonly number[])[]): number | null {
  const fits: number[] = [];
  for (let shift = 0; shift < before.length; shift++) {
    let pairs = 0;
    let all = true;
    for (let i = shift; i < before.length && i - shift < after.length; i++) {
      pairs += 1;
      if (signatureDistance(before[i]!, after[i - shift]!) >= SAME_ROW_DISTANCE) {
        all = false;
        break;
      }
    }
    if (pairs > 0 && all) fits.push(shift);
  }
  return fits.length === 1 ? fits[0]! : null;
}

/** The GRID_STRIP region for this frame (16:10 only, see `isGridMeasured`). */
export function gridStripRegion(frame: FrameSize): RegionFrac | null {
  return isGridMeasured(frame) ? GRID_STRIP : null;
}
