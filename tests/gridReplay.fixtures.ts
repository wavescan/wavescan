import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GRID_SAMPLE_WIDTH, gridLayout, rowSignature, scrollShift, visibleRows, type GridLayout } from "@/auto/grid";
import { decodeSamples, type Sample } from "@/session/samples";

// Grid replay (docs/fixtures.md): samples the grid strip of real captures through the
// app's own `regions::sample` (Rust tool, no OCR, so this also runs in the Linux container)
// and checks row detection and scroll matching against fixtures/screens/echoes-grid/grid.json.
// Each capture uses the layout for its own size (16:10 or 16:9).

interface GridGoldens {
  frames: Record<string, number[]>;
  scrolls: { before: string; after: string; shift: number }[];
}

const goldens = JSON.parse(readFileSync("fixtures/screens/echoes-grid/grid.json", "utf8")) as GridGoldens;
const names = Object.keys(goldens.frames);
const samples = new Map<string, Sample>();
const layouts = new Map<string, GridLayout>();

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const header = readFileSync(path).subarray(16, 24);
  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
}

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "wavescan-grid-"));
  const manifest = join(dir, "manifest.json");
  const output = join(dir, "samples.json");
  const image = (name: string) => resolve("fixtures/screens", `${name}.png`);
  for (const name of names) {
    const layout = gridLayout(pngSize(image(name)));
    if (!layout) throw new Error(`no grid layout for the size of ${name}`);
    layouts.set(name, layout);
  }
  writeFileSync(
    manifest,
    JSON.stringify(
      names.map((name) => ({ image: image(name), regions: [], samples: [layouts.get(name)!.strip], sample_width: GRID_SAMPLE_WIDTH })),
    ),
  );
  execFileSync(
    "cargo",
    ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--example", "fixtures", "--", "ocr", manifest, output],
    { stdio: "inherit" },
  );
  const results = JSON.parse(readFileSync(output, "utf8")) as { samples: number[] }[];
  results.forEach((r, i) => samples.set(names[i]!, decodeSamples(Uint8Array.from(r.samples).buffer).images[0]!));
});

describe("grid replay", () => {
  for (const name of names) {
    it(`finds the fully visible rows: ${name}`, () => {
      const rows = visibleRows(layouts.get(name)!, samples.get(name)!).map((r) => r.barTop);
      expect(rows).toHaveLength(goldens.frames[name]!.length);
      rows.forEach((y, i) => expect(Math.abs(y - goldens.frames[name]![i]!)).toBeLessThanOrEqual(0.006));
    });
  }

  for (const scroll of goldens.scrolls) {
    it(`measures the scroll ${scroll.before} → ${scroll.after}`, () => {
      const signatures = (name: string) => {
        const sample = samples.get(name)!;
        const layout = layouts.get(name)!;
        return visibleRows(layout, sample).map((row) => rowSignature(layout, sample, row));
      };
      expect(scrollShift(signatures(scroll.before), signatures(scroll.after))).toBe(scroll.shift);
    });
  }
});
