import { shallowRef } from "vue";

// A small picture of every echo (`echo-icons.json`), shown next to its name on the Review
// screen. Made from the picture URLs in scanner-data.json by `npm run data:update`
// (scripts/update-echo-icons.mjs, ADR 0029). Never hand-edit the JSON.
//
// The file is about 1 MB, so it's a separate chunk loaded the first time a picture is
// asked for; until then (and for an echo with no picture) callers get null and show a
// placeholder.

interface EchoIconsFile {
  format: "WavescanEchoIcons";
  version: 1;
  size: number;
  scannerDataHash: string;
  icons: Record<string, string>;
}

/**
 * Checks an echo-icons file and returns its pictures (echo key → `data:` URL). Throws with
 * a specific message if it isn't one this build can use.
 */
export function loadEchoIcons(value: unknown): Map<string, string> {
  const file = value as Partial<EchoIconsFile> | null;
  if (file?.format !== "WavescanEchoIcons" || file.version !== 1) throw new Error("not an echo-icons file");
  const icons = new Map<string, string>();
  for (const [key, url] of Object.entries(file.icons ?? {})) {
    if (!url.startsWith("data:image/")) throw new Error(`echo picture ${key} isn't an image`);
    icons.set(key, url);
  }
  return icons;
}

const loaded = shallowRef<Map<string, string> | null>(null);
let loading: Promise<void> | null = null;

function load() {
  loading ??= import("./echo-icons.json")
    .then((module) => {
      loaded.value = loadEchoIcons(module.default);
    })
    .catch((error: unknown) => {
      // Pictures are decoration: without them the cards show placeholders.
      console.warn("echo pictures unavailable", error);
    });
}

/**
 * The bundled picture for an echo key, as a `data:` URL, or null (no key, no picture, or
 * not loaded yet). Reactive: a component that calls it re-renders once the pictures load.
 */
export function echoIconUrl(key: string | null): string | null {
  if (!key) return null;
  load();
  return loaded.value?.get(key) ?? null;
}
