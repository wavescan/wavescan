import { beforeAll, describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { loadBundledScannerData } from "@/data/scannerData";
import { extractEcho, parseLevel } from "@/session/echoExtract";
import { createEchoSession, type EchoCandidate } from "@/session/echoSession";
import { buildScan, expectedSubstatCount } from "@/session/exportScan";
import type { OcrLine, RegionText } from "@/ipc/types";

beforeAll(() => {
  loadBundledScannerData();
});

const line = (text: string, y: number, height = 20): OcrLine => ({
  text,
  bounds: { x: 0, y, width: 200, height },
});
const region = (id: string, lines: OcrLine[]): RegionText => ({ id, lines, width: 400, height: 200, elapsed_ms: 5 });

/** OCR output for the Sabercat Prowler panel in fixtures/screens/echoes (2880x1800). */
function sabercatPanel(critDmg = "17.4%"): RegionText[] {
  return [
    region("name", [line("Sabercat Prowler", 0)]),
    region("level", [line("+25", 0)]),
    region("mainStat", [line("Fusion DMG Bonus 30.0%", 0)]),
    region("secondaryStat", [line("ATK 100", 0)]),
    region("substatLabels", [
      line("Crit. DMG", 0),
      line("Heavy Attack DMG Bonus", 34),
      line("Resonance Skill DMG", 68),
      line("Bonus", 90),
      line("Basic Attack DMG Bonus", 124),
      line("ATK", 158),
    ]),
    region("substatValues", [
      line(critDmg, 0),
      line("9.4%", 34),
      line("7.9%", 68),
      line("8.6%", 124),
      line("8.6%", 158),
    ]),
    region("substatBlock", []),
  ];
}

describe("extractEcho", () => {
  it("reads a full echo panel with scanner-core and the bundled data", () => {
    const echo = extractEcho(sabercatPanel());
    expect(echo.slot.echo).toBe("SabercatProwler");
    expect(echo.slot.cost).toBe(3);
    expect(echo.level).toBe(25);
    expect(echo.slot.mainStatLabel).toBe("Fusion DMG Bonus");
    expect(echo.slot.substats.map((s) => [s.subStat, s.subStatValue])).toEqual([
      ["Crit. DMG", "17.4%"],
      ["Heavy Attack DMG Bonus", "9.4%"],
      ["Resonance Skill DMG Bonus", "7.9%"],
      ["Basic Attack DMG Bonus", "8.6%"],
      ["ATK", "8.6%"],
    ]);
    expect(echo.confidence.substats).toEqual(["high", "high", "high", "high", "high"]);
  });

  it("leaves the set unknown (low confidence) when the echo has several possible sets", () => {
    const echo = extractEcho(sabercatPanel());
    expect(echo.slot.set).toBeNull();
    expect(echo.confidence.set).toBe("low");
  });

  it("flags an illegal substat roll instead of guessing", () => {
    const echo = extractEcho(sabercatPanel("17.5%"));
    expect(echo.confidence.substats[0]).toBe("low");
  });

  it("parses levels strictly", () => {
    expect(parseLevel("+25")).toBe(25);
    expect(parseLevel("+ 5")).toBe(5);
    expect(parseLevel("+0")).toBe(0);
    expect(parseLevel("+26")).toBeNull();
    expect(parseLevel("COST 4")).toBeNull();
  });
});

/** Encodes a sample_regions payload of two solid images (panel + stats). */
function samples(seq: number, fill: number): ArrayBuffer {
  const sizes = [
    [128, 296],
    [128, 64],
  ] as const;
  const total = 12 + sizes.reduce((n, [w, h]) => n + 8 + w * h * 4, 0);
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(seq), true);
  view.setUint32(8, sizes.length, true);
  let offset = 12;
  for (const [w, h] of sizes) {
    view.setUint32(offset, w, true);
    view.setUint32(offset + 4, h, true);
    new Uint8Array(buffer, offset + 8, w * h * 4).fill(fill);
    offset += 8 + w * h * 4;
  }
  return buffer;
}

/** A fake game: `screen` is what's showing; each tick samples it. */
function fakeGame() {
  const state = { seq: 0, fill: 10, panel: sabercatPanel(), reads: 0 };
  const found: EchoCandidate[] = [];
  const session = createEchoSession({
    sampleRegions: async () => samples(++state.seq, state.fill),
    readRegions: async (seq) => {
      state.reads += 1;
      expect(seq).toBe(state.seq); // reads the frame that was just sampled
      return state.panel;
    },
    frameSize: () => ({ width: 2880, height: 1800 }),
    onCandidate: (c) => found.push(c),
  });
  const ticks = async (n: number) => {
    for (let i = 0; i < n; i++) await session.tick();
  };
  return { state, found, session, ticks };
}

describe("echo session (watch mode)", () => {
  it("reads an echo once the panel settles, and not again while it stays", async () => {
    const game = fakeGame();
    await game.ticks(6);
    expect(game.found).toHaveLength(1);
    expect(game.state.reads).toBe(1);
    expect(game.found[0]?.slot.echo).toBe("SabercatProwler");
  });

  it("reads each new echo, and counts an identical echo as a duplicate", async () => {
    const game = fakeGame();
    await game.ticks(6);

    // Player clicks a different echo.
    game.state.fill = 120;
    game.state.panel = sabercatPanel("21.0%");
    await game.ticks(6);
    expect(game.found).toHaveLength(2);

    // Player clicks an echo identical to the first.
    game.state.fill = 200;
    game.state.panel = sabercatPanel();
    await game.ticks(6);
    expect(game.found).toHaveLength(2);
    expect(game.session.stats()).toMatchObject({ scanned: 2, duplicates: 1, errors: 0 });
  });
});

describe("buildScan", () => {
  const schema = JSON.parse(readFileSync("schema/scan.v1.json", "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const meta = {
    scannerVersion: "0.0.1",
    platform: "windows" as const,
    resolution: { width: 2880, height: 1800 },
    mode: "watch" as const,
    scannedAt: new Date("2026-10-06T10:00:00Z"),
  };

  it("produces a valid WutheringToolsScan file with keys, values and flags", () => {
    const candidate = { ...extractEcho(sabercatPanel()), id: "echo-1", index: 1 };
    const { scan, skippedUnknown } = buildScan([candidate], meta);
    expect(validate(scan), JSON.stringify(validate.errors)).toBe(true);
    expect(skippedUnknown).toBe(0);
    expect(scan.echoes[0]).toEqual({
      scanId: "scan-echo-1",
      echo: "SabercatProwler",
      echoSet: null,
      cost: 3,
      rank: 5,
      level: 25,
      stat: "Fusion",
      substats: [
        { type: "CritDMG", value: 17.4 },
        { type: "HeavyAttackDMGBonus", value: 9.4 },
        { type: "ResonanceSkillDMGBonus", value: 7.9 },
        { type: "BasicAttackDMGBonus", value: 8.6 },
        { type: "ATK", value: 8.6 },
      ],
      equippedBy: null,
      lowConfidence: ["echoSet"],
    });
  });

  it("flags substats when fewer were read than the level unlocks", () => {
    // Windows OCR dropped a lone "HP" label (fixture replay, 2026-10-07): 4 rows at +25.
    const panel = sabercatPanel().map((r) =>
      r.id === "substatLabels" ? { ...r, lines: r.lines.filter((l) => l.text !== "ATK") } : r,
    );
    const { scan } = buildScan([{ ...extractEcho(panel), id: "echo-1", index: 1 }], meta);
    expect(scan.echoes[0]?.substats).toHaveLength(4);
    expect(scan.echoes[0]?.lowConfidence).toContain("substats");
    expect(validate(scan), JSON.stringify(validate.errors)).toBe(true);
  });

  it("doesn't flag substats when the count matches the level", () => {
    const { scan } = buildScan([{ ...extractEcho(sabercatPanel()), id: "echo-1", index: 1 }], meta);
    expect(scan.echoes[0]?.lowConfidence).not.toContain("substats");
    expect([0, 4, 5, 15, 24, 25].map(expectedSubstatCount)).toEqual([0, 0, 1, 3, 4, 5]);
  });

  it("keeps a flat HP substat whose label Windows OCR dropped, flagged (scanner-core 0.1.2)", () => {
    // Shadow Stepper at +25 (fixture): "HP" missing before 430.
    const panel = sabercatPanel().map((r) => {
      if (r.id === "substatLabels") return { ...r, lines: r.lines.filter((l) => l.text !== "Basic Attack DMG Bonus") };
      if (r.id === "substatValues") return { ...r, lines: r.lines.map((l) => (l.bounds.y === 124 ? { ...l, text: "430" } : l)) };
      return r;
    });
    const { scan } = buildScan([{ ...extractEcho(panel), id: "echo-1", index: 1 }], meta);
    const echo = scan.echoes[0]!;
    const index = echo.substats.findIndex((s) => s.type === "HP_FLAT");
    expect(echo.substats[index]).toEqual({ type: "HP_FLAT", value: 430 });
    expect(echo.lowConfidence).toContain(`substats.${index}.value`);
    expect(echo.lowConfidence).not.toContain("substats");
  });

  it("skips echoes it couldn't identify and counts them", () => {
    const unknown = { ...extractEcho(sabercatPanel()), id: "echo-2", index: 2 };
    unknown.slot = { ...unknown.slot, echo: null };
    const { scan, skippedUnknown } = buildScan([unknown], meta);
    expect(scan.echoes).toHaveLength(0);
    expect(skippedUnknown).toBe(1);
    expect(validate(scan)).toBe(true);
  });
});
