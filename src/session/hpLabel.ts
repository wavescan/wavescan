import { MAIN_STAT_ROW, regionForFrame, type FrameSize, type RegionFrac } from "@wutheringtools/scanner-core";
import { padStatRow } from "./echoRegions";
import type { Sample } from "./samples";

// Recognises the main stat's "HP" label by its shape, because Windows OCR never reads a
// lone "HP" (fixture replay 2026-10-07; 2026-10-08 report: every +0 HP echo came out
// flagged, and a cost 3 one with no main stat, since HP%, ATK% and the elements share one
// table there). Every other main-stat label is read fine by OCR, so this only has to answer
// "is it HP?", and only runs when OCR found no label.
//
// The label is white text on a plain panel. Its first word is cut out by brightness,
// stretched to a fixed grid, and compared with an "HP" template. On every fixture (main
// and secondary rows, 1920×1080, 2800×1752 and 2880×1800) "HP" scored 0.94-1.00 and every
// other label at most 0.20; "HP" is also much narrower for its height (1.70-1.84 vs at
// least 2.58 for ATK and DEF). See docs/screens/echoes.md.

/** The template's size: columns and rows. */
const GRID_WIDTH = 24;
const GRID_HEIGHT = 10;

/**
 * "HP" as the share of bright pixels per cell (0-9), averaged over the fixtures' HP labels.
 * Generated from the fixtures, not hand-drawn: the H is on the left, the P on the right.
 */
const HP_TEMPLATE = [
  "995000005995017999998620",
  "996000005995017985457985",
  "996000005995017960002799",
  "996000005995017960001799",
  "999655569995017974447996",
  "998555557995017998888620",
  "996000005995017961000000",
  "996000005995017960000000",
  "996000005995017960000000",
  "895000004873016950000000",
].flatMap((row) => [...row].map((digit) => Number(digit) / 9));

/** Least template correlation for "HP" (fixtures: HP ≥ 0.94, anything else ≤ 0.20). */
export const MIN_HP_SCORE = 0.8;
/** Width ÷ height range for "HP" (fixtures: 1.70-1.84; ATK and DEF ≥ 2.58). */
export const HP_ASPECT = { min: 1.4, max: 2.2 } as const;
/** Text is brighter than this (0-255); the panel behind it is about 80-110. */
const MIN_TEXT_LUMA = 150;
/** A pixel is text if it's at least this share of the brightest pixel. */
const TEXT_SHARE = 0.6;
/** A gap wider than this share of the text height ends the first word. */
const WORD_GAP = 0.45;

/**
 * The start of the main stat row, wide enough for "HP" and the gap after it (and the
 * first word of any longer label). Same height as the OCR'd row (`padStatRow`).
 */
export function mainStatLabelRegion(frame: FrameSize): RegionFrac {
  const row = padStatRow(MAIN_STAT_ROW);
  return regionForFrame({ ...row, x: row.x - 0.002, width: 0.07 }, frame);
}

export interface HpLabelMatch {
  /** True when the label is "HP". */
  hp: boolean;
  /** Template correlation (-1 to 1), for tests and diagnostics. */
  score: number;
  /** Width ÷ height of the first word. */
  aspect: number;
}

const NO_MATCH: HpLabelMatch = { hp: false, score: 0, aspect: 0 };

function luma(sample: Sample, x: number, y: number): number {
  const o = (y * sample.width + x) * 4;
  return 0.299 * sample.rgba[o]! + 0.587 * sample.rgba[o + 1]! + 0.114 * sample.rgba[o + 2]!;
}

/** Pearson correlation of two equal-length arrays (1 = same shape). */
function correlation(a: readonly number[], b: readonly number[]): number {
  const mean = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(a);
  const mb = mean(b);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    ab += da * db;
    aa += da * da;
    bb += db * db;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

/** Says whether the `mainStatLabelRegion` sample shows "HP". */
export function matchHpLabel(sample: Sample): HpLabelMatch {
  const { width, height } = sample;
  let brightest = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) brightest = Math.max(brightest, luma(sample, x, y));
  if (brightest < MIN_TEXT_LUMA) return NO_MATCH;
  const isText = (x: number, y: number) => luma(sample, x, y) > brightest * TEXT_SHARE;

  // The text's rows, then its first word: columns from the first text column until a gap.
  const textRows = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => x).some((x) => isText(x, y)));
  const top = textRows.indexOf(true);
  const bottom = textRows.lastIndexOf(true);
  const textHeight = bottom - top + 1;
  const textColumn = (x: number) => Array.from({ length: textHeight }, (_, i) => top + i).some((y) => isText(x, y));
  let left = -1;
  let right = -1;
  let gap = 0;
  for (let x = 0; x < width; x++) {
    if (textColumn(x)) {
      if (left < 0) left = x;
      right = x;
      gap = 0;
    } else if (left >= 0 && ++gap > textHeight * WORD_GAP) {
      break;
    }
  }
  if (left < 0) return NO_MATCH;
  const wordWidth = right - left + 1;

  // Share of text pixels in each grid cell.
  const grid: number[] = [];
  for (let gy = 0; gy < GRID_HEIGHT; gy++) {
    const y0 = top + (gy * textHeight) / GRID_HEIGHT;
    const y1 = top + ((gy + 1) * textHeight) / GRID_HEIGHT;
    for (let gx = 0; gx < GRID_WIDTH; gx++) {
      const x0 = left + (gx * wordWidth) / GRID_WIDTH;
      const x1 = left + ((gx + 1) * wordWidth) / GRID_WIDTH;
      let on = 0;
      let all = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          if (isText(x, y)) on += 1;
          all += 1;
        }
      }
      grid.push(on / all);
    }
  }

  const score = correlation(grid, HP_TEMPLATE);
  const aspect = wordWidth / textHeight;
  const hp = score >= MIN_HP_SCORE && aspect >= HP_ASPECT.min && aspect <= HP_ASPECT.max;
  return { hp, score, aspect };
}
