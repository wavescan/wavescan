import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { USER_ID_REGION, overlayBoxes, toPixels } from "@/diagnostics/overlay";
import { echoReadRegions } from "@/session/echoRegions";

// The Diagnostics overlay (src/diagnostics/overlay.ts): the boxes drawn over the preview
// must be exactly the regions a scan reads, and the User ID box must match Rust's mask.

describe("overlayBoxes", () => {
  for (const frame of [
    { width: 2880, height: 1800 },
    { width: 1920, height: 1080 },
  ]) {
    it(`draws every region a scan reads at ${frame.width}×${frame.height}`, () => {
      const boxes = overlayBoxes(frame);
      for (const read of echoReadRegions(frame)) {
        expect(boxes.find((b) => b.id === read.id)?.region).toEqual(read.region);
      }
      expect(boxes.map((b) => b.id)).toEqual(
        expect.arrayContaining(["panel", "stats", "setIcon", "mainStatLabel", "userId"]),
      );
      for (const box of boxes) {
        const { x, y, width, height } = box.region;
        expect(x >= 0 && y >= 0 && x + width <= 1.0001 && y + height <= 1.0001, box.id).toBe(true);
      }
    });
  }

  it("shows the same User ID area that Rust masks", () => {
    const rust = readFileSync("src-tauri/src/safety.rs", "utf8");
    const match = /pub const USER_ID_REGION: FracRect = FracRect::new\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\);/.exec(rust);
    expect(match, "USER_ID_REGION not found in safety.rs").not.toBeNull();
    const [, x, y, width, height] = match!.map(Number);
    expect(USER_ID_REGION).toEqual({ x, y, width, height });
  });

  it("converts a region to whole canvas pixels", () => {
    expect(toPixels({ x: 0.5, y: 0.25, width: 0.1, height: 0.1 }, 640, 400)).toEqual({ x: 320, y: 100, width: 64, height: 40 });
  });
});
