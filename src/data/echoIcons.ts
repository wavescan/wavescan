import { shallowRef } from "vue";

// A small picture of every echo, shown next to its name on echo cards and lists (ADR 0029).
// Wuthering Tools makes them (80×80 WebP) and publishes them in scanner-assets.json. This
// build bundles a copy, and a newer one is downloaded at launch (ADR 0034);
// scannerAssets.ts hands whichever is in use to `useEchoIcons`. An echo without a picture
// shows a placeholder.

/**
 * Checks the `echoIcons` section of a scanner-assets file and returns its pictures (echo key
 * → `data:` URL). Throws with a specific message if it isn't one this build can use.
 */
export function loadEchoIcons(value: unknown): Map<string, string> {
  const section = value as { icons?: unknown } | null;
  if (typeof section?.icons !== "object" || section.icons === null) throw new Error("not an echo-icons section");
  const icons = new Map<string, string>();
  for (const [key, url] of Object.entries(section.icons as Record<string, unknown>)) {
    if (typeof url !== "string" || !url.startsWith("data:image/")) throw new Error(`echo picture ${key} isn't an image`);
    icons.set(key, url);
  }
  return icons;
}

const current = shallowRef(new Map<string, string>());

/** Makes these the pictures shown from now on (see scannerAssets.ts). */
export function useEchoIcons(icons: Map<string, string>): void {
  current.value = icons;
}

/**
 * The picture for an echo key, as a `data:` URL, or null (no key or no picture). Reactive:
 * a component that calls it re-renders when newer pictures are downloaded.
 */
export function echoIconUrl(key: string | null): string | null {
  if (!key) return null;
  return current.value.get(key) ?? null;
}
