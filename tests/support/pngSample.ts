import sharp from "sharp";
import type { FracRect } from "@/ipc/types";
import type { Sample } from "@/session/samples";

// Samples a region of a fixture PNG the way `sample_regions` does in Rust (crop, then a
// box-averaged downscale to at most `maxWidth` wide; `Frame::downscaled_rgba`), so pixel
// matchers can be tested against real captures without the app.

export async function samplePng(path: string, region: FracRect, maxWidth: number): Promise<Sample> {
  const image = sharp(path).removeAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const left = Math.round(region.x * info.width);
  const top = Math.round(region.y * info.height);
  const width = Math.round(region.width * info.width);
  const height = Math.round(region.height * info.height);
  const outW = Math.min(maxWidth, width);
  const outH = Math.max(1, Math.floor((height * outW) / width));
  const span = (i: number, out: number, size: number) => [Math.floor((i * size) / out), Math.max(Math.floor((i * size) / out) + 1, Math.floor(((i + 1) * size) / out))] as const;
  const rgba = new Uint8ClampedArray(new ArrayBuffer(outW * outH * 4));
  for (let oy = 0; oy < outH; oy++) {
    const [y0, y1] = span(oy, outH, height);
    for (let ox = 0; ox < outW; ox++) {
      const [x0, x1] = span(ox, outW, width);
      const sum = [0, 0, 0];
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = ((top + y) * info.width + left + x) * 3;
          sum[0]! += data[o]!;
          sum[1]! += data[o + 1]!;
          sum[2]! += data[o + 2]!;
          count += 1;
        }
      }
      rgba.set([sum[0]! / count, sum[1]! / count, sum[2]! / count, 255], (oy * outW + ox) * 4);
    }
  }
  return { width: outW, height: outH, rgba };
}
