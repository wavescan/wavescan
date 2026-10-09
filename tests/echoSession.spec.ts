import { beforeAll, describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { loadBundledScannerData } from "@/data/scannerData";
import { echoSkillRow, extractEcho, parseLevel, substatRowTexts } from "@/session/echoExtract";
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

  // Sigillum +25 from the 2026-10-08 report (fixtures/raw/2026-10-08_4pm_test/5.png):
  // Windows OCR dropped the lone "HP" label of the last row from the label column.
  function sigillumPanel(rows: string[]): RegionText[] {
    const ids = ["substatRow1", "substatRow2", "substatRow3", "substatRow4", "substatRow5"];
    return [
      region("name", [line("Sigillum", 0)]),
      region("level", [line("+25", 0)]),
      region("mainStat", [line("Crit. DMG 44.0%", 0)]),
      region("secondaryStat", [line("ATK 150", 0)]),
      region("substatLabels", [
        line("Crit. DMG", 0),
        line("Crit. Rate", 34),
        line("Resonance Liberation", 68),
        line("DMG Bonus", 90),
        line("Heavy Attack DMG Bonus", 124),
      ]),
      region("substatValues", [line("17.4%", 0), line("6.9%", 34), line("9.4%", 68), line("8.6%", 124), line("10.1%", 158)]),
      region("substatBlock", []),
      ...rows.map((text, i) => region(ids[i]!, text ? text.split("\n").map((t, j) => line(t, j * 22)) : [])),
    ];
  }

  it("recovers a substat the columns missed from the per-row crops, like Wuthering Tools", () => {
    const echo = extractEcho(
      sigillumPanel([
        "Crit. DMG 17.4%",
        "Crit. Rate 6.9%",
        "Resonance Liberation 9.4%\nDMG Bonus",
        "Heavy Attack DMG Bonus 8.6%",
        "HP 10.1%",
      ]),
    );
    expect(echo.slot.substats.map((s) => [s.subStat, s.subStatValue])).toEqual([
      ["Crit. DMG", "17.4%"],
      ["Crit. Rate", "6.9%"],
      ["Resonance Liberation DMG Bonus", "9.4%"],
      ["Heavy Attack DMG Bonus", "8.6%"],
      ["HP", "10.1%"],
    ]);
  });

  it("keeps the column result when the per-row crops don't recover more", () => {
    const echo = extractEcho(sigillumPanel(["Crit. DMG 17.4%", "", "", "", ""]));
    expect(echo.slot.substats.filter((s) => s.subStat)).toHaveLength(4);
  });

  it("works without per-row crops", () => {
    expect(extractEcho(sigillumPanel([])).slot.substats.filter((s) => s.subStat)).toHaveLength(4);
  });

  it("parses levels strictly", () => {
    expect(parseLevel("+25")).toBe(25);
    expect(parseLevel("+ 5")).toBe(5);
    expect(parseLevel("+0")).toBe(0);
    expect(parseLevel("+26")).toBeNull();
    expect(parseLevel("COST 4")).toBeNull();
  });
});

describe("substatRowTexts", () => {
  const rows = (texts: (string | null)[]) => (id: string) => texts[Number(id.slice(-1)) - 1] ?? null;

  it("is undefined when the per-row crops weren't read", () => {
    expect(substatRowTexts(rows([null, null, null, null, null]), 25)).toBeUndefined();
  });

  it("drops description text, which scanner-core would otherwise take as a row", () => {
    // Stonewall Bracer +0 (2026-10-08 report): the Echo Skill text sits where substats go.
    const description = ["ho Skill", "charge forward, dealing 80.96%", "deal 121.44% Physical DMG, and gain a", "", ""];
    expect(substatRowTexts(rows(description), null)).toEqual(["", "", "", "", ""]);
  });

  it("drops rows past what the level unlocks", () => {
    const texts = ["Crit. Rate 6.3%", "ATK 40", "HP 8.6%", "DEF 50", "Energy Regen 9.2%"];
    expect(substatRowTexts(rows(texts), 10)).toEqual(["Crit. Rate 6.3%", "ATK 40", "", "", ""]);
    expect(substatRowTexts(rows(texts), 25)).toEqual(texts);
  });
});

describe("echoSkillRow", () => {
  const rows = (texts: (string | null)[]) => (id: string) => texts[Number(id.slice(-1)) - 1] ?? null;

  it("finds the Echo Skill heading, also when the crop cuts it", () => {
    expect(echoSkillRow(rows(["ho Skill", "mmon a Spearback to perform 5", null, null, null]))).toBe(0);
    expect(echoSkillRow(rows(["Crit. Rate 6.3%", "noise\nEcho Skill", "", "", ""]))).toBe(1);
    expect(echoSkillRow(rows(["ho Skill —", null, null, null, null]))).toBe(0);
    expect(echoSkillRow(rows(["ho Skill_ -", null, null, null, null]))).toBe(0);
  });

  it("doesn't take a Skill stat for the heading", () => {
    expect(echoSkillRow(rows(["Resonance Skill DMG Bonus 8.6%", "Resonance Skill", "ATK 40", "", ""]))).toBeNull();
    expect(echoSkillRow(rows([null, null, null, null, null]))).toBeNull();
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

  /** Spearback +5 with no substats tuned (2026-10-09 diagnostics report, Tesseract text). */
  function spearbackPanel(): RegionText[] {
    const rowTexts = [
      "ho Skill",
      "mmon a Spearback to perform 5",
      "nsecutive attacks. The first 4",
      "acks deal 21.53% Physical DMG,",
      "d the last deals 36.92% Physical",
    ];
    return [
      region("name", [line("Spearback wt BS", 0)]),
      region("level", [line("+5 3", 0)]),
      region("mainStat", [line("HP 6.7%", 0)]),
      region("secondaryStat", [line("ATK 21", 0)]),
      region("substatLabels", [line("ho Skill", 0), line("mmon a Spearback to perfol", 34)]),
      region("substatValues", [line("rm 5", 34), line("a I", 68)]),
      region("substatBlock", rowTexts.slice(0, 4).map((t, i) => line(t, i * 34))),
      ...rowTexts.map((t, i) => region(`substatRow${i + 1}`, [line(t, 0)])),
    ];
  }

  it("doesn't flag an echo whose unlocked slot isn't tuned yet", () => {
    const { scan } = buildScan([{ ...extractEcho(spearbackPanel()), id: "echo-1", index: 1 }], meta);
    const echo = scan.echoes[0]!;
    expect(echo).toMatchObject({ echo: "Spearback", level: 5, stat: "HP", substats: [] });
    expect(echo.lowConfidence ?? []).not.toContain("substats");
  });

  it("flags missing substats when the Echo Skill heading isn't right after them", () => {
    // +10 with one substat read, but the heading is two rows down: a row was lost.
    const panel = spearbackPanel().map((r) => {
      if (r.id === "level") return { ...r, lines: [line("+10", 0)] };
      if (r.id === "substatRow1") return { ...r, lines: [line("Crit. Rate 6.3%", 0)] };
      if (r.id === "substatRow2") return { ...r, lines: [line("ATK", 0)] };
      if (r.id === "substatRow3") return { ...r, lines: [line("ho Skill", 0)] };
      return r;
    });
    const extracted = extractEcho(panel);
    expect(extracted.echoSkillRow).toBe(2);
    const { scan } = buildScan([{ ...extracted, id: "echo-1", index: 1 }], meta);
    expect(scan.echoes[0]?.lowConfidence).toContain("substats");
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
