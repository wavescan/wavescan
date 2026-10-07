import bundled from "./set-icons.json";

// Reference copies of every sonata set's icon (`set-icons.json`), made from the icon URLs in
// scanner-data.json by `npm run data:update` (scripts/update-set-icons.mjs, ADR 0022). Each
// is SIZE×SIZE RGB, flattened onto `background`. Never hand-edit the JSON.

/** A small RGB image: `data` holds width × height × 3 bytes, row by row. */
export interface RgbImage {
  width: number;
  height: number;
  data: Uint8Array;
}

interface SetIconsFile {
  format: "WavescanSetIcons";
  version: 1;
  size: number;
  background: [number, number, number];
  scannerDataHash: string;
  icons: Record<string, string>;
}

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Checks and decodes a set-icons file. Throws with a specific message if it isn't one this
 * build can use (wrong format or version, or an icon of the wrong size).
 */
export function loadSetIcons(value: unknown): Map<string, RgbImage> {
  const file = value as Partial<SetIconsFile> | null;
  if (file?.format !== "WavescanSetIcons" || file.version !== 1) throw new Error("not a set-icons file");
  const size = file.size ?? 0;
  const icons = new Map<string, RgbImage>();
  for (const [key, encoded] of Object.entries(file.icons ?? {})) {
    const data = decodeBase64(encoded);
    if (data.length !== size * size * 3) throw new Error(`set icon ${key} has the wrong size`);
    icons.set(key, { width: size, height: size, data });
  }
  return icons;
}

let cache: Map<string, RgbImage> | null = null;

/** The bundled reference icon for a set key, or null if there isn't one. */
export function setIconReference(key: string): RgbImage | null {
  cache ??= loadSetIcons(bundled);
  return cache.get(key) ?? null;
}
