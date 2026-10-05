/** A decoded preview image ready for `ImageData`. */
export interface DecodedPreview {
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

/**
 * Decodes the bytes from the `capture_preview` command:
 * `[width u32 little-endian][height u32 little-endian][width*height*4 RGBA bytes]`.
 * Throws if the payload is truncated or the size doesn't match.
 */
export function decodePreview(buffer: ArrayBuffer): DecodedPreview {
  if (buffer.byteLength < 8) throw new Error("preview payload is too short");
  const view = new DataView(buffer);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const expected = width * height * 4;
  if (width === 0 || height === 0 || buffer.byteLength - 8 !== expected) {
    throw new Error(`preview size mismatch: ${width}x${height}, ${buffer.byteLength - 8} bytes`);
  }
  return { width, height, rgba: new Uint8ClampedArray(buffer, 8, expected) };
}
