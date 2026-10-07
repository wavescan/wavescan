import { SET_ICON_BOX, regionForFrame, type FieldConfidence, type FrameSize, type RegionFrac } from "@wutheringtools/scanner-core";
import { setIconReference, type RgbImage } from "@/data/setIcons";
import type { Sample } from "./samples";

// Tells an echo's sonata set from the icon next to its level, when the echo can belong to
// more than one set (ADR 0022). Only the echo's own 2-3 possible sets are compared, which
// is a much easier problem than picking among all of them.
//
// The icon's exact position and size vary a little (16:9 vs 16:10, PC vs mobile layouts),
// so the sample covers a padded area and each reference is tried at a range of sizes and
// positions. Each try is scored on shape (correlation of brightness inside the circle) minus
// colour difference (brightness-independent), so the ring colour and the glyph both count.

/** SET_ICON_BOX grown by this share of its size on every side. The icon sits inside it. */
const SEARCH_PAD = 0.25;

/**
 * The search area also reaches this share of SET_ICON_BOX's width further left. The icon
 * follows the level text, so a one-digit level ("+0") puts it about 0.0085 of the screen
 * further left than "+25" does, half outside the padded box (2026-10-07 report: every +0
 * echo with more than one possible set came out with no set).
 */
const SEARCH_LEFT_EXTRA = 0.6;

/** The padded SET_ICON_BOX is shrunk to this width before searching (enough detail, and fast). */
const SEARCH_WIDTH = 40;

/** Width of the whole search area (padded box plus the extra on the left) at that scale. */
const TARGET_WIDTH = Math.round((SEARCH_WIDTH * (1 + 2 * SEARCH_PAD + SEARCH_LEFT_EXTRA)) / (1 + 2 * SEARCH_PAD));

/** Icon sizes tried, as a share of SEARCH_WIDTH. Measured: 0.53 (PC), 0.58 (mobile). */
const MIN_ICON_SHARE = 0.45;
const MAX_ICON_SHARE = 0.75;

/** Radius of the compared circle, as a share of the icon size (just inside the ring's edge). */
const CIRCLE = 0.47;

/**
 * Accept the best set only when it scores at least MIN_SCORE and beats the runner-up by
 * MIN_MARGIN. On the 12 fixtures the right set scored 0.84-0.94 and the best wrong one at
 * most 0.63 (Pact of Neonlight Leap vs Halo of Starry Radiance: both shields).
 */
export const MIN_SCORE = 0.7;
export const MIN_MARGIN = 0.15;

/**
 * The area to sample for set matching (padded SET_ICON_BOX plus the extra on the left for
 * one-digit levels, adjusted for the frame shape).
 */
export function setIconSearchRegion(frame: FrameSize): RegionFrac {
  const box = regionForFrame(SET_ICON_BOX, frame);
  const padX = box.width * SEARCH_PAD;
  const padY = box.height * SEARCH_PAD;
  const extra = box.width * SEARCH_LEFT_EXTRA;
  return {
    x: box.x - padX - extra,
    y: box.y - padY,
    width: box.width + 2 * padX + extra,
    height: box.height + 2 * padY,
  };
}

export interface SetIconMatch {
  /** The matched set, or null when no candidate was a clear winner. */
  set: string | null;
  confidence: FieldConfidence;
  /** Best score per candidate (−2 to 1, higher is better), for diagnostics. */
  scores: Record<string, number>;
}

/** Float RGB image (0-255 per channel). */
interface Pixels {
  width: number;
  height: number;
  rgb: Float32Array;
}

/**
 * Area-average resize: each output pixel is the average of the input area it covers. Works
 * for shrinking and enlarging, and doesn't alias like nearest-neighbour.
 */
function resize(src: Pixels, width: number, height: number): Pixels {
  const out = new Float32Array(width * height * 3);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < width; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let total = 0;
      for (let iy = Math.floor(y0); iy < Math.min(Math.ceil(y1), src.height); iy++) {
        const wy = Math.min(y1, iy + 1) - Math.max(y0, iy);
        for (let ix = Math.floor(x0); ix < Math.min(Math.ceil(x1), src.width); ix++) {
          const w = wy * (Math.min(x1, ix + 1) - Math.max(x0, ix));
          const i = (iy * src.width + ix) * 3;
          r += src.rgb[i]! * w;
          g += src.rgb[i + 1]! * w;
          b += src.rgb[i + 2]! * w;
          total += w;
        }
      }
      const o = (y * width + x) * 3;
      out[o] = r / total;
      out[o + 1] = g / total;
      out[o + 2] = b / total;
    }
  }
  return { width, height, rgb: out };
}

function fromSample(sample: Sample): Pixels {
  const rgb = new Float32Array(sample.width * sample.height * 3);
  for (let i = 0, o = 0; i < sample.rgba.length; i += 4, o += 3) {
    rgb[o] = sample.rgba[i]!;
    rgb[o + 1] = sample.rgba[i + 1]!;
    rgb[o + 2] = sample.rgba[i + 2]!;
  }
  return { width: sample.width, height: sample.height, rgb };
}

function fromReference(icon: RgbImage): Pixels {
  return { width: icon.width, height: icon.height, rgb: Float32Array.from(icon.data) };
}

/** Per-pixel brightness and colour (r, g, b as shares of their sum: ignores brightness). */
function features(p: Pixels) {
  const n = p.width * p.height;
  const lum = new Float32Array(n);
  const chroma = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = p.rgb[i * 3]!;
    const g = p.rgb[i * 3 + 1]!;
    const b = p.rgb[i * 3 + 2]!;
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const sum = r + g + b + 1e-6;
    chroma[i * 3] = r / sum;
    chroma[i * 3 + 1] = g / sum;
    chroma[i * 3 + 2] = b / sum;
  }
  return { lum, chroma };
}

/** A reference icon shrunk to one size, ready to compare (only depends on the set and size). */
interface Prepared {
  size: number;
  /** Positions inside the circle, as offsets into a TARGET_WIDTH-wide target. */
  offsets: Int32Array;
  /** Reference brightness minus its mean, per position, and the length of that vector. */
  dev: Float32Array;
  norm: number;
  /** Reference colour (r, g, b shares) per position. */
  chroma: Float32Array;
}

const prepared = new Map<string, Prepared>();

function prepare(key: string, icon: RgbImage, size: number): Prepared {
  const cacheKey = `${key}:${size}`;
  const cached = prepared.get(cacheKey);
  if (cached) return cached;
  const ref = features(resize(fromReference(icon), size, size));
  const centre = (size - 1) / 2;
  const radius2 = (size * CIRCLE) ** 2;
  const offsets: number[] = [];
  const index: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x - centre) ** 2 + (y - centre) ** 2 > radius2) continue;
      offsets.push(y * TARGET_WIDTH + x);
      index.push(y * size + x);
    }
  }
  const mean = index.reduce((s, i) => s + ref.lum[i]!, 0) / index.length;
  const dev = Float32Array.from(index, (i) => ref.lum[i]! - mean);
  const chroma = new Float32Array(index.length * 3);
  index.forEach((i, k) => chroma.set(ref.chroma.subarray(i * 3, i * 3 + 3), k * 3));
  const result = { size, offsets: Int32Array.from(offsets), dev, norm: Math.hypot(...dev), chroma };
  prepared.set(cacheKey, result);
  return result;
}

/**
 * Score of `ref` with its top-left corner at (ox, oy) in the target, or -Infinity when it
 * can't beat `toBeat`. The colour difference only ever lowers the score, so it's skipped
 * when the shape score alone is already too low (most positions; keeps the search fast).
 */
function scoreAt(t: ReturnType<typeof features>, ref: Prepared, ox: number, oy: number, toBeat: number): number {
  const origin = oy * TARGET_WIDTH + ox;
  const count = ref.offsets.length;
  let mean = 0;
  for (let k = 0; k < count; k++) mean += t.lum[origin + ref.offsets[k]!]!;
  mean /= count;
  let dot = 0;
  let norm = 0;
  for (let k = 0; k < count; k++) {
    const dev = t.lum[origin + ref.offsets[k]!]! - mean;
    dot += dev * ref.dev[k]!;
    norm += dev * dev;
  }
  const shape = norm > 0 && ref.norm > 0 ? dot / (Math.sqrt(norm) * ref.norm) : 0;
  if (shape <= toBeat) return -Infinity;
  let colour = 0;
  for (let k = 0; k < count; k++) {
    const ti = (origin + ref.offsets[k]!) * 3;
    colour +=
      Math.abs(t.chroma[ti]! - ref.chroma[k * 3]!) +
      Math.abs(t.chroma[ti + 1]! - ref.chroma[k * 3 + 1]!) +
      Math.abs(t.chroma[ti + 2]! - ref.chroma[k * 3 + 2]!);
  }
  return shape - colour / count;
}

/** Best score of a set's icon anywhere in `target`, over every size and position tried. */
function bestScore(target: Pixels, key: string, icon: RgbImage): number {
  const t = features(target);
  const minSize = Math.round(SEARCH_WIDTH * MIN_ICON_SHARE);
  const maxSize = Math.min(Math.round(SEARCH_WIDTH * MAX_ICON_SHARE), target.height);
  let best = -Infinity;
  for (let size = minSize; size <= maxSize; size++) {
    const ref = prepare(key, icon, size);
    for (let oy = 0; oy + size <= target.height; oy++) {
      for (let ox = 0; ox + size <= TARGET_WIDTH; ox++) {
        best = Math.max(best, scoreAt(t, ref, ox, oy, best));
      }
    }
  }
  return best;
}

/**
 * Picks which of `candidates` (set keys) the sampled icon shows. Returns `set: null` with low
 * confidence unless one candidate clearly wins (MIN_SCORE, MIN_MARGIN), or when a
 * candidate has no reference icon, since that set could never be picked.
 */
export function matchSetIcon(sample: Sample, candidates: readonly string[]): SetIconMatch {
  const height = Math.max(1, Math.round((TARGET_WIDTH * sample.height) / sample.width));
  const target = resize(fromSample(sample), TARGET_WIDTH, height);
  const scores: Record<string, number> = {};
  for (const key of candidates) {
    const icon = setIconReference(key);
    if (!icon) return { set: null, confidence: "low", scores };
    scores[key] = Math.round(bestScore(target, key, icon) * 100) / 100;
  }
  const ranked = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const [first, second] = ranked;
  if (!first) return { set: null, confidence: "low", scores };
  const margin = second ? first[1] - second[1] : Infinity;
  const clear = first[1] >= MIN_SCORE && margin >= MIN_MARGIN;
  return { set: clear ? first[0] : null, confidence: clear ? "high" : "low", scores };
}
