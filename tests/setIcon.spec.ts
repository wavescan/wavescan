import { beforeAll, describe, expect, it } from "vitest";
import { scannerGameData } from "@wutheringtools/scanner-core";
import bundledIcons from "@/data/set-icons.json";
import scannerData from "@/data/scanner-data.json";
import { loadBundledScannerData } from "@/data/scannerData";
import { loadSetIcons, setIconReference } from "@/data/setIcons";
import { MIN_MARGIN, MIN_SCORE, matchSetIcon, setIconSearchRegion } from "@/session/setIcon";
import { flatSample, iconSample } from "./support/samplePayload";

beforeAll(() => {
  loadBundledScannerData();
});

describe("bundled set icons", () => {
  it("has a 32×32 reference for every set in the game data", () => {
    for (const set of Object.keys(scannerData.data.echoSets)) {
      expect(setIconReference(set), set).toMatchObject({ width: 32, height: 32 });
    }
  });

  it("rejects files it can't use", () => {
    expect(() => loadSetIcons({ format: "other" })).toThrow("not a set-icons file");
    expect(() => loadSetIcons({ ...bundledIcons, icons: { Broken: "AAAA" } })).toThrow("Broken has the wrong size");
  });
});

describe("matchSetIcon", () => {
  // Every echo with more than one possible set, with each of its sets shown.
  const multiSet = () =>
    Object.values(scannerGameData().echoes)
      .map((e) => e.sets ?? [])
      .filter((sets) => sets.length > 1);

  // Every possible set of every multi-set echo: a few seconds, hence the longer timeout.
  it("picks the shown set among every multi-set echo's candidates", { timeout: 30_000 }, () => {
    const seen = new Set<string>();
    for (const sets of multiSet()) {
      const key = [...sets].sort().join();
      if (seen.has(key)) continue;
      seen.add(key);
      for (const shown of sets) {
        const match = matchSetIcon(iconSample(shown), sets);
        expect(match.set, `${shown} among ${key}: ${JSON.stringify(match.scores)}`).toBe(shown);
        expect(match.confidence).toBe("high");
      }
    }
  });

  it("finds the icon at another size and position in the search area", () => {
    const sets = ["MoonlitClouds", "RejuvenatingGlow", "SierraGale"];
    expect(matchSetIcon(iconSample("SierraGale", 20), sets).set).toBe("SierraGale");
    expect(matchSetIcon(iconSample("SierraGale", 9), sets).set).toBe("SierraGale");
  });

  // A one-digit level ("+0") puts the icon about 18 px further left at this scale, which
  // used to cut it in half (2026-10-07 report: no set on any +0 multi-set echo).
  it("finds the icon after a one-digit level", () => {
    const sets = ["RejuvenatingGlow", "MoonlitClouds"];
    const match = matchSetIcon(iconSample("RejuvenatingGlow", 13, undefined, 18), sets);
    expect(match).toMatchObject({ set: "RejuvenatingGlow", confidence: "high" });
  });

  it("returns no set, with low confidence, when nothing clearly matches", () => {
    const match = matchSetIcon(flatSample(58, 58), ["MoonlitClouds", "RejuvenatingGlow"]);
    expect(match).toMatchObject({ set: null, confidence: "low" });
    expect(Math.max(...Object.values(match.scores))).toBeLessThan(MIN_SCORE);
  });

  it("refuses to pick when a candidate has no reference icon", () => {
    expect(matchSetIcon(iconSample("MoonlitClouds"), ["MoonlitClouds", "NotARealSet"]).set).toBeNull();
  });

  it("keeps a margin between the thresholds", () => {
    expect(MIN_SCORE).toBeGreaterThan(MIN_MARGIN);
  });

  it("searches a padded area around SET_ICON_BOX, moved down on 16:9 like the box", () => {
    const tall = setIconSearchRegion({ width: 2880, height: 1800 });
    const wide = setIconSearchRegion({ width: 1920, height: 1080 });
    // 25% padding each side, plus 60% more on the left for one-digit levels.
    expect(tall.width).toBeCloseTo(0.0184 * 2.1);
    // Starts left of where a "+0" echo's icon does (measured x 0.7188 at 2880×1800).
    expect(tall.x).toBeLessThan(0.7188);
    // Still clear of the level text's start (x 0.696).
    expect(tall.x).toBeGreaterThan(0.7);
    expect(wide.y).toBeGreaterThan(tall.y);
  });
});
