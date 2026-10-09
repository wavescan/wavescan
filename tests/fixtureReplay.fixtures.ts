import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBundledScannerData } from "@/data/scannerData";
import type { RegionText } from "@/ipc/types";
import { echoReadRegions } from "@/session/echoRegions";
import { mainStatLabelRegion } from "@/session/hpLabel";
import type { PanelSamples } from "@/session/panelSamples";
import { decodeSamples } from "@/session/samples";
import { setIconSearchRegion } from "@/session/setIcon";
import type { FieldResult } from "./support/fixtureCompare";
import { accuracyLine, checkEcho, findEchoFixtures } from "./support/echoReplay";

// Fixture replay through macOS Vision (docs/fixtures.md): every committed echo screenshot
// that has a golden JSON goes through the app's real pipeline (regions → Vision, plus the
// set-icon and label samples → scanner-core extraction and set matching → export) and is
// compared with its golden, field by field. The OCR step is the Rust tool in
// src-tauri/examples/fixtures.rs, so the first run compiles it.
//
// macOS only: Windows reads echo text with Tesseract (ADR 0027), which
// tesseractReplay.fixtures.ts checks on every OS.

/** Same as a scan's sample width (src/session/echoSession.ts). */
const SAMPLE_WIDTH = 128;

const fixtures = findEchoFixtures();
const ocrByImage = new Map<string, { regions: RegionText[]; samples: PanelSamples }>();
const allResults: FieldResult[] = [];

describe.runIf(process.platform === "darwin")("fixture replay: echoes through macOS Vision", () => {
  beforeAll(() => {
    loadBundledScannerData();
    const dir = mkdtempSync(join(tmpdir(), "wavescan-fixtures-"));
    const manifest = join(dir, "manifest.json");
    const output = join(dir, "ocr.json");
    writeFileSync(
      manifest,
      JSON.stringify(
        fixtures.map(({ image, frame }) => ({
          image,
          regions: echoReadRegions(frame),
          samples: [setIconSearchRegion(frame), mainStatLabelRegion(frame)],
          sample_width: SAMPLE_WIDTH,
        })),
      ),
    );
    execFileSync(
      "cargo",
      ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--example", "fixtures", "--", "ocr", manifest, output],
      { stdio: "inherit" },
    );
    const results = JSON.parse(readFileSync(output, "utf8")) as { image: string; regions: RegionText[]; samples: number[] }[];
    for (const r of results) {
      const [setIcon, mainStatLabel] = decodeSamples(Uint8Array.from(r.samples).buffer).images;
      ocrByImage.set(r.image, { regions: r.regions, samples: { setIcon, mainStatLabel } });
    }
  });

  afterAll(() => console.log(accuracyLine("macOS Vision", allResults)));

  it("found the fixtures", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const read = ocrByImage.get(fixture.image);
      expect(read, "no OCR output for this image").toBeDefined();
      checkEcho(fixture, read?.regions ?? [], read?.samples ?? {}, allResults);
    });
  }
});
