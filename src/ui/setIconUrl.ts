import { setIconReference, type RgbImage } from "@/data/setIcons";

// Turns the 32×32 set icons (the same ones used to recognise sets, src/data/setIcons.ts)
// into image URLs for the echo cards. Drawn once per icon on a canvas, then cached. The
// cache is keyed by the icon itself, so newer icons downloaded at launch are drawn afresh.

const cache = new WeakMap<RgbImage, string | null>();

/** RGB bytes → RGBA bytes (fully opaque). */
export function rgbToRgba(image: RgbImage): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(image.width * image.height * 4);
  for (let i = 0, j = 0; i < image.data.length; i += 3, j += 4) {
    out[j] = image.data[i] ?? 0;
    out[j + 1] = image.data[i + 1] ?? 0;
    out[j + 2] = image.data[i + 2] ?? 0;
    out[j + 3] = 255;
  }
  return out;
}

/** A `data:` PNG of the set's icon, or null when there's no icon (or no canvas). */
export function setIconUrl(key: string | null): string | null {
  if (!key) return null;
  const image = setIconReference(key);
  if (!image) return null;
  if (cache.has(image)) return cache.get(image) ?? null;
  let url: string | null = null;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (context) {
      context.putImageData(new ImageData(rgbToRgba(image), image.width, image.height), 0, 0);
      url = canvas.toDataURL("image/png");
    }
  }
  cache.set(image, url);
  return url;
}
