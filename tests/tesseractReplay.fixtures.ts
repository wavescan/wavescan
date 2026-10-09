import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import sharp from "sharp";
import { loadBundledScannerData } from "@/data/scannerData";
import type { FracRect, RegionText } from "@/ipc/types";
import {
  POOL_SIZE,
  createTesseractReader,
  startTesseractWorkers,
  type Crop,
  type TesseractReader,
} from "@/ocr/tesseract";
import { echoReadRegions } from "@/session/echoRegions";
import { mainStatLabelRegion } from "@/session/hpLabel";
import { setIconSearchRegion } from "@/session/setIcon";
import type { FieldResult } from "./support/fixtureCompare";
import { accuracyLine, checkEcho, findEchoFixtures, type EchoFixture } from "./support/echoReplay";
import { samplePng } from "./support/pngSample";

// Fixture replay through the Tesseract reader (docs/fixtures.md, ADR 0027): the engine that
// reads echo text on Windows. Same pipeline as the app: full-size crops of the scan regions
// → src/ocr/tesseract.ts (the prep, settings and pool the app uses) → extraction → export →
// compare with the golden. Runs on every OS, Docker included, with the bundled model.

/** Same as a scan's sample width (src/session/echoSession.ts). */
const SAMPLE_WIDTH = 128;
const MODEL_DIR = resolve("public/tesseract");

/** `safety::USER_ID_REGION` in Rust. */
const USER_ID_REGION: FracRect = { x: 0.86, y: 0.975, width: 0.14, height: 0.025 };

/** Pixel bounds of `region`, rounded like Rust's `FracRect::to_pixels`. */
function toPixels(region: FracRect, width: number, height: number) {
  return {
    left: Math.max(0, Math.floor(region.x * width)),
    top: Math.max(0, Math.floor(region.y * height)),
    right: Math.min(width, Math.ceil((region.x + region.width) * width)),
    bottom: Math.min(height, Math.ceil((region.y + region.height) * height)),
  };
}

/** Crops `region` of an RGBA image like Rust's `Frame::crop`. */
function crop(rgba: Buffer, width: number, height: number, region: FracRect): Crop {
  const { left, top, right, bottom } = toPixels(region, width, height);
  const out = new Uint8Array((right - left) * (bottom - top) * 4);
  for (let y = top; y < bottom; y++) {
    out.set(rgba.subarray((y * width + left) * 4, (y * width + right) * 4), (y - top) * (right - left) * 4);
  }
  return { width: right - left, height: bottom - top, rgba: out };
}

/** Whether the User ID area is solid black, as `npm run fixtures:mask` leaves it. */
function userIdMasked(rgba: Buffer, width: number, height: number): boolean {
  const { left, top, right, bottom } = toPixels(USER_ID_REGION, width, height);
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const o = (y * width + x) * 4;
      if (rgba[o] !== 0 || rgba[o + 1] !== 0 || rgba[o + 2] !== 0) return false;
    }
  }
  return true;
}

/** Reads the fixture's scan regions. Refuses a screenshot whose User ID isn't masked. */
async function readFixture(reader: TesseractReader, fixture: EchoFixture): Promise<RegionText[]> {
  const { data, info } = await sharp(fixture.image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!userIdMasked(data, info.width, info.height)) {
    throw new Error(`${fixture.name}: the User ID isn't masked. Run \`npm run fixtures:mask\` (docs/fixtures.md)`);
  }
  return reader.read(
    echoReadRegions(fixture.frame).map(({ id, region }) => ({ id, crop: crop(data, info.width, info.height, region) })),
  );
}

const fixtures = findEchoFixtures();
const reads = new Map<string, RegionText[]>();
const allResults: FieldResult[] = [];
const timings: number[] = [];

describe("fixture replay: echoes through Tesseract", () => {
  beforeAll(async () => {
    loadBundledScannerData();
    const reader = createTesseractReader(await startTesseractWorkers({ langPath: MODEL_DIR }), {
      sparseRetryIds: ["name"],
    });
    try {
      // All fixtures at once: their crops share the pool, like overlapping reads in auto mode.
      await Promise.all(
        fixtures.map(async (fixture) => {
          const regions = await readFixture(reader, fixture);
          timings.push(...regions.map((r) => r.elapsed_ms));
          reads.set(fixture.name, regions);
        }),
      );
    } finally {
      await reader.terminate();
    }
  });

  afterAll(() => {
    const perCrop = timings.reduce((a, b) => a + b, 0) / Math.max(1, timings.length);
    console.log(
      `${accuracyLine("Tesseract", allResults)}\n` +
        `Tesseract time: ${perCrop.toFixed(0)} ms per crop on average (${POOL_SIZE} workers in parallel)`,
    );
  });

  it("found the fixtures", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of fixtures) {
    it(fixture.name, async () => {
      const regions = reads.get(fixture.name);
      expect(regions, "no OCR output for this image").toBeDefined();
      const samples = {
        setIcon: await samplePng(fixture.image, setIconSearchRegion(fixture.frame), SAMPLE_WIDTH),
        mainStatLabel: await samplePng(fixture.image, mainStatLabelRegion(fixture.frame), SAMPLE_WIDTH),
      };
      checkEcho(fixture, regions ?? [], samples, allResults);
    });
  }
});
