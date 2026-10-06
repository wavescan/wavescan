import { describe, expect, it } from "vitest";
import { decodeSamples, toCoreLines } from "@/session/samples";

/** Builds a payload the way regions::sample does. */
function encode(seq: number, images: { width: number; height: number; fill: number }[]): ArrayBuffer {
  const total = 12 + images.reduce((n, im) => n + 8 + im.width * im.height * 4, 0);
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(seq), true);
  view.setUint32(8, images.length, true);
  let offset = 12;
  for (const im of images) {
    view.setUint32(offset, im.width, true);
    view.setUint32(offset + 4, im.height, true);
    new Uint8Array(buffer, offset + 8, im.width * im.height * 4).fill(im.fill);
    offset += 8 + im.width * im.height * 4;
  }
  return buffer;
}

describe("decodeSamples", () => {
  it("decodes the frame sequence and each image", () => {
    const decoded = decodeSamples(encode(42, [{ width: 2, height: 1, fill: 7 }, { width: 1, height: 3, fill: 9 }]));
    expect(decoded.seq).toBe(42);
    expect(decoded.images.map((i) => [i.width, i.height, i.rgba.length, i.rgba[0]])).toEqual([
      [2, 1, 8, 7],
      [1, 3, 12, 9],
    ]);
  });

  it("rejects truncated or padded payloads", () => {
    const good = encode(1, [{ width: 2, height: 2, fill: 1 }]);
    expect(() => decodeSamples(good.slice(0, good.byteLength - 1))).toThrow(/truncated/);
    const padded = new Uint8Array(good.byteLength + 1);
    padded.set(new Uint8Array(good));
    expect(() => decodeSamples(padded.buffer)).toThrow(/trailing/);
    expect(() => decodeSamples(new ArrayBuffer(4))).toThrow(/too short/);
  });
});

describe("toCoreLines", () => {
  it("maps pixel bounds to scanner-core's y0/y1 lines", () => {
    expect(toCoreLines([{ text: "Crit. DMG", bounds: { x: 3, y: 10, width: 80, height: 22 } }])).toEqual([
      { text: "Crit. DMG", y0: 10, y1: 32 },
    ]);
  });
});
