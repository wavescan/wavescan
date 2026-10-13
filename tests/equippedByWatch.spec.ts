import { beforeAll, describe, expect, it } from "vitest";
import { countChangedCells, type FrameFingerprints } from "@wutheringtools/scanner-core";
import { loadBundledScannerData } from "@/data/scannerData";
import { equippedByRowRegion } from "@/session/echoRegions";
import {
  APPEARED_CELLS,
  CELL_THRESHOLD,
  STEADY_CELLS,
  WATCH_MS,
  createEquippedByWatch,
  equippedRowFingerprint,
  hasEquippedByLine,
} from "@/session/equippedByWatch";
import type { Sample } from "@/session/samples";
import { samplePng } from "./support/pngSample";

// The late "Equipped by" line (2026-10-12): watch mode read 7 equipped echoes before the
// game drew the line. This fixture is one of them, as the game showed it a moment later.
const FIXTURE = "fixtures/screens/echoes/1920x1080/nightmare-aero-predator-plus25.png";
const FRAME = { width: 1920, height: 1080 };
/** Same as a scan's sample width (src/session/echoSession.ts). */
const SAMPLE_WIDTH = 128;

beforeAll(() => {
  loadBundledScannerData();
});

/** The box before the line is drawn: every column painted with its top row (background, above the text). */
function withoutLine(sample: Sample): Sample {
  const rgba = new Uint8ClampedArray(sample.rgba);
  for (let y = 1; y < sample.height; y++) {
    rgba.copyWithin(y * sample.width * 4, 0, sample.width * 4);
  }
  return { ...sample, rgba };
}

describe("seeing the Equipped by line arrive (real capture)", () => {
  it("counts clearly more changed cells than it needs, and none for the same frame", async () => {
    const drawn = await samplePng(FIXTURE, equippedByRowRegion(FRAME), SAMPLE_WIDTH);
    const before = equippedRowFingerprint(withoutLine(drawn));
    const after = equippedRowFingerprint(drawn);
    const changed = countChangedCells(after, before, CELL_THRESHOLD);
    expect(changed).toBeGreaterThanOrEqual(APPEARED_CELLS * 3);
    expect(countChangedCells(after, after, CELL_THRESHOLD)).toBeLessThan(STEADY_CELLS);
  });
});

describe("hasEquippedByLine", () => {
  it("finds the line, and nothing in an unequipped echo's box", () => {
    expect(hasEquippedByLine("Equipped by Augusta")).toBe(true);
    expect(hasEquippedByLine("")).toBe(false);
    expect(hasEquippedByLine("s\na ee\nPeal '")).toBe(false); // Echo Skill text, Tesseract (fixture replay)
    expect(hasEquippedByLine(undefined)).toBe(false);
  });
});

describe("createEquippedByWatch", () => {
  const panel = (v: number): FrameFingerprints => ({ panel: new Float32Array(512).fill(v), stats: new Float32Array(64).fill(v) });
  const row = (v: number) => new Float32Array(128).fill(v);
  const read = panel(0.5);

  it("reads once a line has appeared and held still for two ticks", () => {
    const watch = createEquippedByWatch(read, row(0.5), 0);
    expect(watch.step("stable-repeat", read, row(0.5), 125)).toBe("keep");
    expect(watch.step("stable-repeat", read, row(0.8), 250)).toBe("keep"); // just drawn
    expect(watch.step("stable-repeat", read, row(0.8), 375)).toBe("keep");
    expect(watch.step("stable-repeat", read, row(0.8), 500)).toBe("read");
  });

  it("waits while the line is still fading in", () => {
    const watch = createEquippedByWatch(read, row(0.5), 0);
    expect(watch.step("stable-repeat", read, row(0.65), 125)).toBe("keep");
    expect(watch.step("stable-repeat", read, row(0.8), 250)).toBe("keep");
    expect(watch.step("stable-repeat", read, row(0.95), 375)).toBe("keep");
    expect(watch.step("stable-repeat", read, row(0.95), 500)).toBe("keep");
    expect(watch.step("stable-repeat", read, row(0.95), 625)).toBe("read");
  });

  it("stops when the panel moves, another echo settles, or the panel is no longer the one read", () => {
    for (const [event, frame] of [
      ["unstable", read],
      ["stable-novel", panel(0.9)],
      ["stable-repeat", panel(0.6)], // an echo read earlier (watch mode keeps a history)
    ] as const) {
      const watch = createEquippedByWatch(read, row(0.5), 0);
      expect(watch.step(event, frame, row(0.8), 125)).toBe("end");
    }
  });

  it("gives up after WATCH_MS", () => {
    const watch = createEquippedByWatch(read, row(0.5), 0);
    expect(watch.step("stable-repeat", read, row(0.5), WATCH_MS + 1)).toBe("end");
  });
});
