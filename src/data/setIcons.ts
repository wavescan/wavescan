// Reference copies of every sonata set's icon, used to tell an echo's set from the icon on
// its panel (ADR 0022). Wuthering Tools makes them (32×32 RGB, flattened onto `background`)
// and publishes them in scanner-assets.json. This build bundles a copy, and a newer one is
// downloaded at launch (ADR 0034); scannerAssets.ts hands whichever is in use to
// `useSetIcons`.

/** A small RGB image: `data` holds width × height × 3 bytes, row by row. */
export interface RgbImage {
  width: number;
  height: number;
  data: Uint8Array;
}

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Checks and decodes the `setIcons` section of a scanner-assets file. Throws with a specific
 * message if it isn't one this build can use (no icons, or an icon of the wrong size).
 */
export function loadSetIcons(value: unknown): Map<string, RgbImage> {
  const section = value as { size?: unknown; icons?: unknown } | null;
  const size = section?.size;
  if (typeof size !== "number" || typeof section?.icons !== "object" || section.icons === null) {
    throw new Error("not a set-icons section");
  }
  const icons = new Map<string, RgbImage>();
  for (const [key, encoded] of Object.entries(section.icons as Record<string, unknown>)) {
    const data = typeof encoded === "string" ? decodeBase64(encoded) : new Uint8Array();
    if (data.length !== size * size * 3) throw new Error(`set icon ${key} has the wrong size`);
    icons.set(key, { width: size, height: size, data });
  }
  return icons;
}

let current = new Map<string, RgbImage>();

/** Makes these the references used from now on (see scannerAssets.ts). */
export function useSetIcons(icons: Map<string, RgbImage>): void {
  current = icons;
}

/** The reference icon for a set key, or null if there isn't one. */
export function setIconReference(key: string): RgbImage | null {
  return current.get(key) ?? null;
}
