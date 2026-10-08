import { beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MAIN_STAT_ROW, SECONDARY_STAT_ROW, regionForFrame } from "@wutheringtools/scanner-core";
import type { RegionText } from "@/ipc/types";
import { loadBundledScannerData } from "@/data/scannerData";
import { extractEcho } from "@/session/echoExtract";
import { HP_ASPECT, MIN_HP_SCORE, mainStatLabelRegion, matchHpLabel } from "@/session/hpLabel";
import { samplePng } from "./support/pngSample";

// "HP" label recognition (src/session/hpLabel.ts) against every committed echo capture:
// the main stat row (label from the golden) and the secondary row (always "HP" on cost 1,
// "ATK" on cost 3 and 4). Windows OCR never reads a lone "HP"; this is what reads it instead.

const DIR = "fixtures/screens/echoes";
/** Same as a scan's sample width. */
const SAMPLE_WIDTH = 128;

interface Row {
  name: string;
  hp: boolean;
  path: string;
  frame: { width: number; height: number };
  secondary: boolean;
}

function rows(): Row[] {
  const out: Row[] = [];
  for (const size of readdirSync(DIR).filter((d) => /^\d+x\d+$/.test(d))) {
    const [width, height] = size.split("x").map(Number) as [number, number];
    for (const file of readdirSync(join(DIR, size)).filter((f) => f.endsWith(".json"))) {
      const golden = JSON.parse(readFileSync(join(DIR, size, file), "utf8")) as { stat: string; cost: number };
      const base = { path: join(DIR, size, file.replace(/\.json$/, ".png")), frame: { width, height } };
      out.push({ ...base, name: `${size}/${file} main (${golden.stat})`, hp: golden.stat === "HP", secondary: false });
      out.push({ ...base, name: `${size}/${file} secondary`, hp: golden.cost === 1, secondary: true });
    }
  }
  return out;
}

/** The label region, moved down to the secondary row when asked. */
function labelRegion(row: Row) {
  const region = mainStatLabelRegion(row.frame);
  if (!row.secondary) return region;
  const shift = regionForFrame(SECONDARY_STAT_ROW, row.frame).y - regionForFrame(MAIN_STAT_ROW, row.frame).y;
  return { ...region, y: region.y + shift };
}

describe("matchHpLabel on real captures", () => {
  const all = rows();

  it("covers HP and other labels at every resolution", () => {
    expect(all.filter((r) => r.hp).length).toBeGreaterThanOrEqual(6);
    expect(all.filter((r) => !r.hp).length).toBeGreaterThanOrEqual(20);
    expect(all.some((r) => r.hp && !r.secondary)).toBe(true); // an HP *main* stat
  });

  for (const row of all) {
    it(row.name, async () => {
      const match = matchHpLabel(await samplePng(row.path, labelRegion(row), SAMPLE_WIDTH));
      expect(match.hp, JSON.stringify(match)).toBe(row.hp);
      // Keep a clear margin, so small rendering differences can't flip the answer.
      if (row.hp) {
        expect(match.score).toBeGreaterThan(MIN_HP_SCORE + 0.1);
        expect(match.aspect).toBeGreaterThan(HP_ASPECT.min + 0.2);
        expect(match.aspect).toBeLessThan(HP_ASPECT.max - 0.2);
      } else {
        expect(match.score < MIN_HP_SCORE - 0.3 || match.aspect > HP_ASPECT.max + 0.2).toBe(true);
      }
    });
  }

  it("finds nothing in a blank panel", () => {
    const blank = { width: 64, height: 16, rgba: new Uint8ClampedArray(new ArrayBuffer(64 * 16 * 4)).fill(90) };
    expect(matchHpLabel(blank).hp).toBe(false);
  });
});

describe("extractEcho with the HP label sample", () => {
  beforeAll(() => {
    loadBundledScannerData();
  });

  const line = (text: string, y: number) => ({ text, bounds: { x: 0, y, width: 100, height: 20 } });
  const region = (id: string, ...texts: string[]): RegionText => ({
    id,
    lines: texts.map((t, i) => line(t, i * 30)),
    elapsed_ms: 1,
    width: 500,
    height: 200,
  });
  /** A +0 panel as Windows OCR reads it: values, but no "HP" labels. */
  const panel = (name: string, cost: number, main: string, secondary: string) => [
    region("name", name, `COST ${cost}`),
    region("level", "+0"),
    region("mainStat", main),
    region("secondaryStat", secondary),
    region("substatLabels"),
    region("substatValues"),
    region("substatBlock"),
  ];
  const hpCapture = "fixtures/screens/echoes/2880x1800/whiff-whaff-2star-plus0-hp.png";
  const frame = { width: 2880, height: 1800 };

  it("reads an HP main stat with high confidence when its value fits", async () => {
    const mainStatLabel = await samplePng(hpCapture, mainStatLabelRegion(frame), SAMPLE_WIDTH);
    const echo = extractEcho(panel("Whiff Whaff", 1, "2.8%", "114"), { mainStatLabel });
    expect(echo.slot.mainStatLabel).toBe("HP");
    expect(echo.confidence.mainStat).toBe("high");
    expect(echo.rank).toBe(2);
  });

  // 2026-10-08 report: a cost 3 +0 echo with an HP main stat had none, because HP%, ATK%
  // and every element share one value table at cost 3.
  it("reads a cost 3 HP main stat that the value alone can't tell from ATK or an element", async () => {
    const mainStatLabel = await samplePng(hpCapture, mainStatLabelRegion(frame), SAMPLE_WIDTH);
    const without = extractEcho(panel("Spearback", 3, "3.7%", "12"));
    expect(without.slot.mainStatLabel).toBeFalsy();
    const echo = extractEcho(panel("Spearback", 3, "3.7%", "12"), { mainStatLabel });
    expect(echo.slot.mainStatLabel).toBe("HP");
    expect(echo.confidence.mainStat).toBe("high");
  });

  it("flags HP when the value doesn't fit it", async () => {
    const mainStatLabel = await samplePng(hpCapture, mainStatLabelRegion(frame), SAMPLE_WIDTH);
    const echo = extractEcho(panel("Whiff Whaff", 1, "9.9%", "114"), { mainStatLabel });
    expect(echo.slot.mainStatLabel).toBe("HP");
    expect(echo.confidence.mainStat).toBe("low");
  });
});
