import { beforeAll, describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { loadBundledScannerData } from "@/data/scannerData";
import { echoSkillRow, extractEcho, parseLevel, substatRowTexts } from "@/session/echoExtract";
import { createEchoSession, type EchoCandidate } from "@/session/echoSession";
import { buildScan, expectedSubstatCount } from "@/session/exportScan";
import type { RegionText } from "@/ipc/types";
import { line, region, sabercatPanel } from "./support/echoPanels";

beforeAll(() => {
  loadBundledScannerData();
});

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

/**
 * Encodes a sample_regions payload of solid images: the panel and stats in `fill`, the
 * set icon and main-stat label, and the "Equipped by" box in `rowFill`.
 */
function samples(seq: number, fill: number, rowFill = fill): ArrayBuffer {
  const sizes = [
    [128, 296],
    [128, 64],
    [8, 8],
    [8, 8],
    [128, 11],
  ] as const;
  const total = 12 + sizes.reduce((n, [w, h]) => n + 8 + w * h * 4, 0);
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(seq), true);
  view.setUint32(8, sizes.length, true);
  let offset = 12;
  for (const [i, [w, h]] of sizes.entries()) {
    view.setUint32(offset, w, true);
    view.setUint32(offset + 4, h, true);
    new Uint8Array(buffer, offset + 8, w * h * 4).fill(i === sizes.length - 1 ? rowFill : fill);
    offset += 8 + w * h * 4;
  }
  return buffer;
}

/**
 * A fake game: `panel` is the OCR of what's showing, `fill` its pixels, and `equipped` /
 * `rowFill` the "Equipped by" box's text and pixels. Each tick samples it, 125 ms apart.
 */
function fakeGame() {
  const state = { seq: 0, fill: 10, rowFill: 10, panel: sabercatPanel(), equipped: [] as string[], reads: 0, boxReads: 0, time: 0 };
  const found: EchoCandidate[] = [];
  const updated: EchoCandidate[] = [];
  const session = createEchoSession({
    sampleRegions: async () => samples(++state.seq, state.fill, state.rowFill),
    readRegions: async (seq, regions) => {
      expect(seq).toBe(state.seq); // reads the frame that was just sampled
      const box = region("equippedBy", state.equipped.map((t, i) => line(t, i * 30)));
      if (regions.length === 1 && regions[0]?.id === "equippedBy") {
        state.boxReads += 1;
        return [box];
      }
      state.reads += 1;
      return state.panel.some((r) => r.id === "equippedBy") ? state.panel : [...state.panel, box];
    },
    frameSize: () => ({ width: 2880, height: 1800 }),
    onCandidate: (c) => found.push(c),
    onCandidateUpdate: (c) => updated.push(c),
    now: () => state.time,
  });
  const ticks = async (n: number) => {
    for (let i = 0; i < n; i++) {
      await session.tick();
      state.time += 125;
    }
  };
  return { state, found, updated, session, ticks };
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

  it("skips a frame from another screen, counts it, and reads again back on Bag → Echoes", async () => {
    const game = fakeGame();
    // Player opens the Weapons tab: a settled frame whose header isn't "Echoes".
    game.state.panel = sabercatPanel().map((r) => (r.id === "header" ? region("header", [line("Weapons 412/2000", 0)]) : r));
    await game.ticks(6);
    expect(game.found).toHaveLength(0);
    expect(game.session.stats()).toMatchObject({ scanned: 0, wrongScreen: 1, screen: "unknown" });

    // Back on Echoes.
    game.state.fill = 120;
    game.state.panel = sabercatPanel();
    await game.ticks(6);
    expect(game.found).toHaveLength(1);
    expect(game.session.stats()).toMatchObject({ scanned: 1, wrongScreen: 1, screen: "bag.echoes" });
  });

  it("keeps an echo it can't identify when the header says Echoes (a new echo can be fixed in review)", async () => {
    const game = fakeGame();
    game.state.panel = sabercatPanel().map((r) => (r.id === "name" ? region("name", [line("Brand New Echo", 0)]) : r));
    await game.ticks(6);
    expect(game.found).toHaveLength(1);
    expect(game.session.stats().wrongScreen).toBe(0);
  });
});

describe("echo session: an Equipped by line drawn after the read", () => {
  /** The game shows the stats first; the line (and its pixels) arrive a few ticks later. */
  async function lineDrawnLate(game: ReturnType<typeof fakeGame>) {
    await game.ticks(4);
    expect(game.found).toHaveLength(1);
    expect(game.found[0]?.raw.equippedBy).toBe("");
    game.state.rowFill = 200;
    game.state.equipped = ["Equipped by Augusta"];
  }

  it("reads the box again and reports the echo with the line, marked as read late", async () => {
    const game = fakeGame();
    await lineDrawnLate(game);
    await game.ticks(6);
    expect(game.state.reads).toBe(1);
    expect(game.state.boxReads).toBe(1);
    expect(game.found).toHaveLength(1);
    expect(game.updated).toHaveLength(1);
    expect(game.updated[0]).toMatchObject({ id: game.found[0]?.id, equippedByLate: true });
    expect(game.updated[0]?.raw.equippedBy).toBe("Equipped by Augusta");
  });

  it("doesn't watch an echo whose line was there at the read", async () => {
    const game = fakeGame();
    game.state.equipped = ["Equipped by Chisa"];
    await game.ticks(4);
    game.state.rowFill = 200; // anything changing in the box afterwards is ignored
    game.state.equipped = ["Equipped by Augusta"];
    await game.ticks(6);
    expect(game.found[0]?.raw.equippedBy).toBe("Equipped by Chisa");
    expect(game.state.boxReads).toBe(0);
    expect(game.updated).toHaveLength(0);
  });

  it("never gives an echo the line of the next one the user clicks", async () => {
    const game = fakeGame();
    await game.ticks(4);
    // The player clicks another echo, which is equipped.
    game.state.fill = 120;
    game.state.rowFill = 200;
    game.state.panel = sabercatPanel("21.0%");
    game.state.equipped = ["Equipped by Augusta"];
    await game.ticks(6);
    expect(game.found).toHaveLength(2);
    expect(game.found[1]?.raw.equippedBy).toBe("Equipped by Augusta");
    expect(game.updated).toHaveLength(0);
    expect(game.state.boxReads).toBe(0);
  });

  it("stops watching after a moment", async () => {
    const game = fakeGame();
    await game.ticks(4);
    await game.ticks(14); // 1.75 s
    game.state.rowFill = 200;
    game.state.equipped = ["Equipped by Augusta"];
    await game.ticks(6);
    expect(game.state.boxReads).toBe(0);
    expect(game.updated).toHaveLength(0);
  });

  it("leaves the echo as it was when the box changed but has no line", async () => {
    const game = fakeGame();
    await game.ticks(4);
    game.state.rowFill = 200; // e.g. the background behind the panel moved
    await game.ticks(6);
    expect(game.state.boxReads).toBe(1);
    expect(game.updated).toHaveLength(0);
  });
});

describe("echo session errors", () => {
  it("reports a Rust error's message, not [object Object]", async () => {
    const errors: string[] = [];
    let seq = 0;
    const session = createEchoSession({
      sampleRegions: async () => samples(++seq, 10),
      readRegions: async () => Promise.reject({ kind: "FrameNotPinned", message: "That frame is no longer available" }),
      frameSize: () => ({ width: 2880, height: 1800 }),
      onCandidate: () => {},
      onError: (m) => errors.push(m),
    });
    for (let i = 0; i < 6; i++) await session.tick();
    expect(errors).toEqual(["That frame is no longer available"]);
    expect(session.stats().errors).toBe(1);
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
