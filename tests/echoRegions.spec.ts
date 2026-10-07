import { describe, expect, it } from "vitest";
import { MAIN_STAT_ROW, SECONDARY_STAT_ROW, SUBSTAT_BLOCK } from "@wutheringtools/scanner-core";
import { STAT_ROW_PAD_Y, echoReadRegions, padStatRow } from "@/session/echoRegions";

const bottom = (r: { y: number; height: number }) => r.y + r.height;

describe("stat row padding", () => {
  it("adds margin above and below the main and secondary rows (Windows OCR misreads edge text)", () => {
    const main = padStatRow(MAIN_STAT_ROW);
    expect(main.y).toBeCloseTo(MAIN_STAT_ROW.y - STAT_ROW_PAD_Y);
    expect(bottom(main)).toBeCloseTo(bottom(MAIN_STAT_ROW) + STAT_ROW_PAD_Y);
    expect(main.x).toBe(MAIN_STAT_ROW.x);
    expect(main.width).toBe(MAIN_STAT_ROW.width);
  });

  it("keeps each padded row clear of its neighbours", () => {
    const main = padStatRow(MAIN_STAT_ROW);
    const secondary = padStatRow(SECONDARY_STAT_ROW);
    // Padding may overlap the neighbour's own padding, never its unpadded text row.
    expect(bottom(main)).toBeLessThan(SECONDARY_STAT_ROW.y);
    expect(secondary.y).toBeGreaterThan(bottom(MAIN_STAT_ROW));
    expect(bottom(secondary)).toBeLessThan(SUBSTAT_BLOCK.y);
  });

  it("reads the padded rows", () => {
    const regions = echoReadRegions({ width: 2880, height: 1800 });
    const main = regions.find((r) => r.id === "mainStat")?.region;
    expect(main?.height).toBeCloseTo(MAIN_STAT_ROW.height + 2 * STAT_ROW_PAD_Y);
  });
});
