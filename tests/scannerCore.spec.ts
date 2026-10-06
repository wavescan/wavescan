import { beforeAll, describe, expect, it } from "vitest";
import {
  inferCostFromSecondaryStat,
  matchEchoName,
  normalizeStatLabel,
  setScannerGameData,
} from "@wutheringtools/scanner-core";

// Smoke test: the published package resolves in this toolchain and works with game data
// supplied by Wavescan (ADR 0019). Real data will come from scanner-data.json.
beforeAll(() => {
  setScannerGameData({
    echoes: {
      SabercatProwler: { key: "SabercatProwler", name: "Sabercat Prowler", class: "Elite" },
      BellBorneGeochelone: { key: "BellBorneGeochelone", name: "Bell-Borne Geochelone", class: "Overlord" },
    },
    echoCostByClass: { Overlord: 4, Elite: 3, Common: 1 },
    statsTable: {},
    subStatsTable: { CritDMG: [12.6, 13.8, 15, 16.2, 17.4, 18.6, 19.8, 21] },
    verboseStatLabelMap: { "Crit. DMG": "CritDMG", "Crit DMG": "CritDMG" },
    flatBonusesByRankByType: { 1: { 5: 2280 }, 3: { 5: 100 }, 4: { 5: 150 } },
  });
});

describe("@wutheringtools/scanner-core", () => {
  it("matches echo names despite OCR noise", () => {
    expect(matchEchoName("Sabercat Prowlor")?.key).toBe("SabercatProwler");
  });

  it("normalises stat labels against the supplied label map", () => {
    expect(normalizeStatLabel("Crit. DMG")).toBe("Crit. DMG");
  });

  it("infers cost from the fixed secondary stat at +25", () => {
    expect(inferCostFromSecondaryStat("ATK 150")).toBe(4);
    expect(inferCostFromSecondaryStat("HP 2280")).toBe(1);
  });
});
