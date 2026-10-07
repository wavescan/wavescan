import { beforeAll, describe, expect, it } from "vitest";
import { loadBundledScannerData } from "@/data/scannerData";
import { inferRank, statNumber, valueAtLevel } from "@/session/echoRank";
import { extractEcho } from "@/session/echoExtract";
import { readingOrder } from "@/session/ocrText";
import { buildScan } from "@/session/exportScan";
import type { OcrLine, RegionText } from "@/ipc/types";

beforeAll(() => {
  loadBundledScannerData();
});

/**
 * In-game main stat ranges (value at +0 and at the rank's cap), from the community stat
 * table. Every row must come out of the bundled max values + the growth formula.
 */
const IN_GAME_RANGES: [cost: number, stat: string, rank: number, atZero: number, atCap: number][] = [
  [1, "HP", 2, 2.8, 7.2],
  [1, "HP", 3, 3.0, 10.2],
  [1, "HP", 4, 3.4, 14.2],
  [1, "HP", 5, 4.5, 22.8],
  [1, "ATK", 2, 2.2, 5.7],
  [1, "ATK", 5, 3.6, 18.0],
  [3, "Electro", 2, 3.7, 9.6],
  [3, "Electro", 3, 4.0, 14.0],
  [3, "Electro", 4, 4.5, 18.9],
  [3, "Electro", 5, 6.0, 30.0],
  [3, "DEF", 2, 4.7, 12.3],
  [3, "EnergyRegen", 4, 4.8, 20.1],
  [4, "CritRate", 3, 2.9, 9.8],
  [4, "CritDMG", 5, 8.8, 44.0],
  [4, "HealingBonus", 4, 3.9, 16.3],
];

const FLAT_RANGES: [cost: number, rank: number, atZero: number, atCap: number][] = [
  [1, 2, 114, 296],
  [1, 3, 152, 516],
  [1, 4, 228, 957],
  [1, 5, 456, 2280],
  [3, 2, 12, 31],
  [3, 3, 13, 44],
  [3, 4, 15, 63],
  [3, 5, 20, 100],
  [4, 2, 18, 46],
  [4, 3, 20, 68],
  [4, 4, 22, 92],
  [4, 5, 30, 150],
];

const CAP: Record<number, number> = { 2: 10, 3: 15, 4: 20, 5: 25 };

describe("valueAtLevel", () => {
  it.each(FLAT_RANGES)("cost %i rank %i flat stat: %i at +0, %i at cap", (_cost, rank, atZero, atCap) => {
    expect(Math.round(valueAtLevel(atCap, rank, 0) ?? NaN)).toBe(atZero);
    expect(valueAtLevel(atCap, rank, CAP[rank] ?? 0)).toBeCloseTo(atCap);
  });

  it("returns null above the rank's level cap", () => {
    expect(valueAtLevel(296, 2, 11)).toBeNull();
    expect(valueAtLevel(2280, 5, 26)).toBeNull();
  });
});

describe("inferRank", () => {
  it.each(IN_GAME_RANGES)("cost %i %s rank %i at +0 (%f%%) and at cap (%f%%)", (cost, stat, rank, atZero, atCap) => {
    const flat = FLAT_RANGES.find(([c, r]) => c === cost && r === rank);
    const secondary = (level: number) => (flat ? Math.round(valueAtLevel(flat[3], rank, level) ?? NaN) : null);
    const cap = CAP[rank] ?? 0;
    for (const [level, value] of [
      [0, atZero],
      [cap, atCap],
    ] as const) {
      const result = inferRank({ cost, level, secondaryValue: secondary(level), mainStatKey: stat, mainStatValue: value });
      expect(result).toEqual({ rank, confidence: "high" });
    }
  });

  it("finds every rank from the secondary stat alone, at every level", () => {
    for (const [cost, rank, , atCap] of FLAT_RANGES) {
      for (let level = 0; level <= (CAP[rank] ?? 0); level++) {
        const secondaryValue = Math.round(valueAtLevel(atCap, rank, level) ?? NaN);
        const result = inferRank({ cost, level, secondaryValue, mainStatKey: null, mainStatValue: null });
        expect(result, `cost ${cost} rank ${rank} +${level}`).toEqual({ rank, confidence: "high" });
      }
    }
  });

  it("flags a rank when the main stat disagrees with the secondary stat", () => {
    // HP 114 says rank 2, but 4.5% HP is the rank 5 value.
    const result = inferRank({ cost: 1, level: 0, secondaryValue: 114, mainStatKey: "HP", mainStatValue: 4.5 });
    expect(result).toEqual({ rank: 2, confidence: "low" });
  });

  it("uses the main stat alone with low confidence when the secondary stat is unreadable", () => {
    const result = inferRank({ cost: 3, level: 0, secondaryValue: null, mainStatKey: "Electro", mainStatValue: 3.7 });
    expect(result).toEqual({ rank: 2, confidence: "low" });
  });

  it("returns null instead of guessing", () => {
    expect(inferRank({ cost: 1, level: null, secondaryValue: 114, mainStatKey: "HP", mainStatValue: 2.8 }).rank).toBeNull();
    expect(inferRank({ cost: 1, level: 0, secondaryValue: 300, mainStatKey: null, mainStatValue: null }).rank).toBeNull();
    // Level 12 is above rank 2's cap, and 114 is far too low for ranks 3-5 at +12.
    expect(inferRank({ cost: 1, level: 12, secondaryValue: 114, mainStatKey: null, mainStatValue: null }).rank).toBeNull();
  });

  it("reads numbers out of stat values", () => {
    expect(statNumber("2.8%")).toBe(2.8);
    expect(statNumber("114")).toBe(114);
    expect(statNumber("x")).toBeNull();
    expect(statNumber(undefined)).toBeNull();
  });
});

const at = (text: string, x: number, y: number, width = 100, height = 40): OcrLine => ({
  text,
  bounds: { x, y, width, height },
});
const region = (id: string, lines: OcrLine[]): RegionText => ({ id, lines, width: 755, height: 50, elapsed_ms: 1 });

/** A +0 rank 2 echo, laid out as Windows OCR returned it on the 2026-10-06 test account. */
function rankTwoPanel(name: string, main: OcrLine[], secondary: OcrLine[]): RegionText[] {
  return [
    region("name", [at(name, 0, 5, 400)]),
    region("level", [at("+0", 0, 5, 60)]),
    region("mainStat", main),
    region("secondaryStat", secondary),
    region("substatLabels", []),
    region("substatValues", []),
    region("substatBlock", []),
  ];
}

describe("reading order (2026-10-06 Windows report: main stat came out as '?')", () => {
  it("puts a row's label before its value even when OCR returns the value first", () => {
    const lines = readingOrder([at("2.8%", 620, 6), at("HP", 2, 5, 50)]);
    expect(lines.map((l) => l.text)).toEqual(["HP", "2.8%"]);
  });

  it("keeps separate rows top to bottom", () => {
    const lines = readingOrder([at("Bonus", 0, 50), at("10.9%", 600, 2), at("Resonance Liberation", 0, 0)]);
    expect(lines.map((l) => l.text)).toEqual(["Resonance Liberation", "10.9%", "Bonus"]);
  });

  it("reads Whiff Whaff (HP 2.8%, HP 114) as rank 2 HP, even with the value first", () => {
    const echo = extractEcho(
      rankTwoPanel("Whiff Whaff", [at("2.8%", 620, 6), at("HP", 2, 5, 50)], [at("114", 650, 6), at("HP", 2, 5, 50)]),
    );
    expect(echo.slot.mainStatLabel).toBe("HP");
    expect(echo.confidence.mainStat).toBe("high");
    expect(echo.level).toBe(0);
    expect({ rank: echo.rank, confidence: echo.confidence.rank }).toEqual({ rank: 2, confidence: "high" });
  });

  it("doesn't treat the same echo at a different rarity as a duplicate", () => {
    const rank2 = extractEcho(rankTwoPanel("Whiff Whaff", [at("HP 2.8%", 2, 5, 700)], [at("HP 114", 2, 5, 700)]));
    const rank5 = extractEcho(rankTwoPanel("Whiff Whaff", [at("HP 4.5%", 2, 5, 700)], [at("HP 456", 2, 5, 700)]));
    expect(rank5.rank).toBe(5);
    expect(rank5.signature).not.toBe(rank2.signature);
  });

  it("exports the three echoes from that scan as rank 2 with their main stats", () => {
    const echoes = [
      rankTwoPanel("Stonewall Bracer", [at("Electro DMG Bonus 3.7%", 2, 5, 700)], [at("ATK 12", 2, 5, 700)]),
      rankTwoPanel("Hoartoise", [at("ATK 2.2%", 2, 5, 700)], [at("HP 114", 2, 5, 700)]),
      rankTwoPanel("Whiff Whaff", [at("HP 2.8%", 2, 5, 700)], [at("HP 114", 2, 5, 700)]),
    ].map((panel, i) => ({ ...extractEcho(panel), id: `echo-${i + 1}`, index: i + 1 }));

    const { scan } = buildScan(echoes, {
      scannerVersion: "0.0.1",
      platform: "windows",
      resolution: { width: 2880, height: 1800 },
      mode: "watch",
    });
    expect(scan.echoes.map((e) => [e.echo, e.rank, e.level, e.stat, e.lowConfidence])).toEqual([
      ["StonewallBracer", 2, 0, "Electro", ["echoSet"]],
      ["Hoartoise", 2, 0, "ATK", ["echoSet"]],
      ["WhiffWhaff", 2, 0, "HP", ["echoSet"]],
    ]);
  });
});
