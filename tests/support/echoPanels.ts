import type { OcrLine, RegionText } from "@/ipc/types";

// OCR output for echo panels, shared by the session, export and review tests.

export const line = (text: string, y: number, height = 20): OcrLine => ({
  text,
  bounds: { x: 0, y, width: 200, height },
});

export const region = (id: string, lines: OcrLine[]): RegionText => ({ id, lines, width: 400, height: 200, elapsed_ms: 5 });

/** OCR output for the Sabercat Prowler panel in fixtures/screens/echoes (2880x1800). */
export function sabercatPanel(critDmg = "17.4%"): RegionText[] {
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
