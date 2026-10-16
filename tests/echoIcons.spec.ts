import { describe, expect, it } from "vitest";
import bundledAssets from "@/data/scanner-assets.json";
import scannerData from "@/data/scanner-data.json";
import { loadEchoIcons } from "@/data/echoIcons";

describe("bundled echo pictures", () => {
  it("has a picture for every echo in the game data", () => {
    // Rerun `npm run data:update` after Wuthering Tools adds echoes.
    const icons = loadEchoIcons(bundledAssets.data.echoIcons);
    const missing = Object.keys(scannerData.data.echoes).filter((key) => !icons.has(key));
    expect(missing).toEqual([]);
  });

  it("holds only small WebP pictures, never links", () => {
    for (const url of loadEchoIcons(bundledAssets.data.echoIcons).values()) {
      expect(url).toMatch(/^data:image\/webp;base64,/);
      expect(url.length).toBeLessThan(20_000);
    }
  });

  it("rejects sections it can't use", () => {
    expect(() => loadEchoIcons({ format: "other" })).toThrow("not an echo-icons section");
    expect(() => loadEchoIcons({ icons: { Broken: "https://example.com/a.webp" } })).toThrow("Broken isn't an image");
  });
});
