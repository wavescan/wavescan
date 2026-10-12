import { beforeAll, describe, expect, it } from "vitest";
import { regionForFrame } from "@wutheringtools/scanner-core";
import { loadBundledScannerData } from "@/data/scannerData";
import type { RegionText } from "@/ipc/types";
import {
  checkScreenForAuto,
  classifyScreen,
  headerSaysEchoes,
  screenCheckMessage,
  selectedEchoReads,
} from "@/session/classifyScreen";
import { HEADER_ROW, echoReadRegions, screenCheckRegions } from "@/session/echoRegions";
import { line, region, sabercatPanel } from "./support/echoPanels";

beforeAll(() => {
  loadBundledScannerData();
});

/** The Sabercat panel with region `id` replaced by these lines of text (none: not read). */
function withRegion(id: string, ...texts: string[]): RegionText[] {
  const others = sabercatPanel().filter((r) => r.id !== id);
  return [...others, region(id, texts.map((t, i) => line(t, i * 24)))];
}

describe("headerSaysEchoes", () => {
  it.each([
    "Echoes 2969/3000",
    "Echoes2969/3000", // OCR glued the count on
    "Ech0es 1648/3000", // one misread letter
    "Echoe 1648/3000", // one dropped letter
    "ECHOES",
  ])("matches %j", (text) => {
    expect(headerSaysEchoes(text)).toBe(true);
  });

  it.each([
    "",
    "Weapons 412/2000",
    "Echo Management", // the button on the right, if it ever fell in the crop
    "Development Materials",
    "2969/3000",
  ])("doesn't match %j", (text) => {
    expect(headerSaysEchoes(text)).toBe(false);
  });
});

describe("classifyScreen", () => {
  it("is bag.echoes when the header says Echoes", () => {
    expect(classifyScreen(sabercatPanel())).toBe("bag.echoes");
  });

  it("is unknown when the header says something else, or wasn't read", () => {
    expect(classifyScreen(withRegion("header", "Weapons 412/2000"))).toBe("unknown");
    expect(classifyScreen(withRegion("header"))).toBe("unknown");
    expect(classifyScreen(sabercatPanel().filter((r) => r.id !== "header"))).toBe("unknown");
  });

  it("doesn't need a readable panel (an echo the data doesn't know yet is still this screen)", () => {
    const panel = withRegion("name", "Brand New Echo").map((r) =>
      r.id === "secondaryStat" ? region("secondaryStat", [line("ATK 42", 0)]) : r,
    );
    expect(selectedEchoReads(panel)).toBe(false);
    expect(classifyScreen(panel)).toBe("bag.echoes");
  });
});

describe("selectedEchoReads", () => {
  it("reads when the name matches a known echo", () => {
    expect(selectedEchoReads(withRegion("secondaryStat"))).toBe(true);
  });

  it("reads when only the secondary stat gives a cost (a new echo at +25)", () => {
    expect(selectedEchoReads(withRegion("name", "Brand New Echo"))).toBe(true);
  });

  it("doesn't read when neither does (a menu over the panel)", () => {
    const panel = withRegion("name", "Batch Manage").map((r) =>
      r.id === "secondaryStat" ? region("secondaryStat", [line("Confirm", 0)]) : r,
    );
    expect(selectedEchoReads(panel)).toBe(false);
  });
});

describe("checkScreenForAuto", () => {
  it("is ok on Bag → Echoes with a readable echo", () => {
    expect(checkScreenForAuto(sabercatPanel())).toBe("ok");
  });

  it("is wrong-screen without the Echoes header, whatever the panel shows", () => {
    expect(checkScreenForAuto(withRegion("header", "Weapons 412/2000"))).toBe("wrong-screen");
  });

  it("is no-echo when the header is there but the panel doesn't read", () => {
    const panel = withRegion("name", "Batch Manage").map((r) =>
      r.id === "secondaryStat" ? region("secondaryStat", [line("Confirm", 0)]) : r,
    );
    expect(checkScreenForAuto(panel)).toBe("no-echo");
  });

  it("explains each failure in plain words", () => {
    expect(screenCheckMessage("wrong-screen")).toContain("Bag → Echoes");
    expect(screenCheckMessage("no-echo")).toContain("menu");
  });
});

describe("header region", () => {
  it("is read with every echo, and on its own for the auto-mode check", () => {
    const frame = { width: 2880, height: 1800 };
    expect(echoReadRegions(frame).map((r) => r.id)).toContain("header");
    expect(screenCheckRegions(frame).map((r) => r.id)).toEqual(["header", "name", "secondaryStat"]);
  });

  it("covers the measured header text at 16:10 and 16:9 (top-anchored)", () => {
    // "Echoes" x 0.058–0.102, y 0.050–0.066 at 16:10 (docs/screens/echoes.md).
    for (const [frame, scale] of [
      [{ width: 2880, height: 1800 }, 1],
      [{ width: 1920, height: 1080 }, 1.6 / (16 / 9)],
    ] as const) {
      const r = regionForFrame(HEADER_ROW, frame);
      expect(r.x).toBeLessThan(0.058);
      expect(r.x + r.width).toBeGreaterThan(0.172);
      expect(r.y).toBeLessThan(0.05 / scale);
      expect(r.y + r.height).toBeGreaterThan(0.066 / scale);
    }
  });

  it("stays clear of the bag icon and the User ID", () => {
    expect(HEADER_ROW.x).toBeGreaterThan(0.051);
    expect(HEADER_ROW.y + HEADER_ROW.height).toBeLessThan(0.975);
  });
});
