import { describe, expect, it } from "vitest";
import {
  COLUMN_X,
  GRID_16_10,
  findRowEdges,
  gridLayout,
  rowSignature,
  scrollShift,
  visibleRows,
  type GridLayout,
} from "@/auto/grid";
import type { Sample } from "@/session/samples";

// Synthetic grid strip samples: plain background, and for each row a patterned card (art),
// a bright gold line, then a dark level bar. The real-capture checks are in
// tests/gridReplay.fixtures.ts.

const WIDTH = 256;
const HEIGHT = 230;
const L = GRID_16_10;
const L169 = gridLayout({ width: 1920, height: 1080 })!;

interface StripOptions {
  /** Art brightness for each card. */
  art?: (row: number, column: number) => number;
  /** y (frame fraction) of a bright band across every card, like a Kernel Puppet's crossbar. */
  band?: (barTop: number) => number | undefined;
  layout?: GridLayout;
}

/** Draws rows whose gold line sits at each `barTops` (frame y). */
function strip(barTops: number[], options: StripOptions = {}): Sample {
  const art = options.art ?? ((r, c) => 40 + ((r * 7 + c * 13) % 6) * 25);
  const layout = options.layout ?? L;
  const { strip: area, cardArtHeight, levelBarHeight } = layout;
  const height = Math.round((HEIGHT * area.height) / L.strip.height);
  const rgba = new Uint8ClampedArray(WIDTH * height * 4);
  const toFrameY = (y: number) => area.y + ((y + 0.5) / height) * area.height;
  const toFrameX = (x: number) => area.x + ((x + 0.5) / WIDTH) * area.width;
  const lineHeight = (2 / height) * area.height;
  const bandHeight = (8 / height) * area.height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const fy = toFrameY(y);
      const fx = toFrameX(x);
      const column = COLUMN_X.findIndex((cx) => Math.abs(fx - cx) <= 0.0385);
      let value = 150;
      barTops.forEach((barTop, row) => {
        if (column < 0) return;
        const band = options.band?.(barTop);
        if (band !== undefined && fy >= band - bandHeight && fy < band) value = 200;
        else if (band !== undefined && fy >= band && fy < barTop - lineHeight) value = 60;
        else if (fy >= barTop - cardArtHeight && fy < barTop - lineHeight) value = art(row, column);
        else if (fy >= barTop - lineHeight && fy < barTop) value = 215;
        else if (fy >= barTop && fy < barTop + levelBarHeight) value = 60;
      });
      if (column < 0 && barTops.some((b) => fy >= b - lineHeight && fy < b)) value = 215;
      rgba.set([value, value, value, 255], (y * WIDTH + x) * 4);
    }
  }
  return { width: WIDTH, height, rgba };
}

describe("grid rows", () => {
  it("finds each row's gold line, top to bottom", () => {
    const edges = findRowEdges(L, strip([0.237, 0.41, 0.589, 0.765]));
    expect(edges).toHaveLength(4);
    [0.237, 0.41, 0.589, 0.765].forEach((y, i) => expect(Math.abs(edges[i]! - y)).toBeLessThan(0.008));
  });

  it("leaves out rows cut off at the top or bottom of the scrolling area", () => {
    // 0.152: card top hidden under the header. 0.84: level bar below the area.
    const rows = visibleRows(L, strip([0.152, 0.325, 0.501, 0.677, 0.84]));
    expect(rows).toHaveLength(3);
  });

  it("aims each click at the middle of the card art, in every column", () => {
    const [row] = visibleRows(L, strip([0.41]));
    expect(row!.targets.map((t) => t.column)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const { point } of row!.targets) {
      expect(point.y).toBeCloseTo(row!.barTop - L.cardArtHeight / 2);
      expect(point.y).toBeGreaterThan(row!.barTop - L.cardArtHeight);
    }
  });

  it("finds nothing on a screen without the grid", () => {
    expect(visibleRows(L, strip([]))).toEqual([]);
  });

  it("ignores a bright band across every card's art (Kernel Puppet crossbars)", () => {
    // Band on the middle row only, 0.05 above its gold line, like the 16:9 fixture.
    const rows = [0.237, 0.41, 0.589];
    const edges = findRowEdges(L, strip(rows, { band: (b) => (b === 0.41 ? b - 0.05 : undefined) }));
    expect(edges).toHaveLength(3);
    rows.forEach((y, i) => expect(Math.abs(edges[i]! - y)).toBeLessThan(0.008));
  });

  it("drops an art edge whose own gold line is out of view", () => {
    // The last row's level bar is below the strip, but its art band is inside it.
    const edges = findRowEdges(L, strip([0.237, 0.41, 0.589, 0.88], { band: (b) => (b === 0.88 ? 0.81 : undefined) }));
    expect(edges).toHaveLength(3);
    expect(edges.at(-1)!).toBeLessThan(0.6);
  });

  it("returns nothing when two edges disagree and neither has company", () => {
    expect(findRowEdges(L, strip([0.3, 0.55]))).toEqual([]);
  });

  it("reads a 16:9 grid with its own layout", () => {
    const rows = [0.287, 0.4824, 0.6787];
    const found = visibleRows(L169, strip(rows, { layout: L169 }));
    expect(found).toHaveLength(3);
    rows.forEach((y, i) => expect(Math.abs(found[i]!.barTop - y)).toBeLessThan(0.008));
  });
});

describe("scrollShift", () => {
  const signatures = (sample: Sample) => visibleRows(L, sample).map((row) => rowSignature(L, sample, row));
  // Row contents by absolute list position, so a scroll is just a different window onto them.
  const content = (first: number) => (row: number, column: number) => 40 + (((first + row) * 7 + column * 13) % 6) * 25;

  it("counts how many rows moved up", () => {
    const before = strip([0.237, 0.41, 0.589, 0.765], { art: content(0) });
    const after = strip([0.237, 0.41, 0.589, 0.765], { art: content(2) });
    expect(scrollShift(signatures(before), signatures(after))).toBe(2);
  });

  it("works when the rows land at a different height", () => {
    const before = strip([0.345, 0.521, 0.697], { art: content(0) });
    const after = strip([0.341, 0.341 + L.rowPitch, 0.341 + 2 * L.rowPitch], { art: content(1) });
    expect(scrollShift(signatures(before), signatures(after))).toBe(1);
  });

  it("returns 0 when nothing moved (the end of the list)", () => {
    const frame = strip([0.237, 0.41, 0.589, 0.765], { art: content(5) });
    expect(scrollShift(signatures(frame), signatures(frame))).toBe(0);
  });

  it("returns null when no row is in both reads", () => {
    const before = strip([0.237, 0.41], { art: content(0) });
    const after = strip([0.237, 0.41], { art: content(2) });
    expect(scrollShift(signatures(before), signatures(after))).toBeNull();
  });

  it("refuses to guess when identical rows line up more than one way", () => {
    const same = { art: () => 120 };
    expect(scrollShift(signatures(strip([0.237, 0.41, 0.589], same)), signatures(strip([0.237, 0.41, 0.589], same)))).toBeNull();
  });
});

describe("gridLayout", () => {
  it("uses the measured 16:10 layout, a few pixels either way", () => {
    expect(gridLayout({ width: 2880, height: 1800 })).toBe(GRID_16_10);
    expect(gridLayout({ width: 2800, height: 1752 })).toBe(GRID_16_10);
  });

  it("scales heights for 16:9 and keeps the strip's bottom distance from the footer", () => {
    for (const frame of [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 3840, height: 2160 }]) {
      const layout = gridLayout(frame)!;
      expect(layout.strip.x).toBe(GRID_16_10.strip.x);
      expect(layout.strip.y).toBeCloseTo(0.1167, 4);
      expect(layout.strip.y + layout.strip.height).toBeCloseTo(0.8389, 4);
      // Measured at 1920×1080: rows 211-212 px apart.
      expect(layout.rowPitch * 1080).toBeGreaterThan(210);
      expect(layout.rowPitch * 1080).toBeLessThan(214);
    }
  });

  it("refuses shapes that haven't been measured", () => {
    expect(gridLayout({ width: 1920, height: 1440 })).toBeNull(); // 4:3
    expect(gridLayout({ width: 3440, height: 1440 })).toBeNull(); // 21:9
    expect(gridLayout({ width: 1920, height: 1150 })).toBeNull(); // between 16:9 and 16:10
  });
});
