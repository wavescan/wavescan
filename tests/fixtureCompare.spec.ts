import { describe, expect, it } from "vitest";
import type { ScanEcho } from "@/session/exportScan";
import { compareEcho, summarize, type GoldenEcho } from "./support/fixtureCompare";

const golden: GoldenEcho = {
  echo: "SabercatProwler",
  echoSet: null,
  cost: 3,
  rank: 5,
  level: 25,
  stat: "Fusion",
  substats: [
    { type: "CritDMG", value: 17.4 },
    { type: "ATK", value: 8.6 },
  ],
  equippedBy: "Suisui",
};

const exported = (overrides: Partial<ScanEcho> = {}): ScanEcho => ({
  scanId: "scan-echo-1",
  echo: "SabercatProwler",
  echoSet: null,
  cost: 3,
  rank: 5,
  level: 25,
  stat: "Fusion",
  substats: [
    { type: "CritDMG", value: 17.4 },
    { type: "ATK", value: 8.6 },
  ],
  equippedBy: null,
  lowConfidence: ["echoSet"],
  ...overrides,
});

const outcomes = (golden: GoldenEcho, echo: ScanEcho | null) =>
  Object.fromEntries(compareEcho(golden, echo).map((r) => [r.field, r.outcome]));

describe("compareEcho", () => {
  it("marks matching fields correct and skips unconfirmed or unread ones", () => {
    expect(outcomes(golden, exported())).toEqual({
      echo: "correct",
      echoSet: "skipped",
      cost: "correct",
      rank: "correct",
      level: "correct",
      stat: "correct",
      equippedBy: "skipped",
      "substats[CritDMG 17.4]": "correct",
      "substats[ATK 8.6]": "correct",
    });
  });

  it("compares the set when the golden has one", () => {
    const withSet = { ...golden, echoSet: "SoundofTrueName" };
    expect(outcomes(withSet, exported()).echoSet).toBe("flagged");
    expect(outcomes(withSet, exported({ echoSet: "SoundofTrueName", lowConfidence: [] })).echoSet).toBe("correct");
    expect(outcomes(withSet, exported({ echoSet: "HaloofStarryRadiance", lowConfidence: [] })).echoSet).toBe("wrong");
  });

  it("calls an unflagged different value wrong, a flagged one flagged, and null missing", () => {
    expect(outcomes(golden, exported({ stat: "ATK" })).stat).toBe("wrong");
    expect(outcomes(golden, exported({ stat: "ATK", lowConfidence: ["stat"] })).stat).toBe("flagged");
    expect(outcomes(golden, exported({ level: null })).level).toBe("missing");
  });

  it("matches substats by content, so one dropped row doesn't shift the rest", () => {
    const dropped = exported({ substats: [{ type: "ATK", value: 8.6 }] });
    expect(outcomes(golden, dropped)).toMatchObject({ "substats[ATK 8.6]": "correct", "substats[CritDMG 17.4]": "wrong" });
    const flaggedDrop = exported({ substats: [{ type: "ATK", value: 8.6 }], lowConfidence: ["substats"] });
    expect(outcomes(golden, flaggedDrop)["substats[CritDMG 17.4]"]).toBe("flagged");
  });

  it("pairs a misread value with what it should have been", () => {
    const misread = exported({ substats: [{ type: "CritDMG", value: 17.5 }, { type: "ATK", value: 8.6 }] });
    expect(outcomes(golden, misread)["substats[CritDMG 17.4]"]).toBe("wrong");
    const flagged = exported({ ...misread, lowConfidence: ["substats.0.value"] });
    expect(outcomes(golden, flagged)["substats[CritDMG 17.4]"]).toBe("flagged");
  });

  it("calls an extra substat wrong", () => {
    const extra = exported({ substats: [...golden.substats, { type: "HP", value: 6.4 }] });
    expect(outcomes(golden, extra)["substats[none]"]).toBe("wrong");
  });

  it("counts every field as missing when the echo wasn't identified", () => {
    const results = compareEcho(golden, null).filter((r) => r.outcome !== "skipped");
    expect(results.every((r) => r.outcome === "missing")).toBe(true);
  });
});

describe("summarize", () => {
  it("computes accuracy over compared fields only", () => {
    const summary = summarize(compareEcho(golden, exported({ stat: "ATK" })));
    expect(summary).toMatchObject({ compared: 7, correct: 6, wrong: 1, skipped: 2 });
    expect(summary.accuracy).toBeCloseTo(6 / 7);
  });
});
