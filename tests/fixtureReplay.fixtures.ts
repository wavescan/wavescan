import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadBundledScannerData } from "@/data/scannerData";
import type { RegionRead, RegionText } from "@/ipc/types";
import { extractEcho } from "@/session/echoExtract";
import { echoReadRegions } from "@/session/echoRegions";
import { toScanEcho } from "@/session/exportScan";
import { compareEcho, summarize, type FieldResult, type GoldenEcho } from "./support/fixtureCompare";

// Fixture replay (docs/fixtures.md): every committed echo screenshot that has a golden JSON
// goes through the app's real pipeline (regions → this OS's OCR → scanner-core extraction
// → export) and is compared with its golden, field by field.
//
// Only runs on Windows and macOS, where the OS OCR exists: `npm run test:fixtures`. The
// OCR step is the Rust tool in src-tauri/examples/fixtures.rs, so the first run compiles it.
//
// Fails on a silent misread (a wrong value that isn't in lowConfidence). Flagged and
// missing fields are reported in the accuracy summary instead.

const SCREEN_DIR = resolve("fixtures/screens/echoes");

interface Fixture {
  name: string;
  image: string;
  golden: GoldenEcho;
  regions: RegionRead[];
}

function findFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];
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
        regions: echoReadRegions(frame),
      });
    }
  }
  return fixtures.sort((a, b) => a.name.localeCompare(b.name));
}

const fixtures = findFixtures();
const ocrByImage = new Map<string, RegionText[]>();
const allResults: FieldResult[] = [];

beforeAll(() => {
  loadBundledScannerData();
  const dir = mkdtempSync(join(tmpdir(), "wavescan-fixtures-"));
  const manifest = join(dir, "manifest.json");
  const output = join(dir, "ocr.json");
  writeFileSync(manifest, JSON.stringify(fixtures.map(({ image, regions }) => ({ image, regions }))));
  execFileSync(
    "cargo",
    ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--example", "fixtures", "--", "ocr", manifest, output],
    { stdio: "inherit" },
  );
  const results = JSON.parse(readFileSync(output, "utf8")) as { image: string; regions: RegionText[] }[];
  for (const r of results) ocrByImage.set(r.image, r.regions);
});

afterAll(() => {
  const s = summarize(allResults);
  console.log(
    `\nFixture accuracy (${process.platform}): ${(s.accuracy * 100).toFixed(1)}% ` +
      `of ${s.compared} fields correct · ${s.flagged} flagged · ${s.missing} missing · ` +
      `${s.wrong} wrong · ${s.skipped} skipped (release gate: 99%)`,
  );
});

describe("fixture replay: echoes", () => {
  it("found the fixtures", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const regions = ocrByImage.get(fixture.image);
      expect(regions, "no OCR output for this image").toBeDefined();
      const ocrText = Object.fromEntries((regions ?? []).map((r) => [r.id, r.lines.map((l) => l.text)]));

      const echo = toScanEcho({ ...extractEcho(regions ?? []), id: "echo-1", index: 1 }, 1);
      const results = compareEcho(fixture.golden, echo);
      allResults.push(...results);

      const problems = results.filter((r) => r.outcome !== "correct" && r.outcome !== "skipped");
      if (problems.length > 0) {
        console.log(`\n${fixture.name}:\n${JSON.stringify({ problems, ocrText }, null, 2)}`);
      }
      const wrong = results.filter((r) => r.outcome === "wrong");
      expect(wrong, `silent misreads. OCR text:\n${JSON.stringify(ocrText, null, 2)}`).toEqual([]);
    });
  }
});
