import { describe, expect, it } from "vitest";
import {
  CARD_ART_HEIGHT,
  COLUMN_X,
  GRID_STRIP,
  LEVEL_BAR_HEIGHT,
  ROW_PITCH,
  findRowEdges,
  isGridMeasured,
  rowSignature,
  scrollShift,
  visibleRows,
} from "@/auto/grid";
import type { Sample } from "@/session/samples";

// Synthetic GRID_STRIP samples: plain background, and for each row a patterned card (art),
// a bright gold line, then a dark level bar. The real-capture checks are in
// tests/gridReplay.fixtures.ts.

const WIDTH = 256;
const HEIGHT = 230;

/** Draws rows whose gold line sits at each `barTops` (frame y), with art brightness from `art(row, column)`. */
function strip(barTops: number[], art: (row: number, column: number) => number = (r, c) => 40 + ((r * 7 + c * 13) % 6) * 25): Sample {
  const rgba = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  const toFrameY = (y: number) => GRID_STRIP.y + ((y + 0.5) / HEIGHT) * GRID_STRIP.height;
  const toFrameX = (x: number) => GRID_STRIP.x + ((x + 0.5) / WIDTH) * GRID_STRIP.width;
  const lineHeight = (2 / HEIGHT) * GRID_STRIP.height;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const fy = toFrameY(y);
      const fx = toFrameX(x);
      const column = COLUMN_X.findIndex((cx) => Math.abs(fx - cx) <= 0.0385);
      let value = 150;
      barTops.forEach((barTop, row) => {
        if (column < 0) return;
        if (fy >= barTop - CARD_ART_HEIGHT && fy < barTop - lineHeight) value = art(row, column);
        else if (fy >= barTop - lineHeight && fy < barTop) value = 215;
        else if (fy >= barTop && fy < barTop + LEVEL_BAR_HEIGHT) value = 60;
      });
      if (column < 0 && barTops.some((b) => fy >= b - lineHeight && fy < b)) value = 215;
      rgba.set([value, value, value, 255], (y * WIDTH + x) * 4);
    }
  }
  return { width: WIDTH, height: HEIGHT, rgba };
}

describe("grid rows", () => {
  it("finds each row's gold line, top to bottom", () => {
    const edges = findRowEdges(strip([0.237, 0.41, 0.589, 0.765]));
    expect(edges).toHaveLength(4);
    [0.237, 0.41, 0.589, 0.765].forEach((y, i) => expect(Math.abs(edges[i]! - y)).toBeLessThan(0.008));
  });

  it("leaves out rows cut off at the top or bottom of the scrolling area", () => {
    // 0.152: card top hidden under the header. 0.84: level bar below the area.
    const rows = visibleRows(strip([0.152, 0.325, 0.501, 0.677, 0.84]));
    expect(rows).toHaveLength(3);
  });

  it("aims each click at the middle of the card art, in every column", () => {
    const [row] = visibleRows(strip([0.41]));
    expect(row!.targets.map((t) => t.column)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const { point } of row!.targets) {
      expect(point.y).toBeCloseTo(row!.barTop - CARD_ART_HEIGHT / 2);
      expect(point.y).toBeGreaterThan(row!.barTop - CARD_ART_HEIGHT);
    }
  });

  it("finds nothing on a screen without the grid", () => {
    expect(visibleRows(strip([]))).toEqual([]);
  });
});

describe("scrollShift", () => {
  const signatures = (sample: Sample) => visibleRows(sample).map((row) => rowSignature(sample, row));
  // Row contents by absolute list position, so a scroll is just a different window onto them.
  const content = (first: number) => (row: number, column: number) => 40 + (((first + row) * 7 + column * 13) % 6) * 25;

  it("counts how many rows moved up", () => {
    const before = strip([0.237, 0.41, 0.589, 0.765], content(0));
    const after = strip([0.237, 0.41, 0.589, 0.765], content(2));
    expect(scrollShift(signatures(before), signatures(after))).toBe(2);
  });

  it("works when the rows land at a different height", () => {
    const before = strip([0.345, 0.521, 0.697], content(0));
    const after = strip([0.341, 0.341 + ROW_PITCH, 0.341 + 2 * ROW_PITCH], content(1));
    expect(scrollShift(signatures(before), signatures(after))).toBe(1);
  });

  it("returns 0 when nothing moved (the end of the list)", () => {
    const frame = strip([0.237, 0.41, 0.589, 0.765], content(5));
    expect(scrollShift(signatures(frame), signatures(frame))).toBe(0);
  });

  it("returns null when no row is in both reads", () => {
    const before = strip([0.237, 0.41], content(0));
    const after = strip([0.237, 0.41], content(2));
    expect(scrollShift(signatures(before), signatures(after))).toBeNull();
  });

  it("refuses to guess when identical rows line up more than one way", () => {
    const same = () => 120;
    expect(scrollShift(signatures(strip([0.237, 0.41, 0.589], same)), signatures(strip([0.237, 0.41, 0.589], same)))).toBeNull();
  });
});

describe("isGridMeasured", () => {
  it("accepts 16:10 and refuses unmeasured shapes like 16:9", () => {
    expect(isGridMeasured({ width: 2880, height: 1800 })).toBe(true);
    expect(isGridMeasured({ width: 2304, height: 1440 })).toBe(true);
    expect(isGridMeasured({ width: 1920, height: 1080 })).toBe(false);
  });
});
