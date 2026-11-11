import { beforeAll, describe, expect, it } from "vitest";
import { loadBundledScannerData } from "@/data/scannerData";
import type { OcrLine, RegionText } from "@/ipc/types";
import { extractEcho } from "@/session/echoExtract";

const at = (text: string, y: number, x = 0): OcrLine => ({ text, bounds: { x, y, width: 100, height: 30 } });
const region = (id: string, texts: string[], x = 0): RegionText => ({
  id,
  lines: texts.map((t, i) => at(t, i * 60, x)),
  width: 755,
  height: 400,
  elapsed_ms: 1,
});

/**
 * Glommoth +25 at 2560×1440 as Tesseract read it with letters allowed in the value column
 * (issue #88, fixture 2560x1440/glommoth-def-flat-last-plus25): the flat "DEF 40" on the last
 * row came back as "AO" in the value column and "4O" everywhere else.
 */
function glommoth(lastValue: string, lastRow: string): RegionText[] {
  return [
    region("name", ["Glommoth ys ge"]),
    region("level", ["+25"]),
    region("mainStat", ["Fusion DMG Bonus 30.0%"]),
    region("secondaryStat", ["ATK 100"]),
    region("substatLabels", ["Crit. DMG", "Basic Attack DMG Bonus", "Energy Regen", "HP", "DEF", "no Skill"]),
    region("substatValues", ["13.8%", "8.6%", "11.6%", "470", lastValue], 600),
    region("substatBlock", [
      "Crit. DMG 13.8%",
      "Basic Attack DMG Bonus 8.6%",
      "Energy Regen 11.6%",
      "HP 470",
      lastRow,
      "no Skill",
    ]),
    region("substatRow1", ["Crit. DMG 13.8%"]),
    region("substatRow2", ["Basic Attack DMG Bonus 8.6%"]),
    region("substatRow3", ["Energy Regen 11.6%"]),
    region("substatRow4", ["HP 470"]),
    region("substatRow5", [lastRow]),
  ];
}

describe("a short flat value on the last substat row (issues #88, #89)", () => {
  beforeAll(() => loadBundledScannerData());

  it("leaves the last row empty (flagged) when every crop reads 40 with a letter in it", () => {
    const echo = extractEcho(glommoth("AO", "DEF 4O"));
    expect(echo.slot.substats[4]).toEqual({ subStat: "", subStatValue: "" });
    expect(echo.confidence.substats[4]).toBe("low");
  });

  it("keeps all five rows once the value column reads digits only", () => {
    const echo = extractEcho(glommoth("40", "DEF 4O"));
    expect(echo.slot.substats.map((s) => [s.subStat, s.subStatValue])).toEqual([
      ["Crit. DMG", "13.8%"],
      ["Basic Attack DMG Bonus", "8.6%"],
      ["Energy Regen", "11.6%"],
      ["HP", "470"],
      ["DEF", "40"],
    ]);
    expect(echo.confidence.substats).toEqual(["high", "high", "high", "high", "high"]);
  });
});
