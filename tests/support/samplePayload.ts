import { setIconReference } from "@/data/setIcons";
import type { Sample } from "@/session/samples";

// Test helpers: build `sample_regions` payloads and set-icon samples without a game.

/** A sample showing a set's reference icon on a plain background, padded like the real search region. */
export function iconSample(set: string, pad = 13, background: [number, number, number] = [60, 45, 50]): Sample {
  const icon = setIconReference(set);
  if (!icon) throw new Error(`no reference icon for ${set}`);
  const width = icon.width + 2 * pad;
  const height = icon.height + 2 * pad;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const ix = x - pad;
      const iy = y - pad;
      const inside = ix >= 0 && iy >= 0 && ix < icon.width && iy < icon.height;
      const i = (iy * icon.width + ix) * 3;
      rgba[o] = inside ? icon.data[i]! : background[0];
      rgba[o + 1] = inside ? icon.data[i + 1]! : background[1];
      rgba[o + 2] = inside ? icon.data[i + 2]! : background[2];
      rgba[o + 3] = 255;
    }
  }
  return { width, height, rgba };
}

/** Encodes samples the way `sample_regions` does (see `decodeSamples`). */
export function encodeSamples(seq: number, images: Sample[]): ArrayBuffer {
  const size = 12 + images.reduce((n, s) => n + 8 + s.rgba.length, 0);
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(seq), true);
  view.setUint32(8, images.length, true);
  let offset = 12;
  for (const s of images) {
    view.setUint32(offset, s.width, true);
    view.setUint32(offset + 4, s.height, true);
    new Uint8ClampedArray(buffer, offset + 8, s.rgba.length).set(s.rgba);
    offset += 8 + s.rgba.length;
  }
  return buffer;
}

/** A tiny flat sample, for regions whose pixels a test doesn't care about. */
export function flatSample(width = 8, height = 8): Sample {
  return { width, height, rgba: new Uint8ClampedArray(width * height * 4).fill(128) };
}
