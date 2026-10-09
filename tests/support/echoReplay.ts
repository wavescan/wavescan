import { expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { FrameSize } from "@wutheringtools/scanner-core";
import type { RegionText } from "@/ipc/types";
import { extractEcho } from "@/session/echoExtract";
import { toScanEcho } from "@/session/exportScan";
import type { PanelSamples } from "@/session/panelSamples";
import { compareEcho, summarize, type FieldResult, type GoldenEcho } from "./fixtureCompare";

// Shared by the echo fixture replays (docs/fixtures.md): finding the screenshots that have a
// golden, checking one echo, and the accuracy line. Each replay only differs in its OCR.

const SCREEN_DIR = resolve("fixtures/screens/echoes");

export interface EchoFixture {
  /** e.g. "1920x1080/hecate-plus25". */
  name: string;
  image: string;
  golden: GoldenEcho;
  frame: FrameSize;
}

/** Every echo screenshot with a golden JSON, sorted by name. */
export function findEchoFixtures(): EchoFixture[] {
  const fixtures: EchoFixture[] = [];
  for (const sizeDir of readdirSync(SCREEN_DIR)) {
    const size = /^(\d+)x(\d+)$/.exec(sizeDir);
    if (!size) continue;
    const frame = { width: Number(size[1]), height: Number(size[2]) };
    for (const file of readdirSync(join(SCREEN_DIR, sizeDir))) {
      if (!file.endsWith(".json")) continue;
      const base = file.slice(0, -".json".length);
      fixtures.push({
        name: `${sizeDir}/${base}`,
        image: join(SCREEN_DIR, sizeDir, `${base}.png`),
        golden: JSON.parse(readFileSync(join(SCREEN_DIR, sizeDir, file), "utf8")) as GoldenEcho,
        frame,
      });
    }
  }
  return fixtures.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Runs one fixture's OCR output through extraction and export, compares it with the golden,
 * and fails on a silent misread, or on a substat-count flag when every substat is right.
 * Flagged and missing fields only count towards accuracy.
 * Prints the OCR text of every region when anything isn't correct.
 */
export function checkEcho(fixture: EchoFixture, regions: RegionText[], samples: PanelSamples, results: FieldResult[]) {
  const ocrText = Object.fromEntries(regions.map((r) => [r.id, r.lines.map((l) => l.text)]));
  const extracted = extractEcho(regions, samples);
  const echo = toScanEcho({ ...extracted, id: "echo-1", index: 1 }, 1);
  const fields = compareEcho(fixture.golden, echo);
  results.push(...fields);

  const problems = fields.filter((r) => r.outcome !== "correct" && r.outcome !== "skipped");
  if (problems.length > 0) {
    console.log(`\n${fixture.name}:\n${JSON.stringify({ problems, ocrText, setScores: extracted.setScores }, null, 2)}`);
  }
  const wrong = fields.filter((r) => r.outcome === "wrong");
  expect(wrong, `silent misreads. OCR text:\n${JSON.stringify(ocrText, null, 2)}`).toEqual([]);

  // Every substat right, yet the count flagged: the user is asked to check a correct echo
  // (an untuned slot on a +5 echo did this, spearback-plus5).
  const substatsRight =
    echo !== null &&
    echo.substats.length === fixture.golden.substats.length &&
    fields.filter((r) => r.field.startsWith("substats[")).every((r) => r.outcome === "correct");
  if (substatsRight) {
    expect(echo.lowConfidence ?? [], "substats flagged although every substat is right").not.toContain("substats");
  }
}

/** The accuracy line printed at the end of a replay. */
export function accuracyLine(engine: string, results: FieldResult[]): string {
  const s = summarize(results);
  return (
    `\nFixture accuracy (${engine}): ${(s.accuracy * 100).toFixed(1)}% ` +
    `of ${s.compared} fields correct · ${s.flagged} flagged · ${s.missing} missing · ` +
    `${s.wrong} wrong · ${s.skipped} skipped (release gate: 99%)`
  );
}
