import { describe, expect, it } from "vitest";
import bundledIcons from "@/data/echo-icons.json";
import scannerData from "@/data/scanner-data.json";
import { loadEchoIcons } from "@/data/echoIcons";

describe("bundled echo pictures", () => {
  it("was made from the bundled game data", () => {
    // Rerun `npm run data:update` after refreshing scanner-data.json.
    expect(bundledIcons.scannerDataHash).toBe(scannerData.hash);
  });

  it("has a picture for every echo in the game data", () => {
    const icons = loadEchoIcons(bundledIcons);
    const missing = Object.keys(scannerData.data.echoes).filter((key) => !icons.has(key));
    expect(missing).toEqual([]);
  });

  it("holds only small WebP pictures, never links", () => {
    for (const url of loadEchoIcons(bundledIcons).values()) {
      expect(url).toMatch(/^data:image\/webp;base64,/);
      expect(url.length).toBeLessThan(20_000);
    }
  });

  it("rejects files it can't use", () => {
    expect(() => loadEchoIcons({ format: "other" })).toThrow("not an echo-icons file");
    expect(() => loadEchoIcons({ ...bundledIcons, icons: { Broken: "https://example.com/a.webp" } })).toThrow(
      "Broken isn't an image",
    );
  });
});
