import { beforeAll, describe, expect, it } from "vitest";
import { loadBundledScannerData } from "@/data/scannerData";
import { scannerGameData } from "@wutheringtools/scanner-core";
import { IMPORT_SITES } from "@/feedback/links";
import type { ScanEcho, WutheringToolsScan } from "@/session/exportScan";
import { TACET_LAB_ECHO_KEYS, scanForTacetLab } from "@/session/siteExport";

const echo = (scanId: string, key: string): ScanEcho => ({
  scanId,
  echo: key,
  echoSet: "HavocEclipse",
  cost: 1,
  rank: 5,
  level: 25,
  stat: "ATK",
  substats: [{ type: "CritRate", value: 6.9 }],
  equippedBy: null,
});

/** The two echoes from issue #103's example file. */
const scan: WutheringToolsScan = {
  format: "WutheringToolsScan",
  version: 1,
  meta: {
    scannerVersion: "0.1.2",
    scannedAt: "2026-11-24T22:44:43.817Z",
    platform: "windows",
    resolution: { width: 1920, height: 1080 },
    language: "en",
    mode: "watch",
  },
  echoes: [echo("scan-echo-1", "PhantomFallacyOfNoReturn"), echo("scan-echo-2", "YoungRoseshroom")],
};

describe("the scan copied for Tacet Lab (issue #103)", () => {
  beforeAll(() => loadBundledScannerData());

  it("renames Baby Roseshroom's key and leaves everything else as built", () => {
    const adapted = scanForTacetLab(scan);
    expect(adapted.echoes.map((e) => e.echo)).toEqual(["PhantomFallacyOfNoReturn", "BabyRoseshroom"]);
    expect({ ...adapted, echoes: [] }).toEqual({ ...scan, echoes: [] });
    expect(adapted.echoes[1]).toEqual({ ...scan.echoes[1], echo: "BabyRoseshroom" });
    // Tacet Lab only imports this format name, so it never changes.
    expect(adapted.format).toBe("WutheringToolsScan");
  });

  it("doesn't change the scan it was given (Wuthering Tools and Copy scan only use it)", () => {
    scanForTacetLab(scan);
    expect(scan.echoes[1]!.echo).toBe("YoungRoseshroom");
  });

  it("only Tacet Lab's button adapts the scan", () => {
    expect(IMPORT_SITES.map((site) => [site.name, site.adaptScan])).toEqual([
      ["Wuthering Tools", undefined],
      ["Tacet Lab", scanForTacetLab],
    ]);
  });

  // Fails once Wuthering Tools renames the key (the entry is then unused): remove it then.
  it("renames only keys the game data uses for an echo with that name", () => {
    const { echoes } = scannerGameData();
    const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const [from, to] of Object.entries(TACET_LAB_ECHO_KEYS)) {
      expect(squash(echoes[from]!.name)).toBe(squash(to));
    }
  });
});
