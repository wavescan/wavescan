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
// Measured on 16:10 captures (2880×1800 fixtures and a 2304×1440 recording) and 16:9
// captures (1920×1080), as fractions of the game area. The game scales its UI with the
// width, so x is the same at both shapes and every height is aspect / 1.6 times the 16:10
// one. The scrolling area's top follows the header (top-anchored) and its bottom follows
// the footer (bottom-anchored). See docs/screens/echoes.md "Grid". Other shapes aren't
// measured, so `gridLayout` refuses them rather than guess.

/** Width the strip is sampled at (about 0.0033 of the screen height per pixel at 16:10). */
export const GRID_SAMPLE_WIDTH = 256;

/** Centre x of each of the 6 columns (the same at 16:10 and 16:9). */
export const COLUMN_X: readonly number[] = [0, 1, 2, 3, 4, 5].map((k) => 0.13 + k * 0.092);

/** Half a card's width (cards are about 0.077 wide). */
const CARD_HALF_WIDTH = 0.0385;

/** The grid's geometry for one frame shape, as fractions of the game area. */
export interface GridLayout {
  /** The strip sampled for row detection: every column, the whole scrolling area. */
  strip: RegionFrac;
  /** Card art height above the gold line. */
  cardArtHeight: number;
  /** Level bar height below the gold line. */
  levelBarHeight: number;
  /** Distance between rows. */
  rowPitch: number;
  /** Edges closer than this are the same row. */
  sameRow: number;
  /** Small allowance when checking that a card is fully inside the scrolling area. */
  edgeSlack: number;
  /** How far a row may sit from a whole number of pitches from the other rows. */
  pitchTolerance: number;
}

/**
 * The 16:10 grid. Strip x 0.09–0.61, y 0.105–0.855. Row pitch measured 0.1753–0.1786.
 */
export const GRID_16_10: GridLayout = {
  strip: { x: 0.09, y: 0.105, width: 0.52, height: 0.75 },
  cardArtHeight: 0.118,
  levelBarHeight: 0.04,
  rowPitch: 0.177,
  sameRow: 0.03,
  edgeSlack: 0.005,
  pitchTolerance: 0.012,
};

/** Frame shapes the grid has been measured at, with the same snap tolerance as scanner-core. */
const MEASURED_ASPECTS = [16 / 10, 16 / 9];
const SNAP_TOLERANCE = 0.01;

/** The 16:10 layout with every height scaled by `scale`, and the strip's bottom kept the same distance from the frame's bottom. */
function scaledLayout(scale: number): GridLayout {
  const ref = GRID_16_10;
  const top = ref.strip.y * scale;
  const bottom = 1 - (1 - (ref.strip.y + ref.strip.height)) * scale;
  return {
    strip: { x: ref.strip.x, y: top, width: ref.strip.width, height: bottom - top },
    cardArtHeight: ref.cardArtHeight * scale,
    levelBarHeight: ref.levelBarHeight * scale,
    rowPitch: ref.rowPitch * scale,
    sameRow: ref.sameRow * scale,
    edgeSlack: ref.edgeSlack * scale,
    pitchTolerance: ref.pitchTolerance * scale,
  };
}

/**
 * The grid layout for this game area, or null when its shape isn't 16:10 or 16:9 (auto mode
 * refuses to click on an unmeasured layout).
 */
export function gridLayout(frame: FrameSize): GridLayout | null {
  const aspect = MEASURED_ASPECTS.find((a) => Math.abs(frame.width / frame.height - a) < SNAP_TOLERANCE);
  if (aspect === undefined) return null;
  return aspect === 16 / 10 ? GRID_16_10 : scaledLayout(aspect / (16 / 10));
}

/**
 * Brightness drop (0-255, averaged across the strip) from the row above the edge to the
 * row below it, and the most the row below may be. Gold line ≈ 180-215, bar ≈ 55-85.
 */
const EDGE_DROP = 55;
const EDGE_MAX_BELOW = 110;

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

/** Converts a sample row back to a frame fraction, and frame fractions to sample pixels. */
function frameY(layout: GridLayout, sample: Sample, y: number): number {
  return layout.strip.y + ((y + 0.5) / sample.height) * layout.strip.height;
}
function sampleX(layout: GridLayout, sample: Sample, x: number): number {
  return Math.round(((x - layout.strip.x) / layout.strip.width) * sample.width);
}
function sampleY(layout: GridLayout, sample: Sample, y: number): number {
  return Math.round(((y - layout.strip.y) / layout.strip.height) * sample.height);
}

/** Average brightness of each sample row, over sample columns [x0, x1). */
function brightnessProfile(sample: Sample, x0 = 0, x1 = sample.width): number[] {
  const profile: number[] = [];
  for (let y = 0; y < sample.height; y++) {
    let sum = 0;
    for (let x = x0; x < x1; x++) sum += lum(sample, x, y);
    profile.push(sum / Math.max(1, x1 - x0));
  }
  return profile;
}

/** Every bright-to-dark drop in a brightness profile, top to bottom, as frame y fractions. */
function profileDrops(layout: GridLayout, sample: Sample, profile: number[]): number[] {
  const drops: number[] = [];
  for (let y = 1; y < profile.length - 1; y++) {
    const drop = profile[y - 1]! - profile[y + 1]!;
    if (drop < EDGE_DROP || profile[y + 1]! > EDGE_MAX_BELOW) continue;
    const edge = frameY(layout, sample, y);
    const last = drops.at(-1);
    if (last === undefined || edge - last > layout.sameRow) drops.push(edge);
  }
  return drops;
}

/** Every bright-to-dark drop across the whole strip. */
function brightnessDrops(layout: GridLayout, sample: Sample): number[] {
  return profileDrops(layout, sample, brightnessProfile(sample));
}

/** Half the width of the slice of a card used for its own edge check (inside the card, clear of its border). */
const COLUMN_SLICE_HALF_WIDTH = 0.025;

/** Whether column `column` has a gold-line edge of its own within the pitch tolerance of `y`. */
function columnEdgeNear(layout: GridLayout, sample: Sample, column: number, y: number): boolean {
  const x = COLUMN_X[column]!;
  const x0 = Math.max(0, sampleX(layout, sample, x - COLUMN_SLICE_HALF_WIDTH));
  const x1 = Math.min(sample.width, sampleX(layout, sample, x + COLUMN_SLICE_HALF_WIDTH));
  const drops = profileDrops(layout, sample, brightnessProfile(sample, x0, x1));
  return drops.some((d) => Math.abs(d - y) <= layout.pitchTolerance);
}

/** Whether `a` and `b` are a whole number of row pitches apart. */
function onPitch(layout: GridLayout, a: number, b: number): boolean {
  const pitches = Math.abs(a - b) / layout.rowPitch;
  return Math.abs(pitches - Math.round(pitches)) * layout.rowPitch <= layout.pitchTolerance;
}

/**
 * Finds every gold-line / level-bar edge in a grid strip sample, top to bottom, as frame y
 * fractions. Includes rows that are only partly visible.
 *
 * Card art can make the same kind of drop: a row of Kernel Puppets has a bright crossbar
 * across every card (16:9 fixture `kernel-puppet-joy-plus25`). Such a drop sits inside the
 * card, above that card's real edge, so a drop with another one less than ~0.6 of a row
 * below it is dropped. This relies on the top of a card not making a drop of its own: the
 * gap above a card is darker than the line (45-90 in all 23 grid fixtures), and none of them
 * shows a drop there. Then the edges have to be whole row pitches apart: when they don't
 * agree (say a lone art edge in a row whose level bar is out of view), the largest group that
 * does is kept, and a tie returns nothing rather than a guess.
 */
export function findRowEdges(layout: GridLayout, sample: Sample): number[] {
  const drops = brightnessDrops(layout, sample);
  const edges = drops.filter((y, i) => {
    const below = drops[i + 1];
    return below === undefined || below - y >= 0.6 * layout.rowPitch;
  });
  if (edges.length <= 1) return edges;
  const groups = edges.map((anchor) => edges.filter((y) => onPitch(layout, anchor, y)));
  const best = Math.max(...groups.map((g) => g.length));
  const winners = groups.filter((g) => g.length === best);
  const first = winners[0]!;
  if (winners.some((g) => g[0] !== first[0])) return [];
  return first;
}

/**
 * The last row of the list when it isn't full: one row pitch below the last edge, where at
 * least one column has an edge of its own. Averaged over the whole strip, two cards out of
 * six don't make a big enough drop (16:9 fixture `end-of-list`), so without this the last
 * few echoes would be skipped. Null when there's no such row.
 */
export function findPartialRow(layout: GridLayout, sample: Sample, edges: readonly number[]): number | null {
  const last = edges.at(-1);
  if (last === undefined) return null;
  const y = last + layout.rowPitch;
  return COLUMN_X.some((_, column) => columnEdgeNear(layout, sample, column, y)) ? y : null;
}

/**
 * The fully visible rows in a grid strip sample, with a click target for each column,
 * including a partly filled last row (`findPartialRow`). Every row gets all six targets:
 * an empty slot can't be told from a card reliably (see `GridRow`), and clicking one is
 * harmless. A row whose card top or level bar is cut off by the scrolling area is left out:
 * clicking it could scroll the grid by itself.
 */
export function visibleRows(layout: GridLayout, sample: Sample): GridRow[] {
  const top = layout.strip.y - layout.edgeSlack;
  const bottom = layout.strip.y + layout.strip.height + layout.edgeSlack;
  const edges = findRowEdges(layout, sample);
  const partial = findPartialRow(layout, sample, edges);
  if (partial !== null) edges.push(partial);
  return edges
    .filter((edge) => edge - layout.cardArtHeight >= top && edge + layout.levelBarHeight <= bottom)
    .map((barTop) => ({
      barTop,
      targets: COLUMN_X.map((x, column) => ({ column, point: { x, y: barTop - layout.cardArtHeight / 2 } })),
    }));
}

/** Small brightness thumbnails of a row's cards (4×4 per card), to recognise it after a scroll. */
export function rowSignature(layout: GridLayout, sample: Sample, row: GridRow): number[] {
  const signature: number[] = [];
  const cells = 4;
  for (let column = 0; column < COLUMN_X.length; column++) {
    const left = COLUMN_X[column]! - CARD_HALF_WIDTH;
    const artTop = row.barTop - layout.cardArtHeight;
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const x0 = sampleX(layout, sample, left + (cx / cells) * 2 * CARD_HALF_WIDTH);
        const x1 = sampleX(layout, sample, left + ((cx + 1) / cells) * 2 * CARD_HALF_WIDTH);
        const y0 = sampleY(layout, sample, artTop + (cy / cells) * layout.cardArtHeight);
        const y1 = sampleY(layout, sample, artTop + ((cy + 1) / cells) * layout.cardArtHeight);
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

