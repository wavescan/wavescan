import { beforeAll, describe, expect, it } from "vitest";
import { buildChecks, buildReport, formatReport, type DiagnosticsInput } from "@/diagnostics/report";
import { decodePreview } from "@/diagnostics/preview";
import { INPUT_TEST_TARGETS, isSupportedAspect } from "@/diagnostics/regions";
import type { GameWindow, RegionRead, RegionText } from "@/ipc/types";
import { describeEchoRead, readEchoForDiagnostics } from "@/diagnostics/echoRead";
import { loadBundledScannerData } from "@/data/scannerData";
import { encodeSamples, flatSample, iconSample } from "./support/samplePayload";

const window: GameWindow = {
  id: 1234,
  client_rect: { x: 0, y: 0, width: 2880, height: 1800 },
  scale_factor: 2,
  focused: true,
  minimized: false,
};

function healthy(): DiagnosticsInput {
  return {
    app: { name: "Wavescan", version: "0.0.1", platform: "windows", build: "abc1234", elevated: false },
    gameData: { hash: "f".repeat(64), version: 1, echoes: 230, characters: 63 },
    userAgent: "test",
    window: { ok: true, value: window },
    candidates: [{ title: "Wuthering Waves  ", class: "UnrealWindow", matched: true }],
    capture: {
      ok: true,
      value: { running: true, fps: 58, frame: { seq: 120, width: 2880, height: 1800 } },
    },
    ocr: [
      {
        id: "echo-name",
        label: "Echo name",
        outcome: {
          ok: true,
          value: {
            lines: [{ text: "Sabercat Prowler", bounds: { x: 0, y: 0, width: 300, height: 40 } }],
            elapsed_ms: 18.4,
            width: 778,
            height: 62,
          },
        },
      },
    ],
    echoRead: null,
    input: null,
  };
}

const statusOf = (input: DiagnosticsInput, id: string) =>
  buildChecks(input).find((c) => c.id === id)?.status;

describe("diagnostics checks", () => {
  it("passes everything for a healthy setup", () => {
    const checks = buildChecks(healthy());
    expect(checks.map((c) => [c.id, c.status])).toEqual([
      ["window", "pass"],
      ["capture", "pass"],
      ["aspect", "pass"],
      ["frame-size", "pass"],
      ["ocr", "pass"],
    ]);
  });

  it("fails the window check when the game isn't found", () => {
    const input = healthy();
    input.window = { ok: false, error: "not found", kind: "WindowNotFound" };
    expect(statusOf(input, "window")).toBe("fail");
  });

  it("warns (not fails) when the game isn't focused", () => {
    const input = healthy();
    input.window = { ok: true, value: { ...window, focused: false } };
    expect(statusOf(input, "window")).toBe("warn");
  });

  it("warns on a low frame rate and fails when no frames arrive", () => {
    const low = healthy();
    low.capture = { ok: true, value: { running: true, fps: 5, frame: { seq: 5, width: 2880, height: 1800 } } };
    expect(statusOf(low, "capture")).toBe("warn");

    const none = healthy();
    none.capture = { ok: true, value: { running: true, fps: 0, frame: null } };
    expect(statusOf(none, "capture")).toBe("fail");
  });

  it("fails ultrawide and flags a captured area that differs from the window", () => {
    const input = healthy();
    input.capture = {
      ok: true,
      value: { running: true, fps: 60, frame: { seq: 1, width: 3440, height: 1440 } },
    };
    expect(statusOf(input, "aspect")).toBe("fail");
    expect(statusOf(input, "frame-size")).toBe("warn");
  });

  it("warns when OCR finds no text and fails when OCR errors", () => {
    const empty = healthy();
    empty.ocr = [
      { id: "x", label: "x", outcome: { ok: true, value: { lines: [], elapsed_ms: 10, width: 10, height: 10 } } },
    ];
    expect(statusOf(empty, "ocr")).toBe("warn");

    const failed = healthy();
    failed.ocr = [{ id: "x", label: "x", outcome: { ok: false, error: "no language", kind: "OcrUnavailable" } }];
    expect(statusOf(failed, "ocr")).toBe("fail");
  });
});

describe("input check", () => {
  it("is absent unless the click test ran", () => {
    expect(statusOf(healthy(), "input")).toBeUndefined();
  });

  it("passes when the panel changed and fails otherwise", () => {
    const ok = healthy();
    ok.input = { outcome: "panel-changed", detail: "ok", clicks: 2 };
    expect(statusOf(ok, "input")).toBe("pass");

    const blocked = healthy();
    blocked.input = { outcome: "no-change", detail: "admin?", clicks: 2 };
    expect(statusOf(blocked, "input")).toBe("fail");
  });
});

describe("diagnostics report", () => {
  it("is labelled, versioned and contains OCR text and timing", () => {
    const report = buildReport(healthy(), new Date("2026-10-05T12:00:00Z"));
    expect(report.format).toBe("WavescanDiagnostics");
    expect(report.generatedAt).toBe("2026-10-05T12:00:00.000Z");
    expect(report.ocr[0]).toEqual({
      id: "echo-name",
      label: "Echo name",
      ms: 18,
      size: "778×62",
      text: ["Sabercat Prowler"],
    });
  });

  it("never contains image data", () => {
    const text = formatReport(buildReport(healthy()));
    expect(text).not.toMatch(/data:image|rgba|base64/i);
  });
});

describe("preview decoding", () => {
  it("decodes the width/height header and RGBA bytes", () => {
    const buffer = new ArrayBuffer(8 + 2 * 1 * 4);
    const view = new DataView(buffer);
    view.setUint32(0, 2, true);
    view.setUint32(4, 1, true);
    new Uint8Array(buffer, 8).set([1, 2, 3, 255, 4, 5, 6, 255]);
    const decoded = decodePreview(buffer);
    expect([decoded.width, decoded.height]).toEqual([2, 1]);
    expect(Array.from(decoded.rgba)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it("rejects truncated payloads", () => {
    const buffer = new ArrayBuffer(8 + 4);
    const view = new DataView(buffer);
    view.setUint32(0, 2, true);
    view.setUint32(4, 2, true);
    expect(() => decodePreview(buffer)).toThrow(/mismatch/);
    expect(() => decodePreview(new ArrayBuffer(3))).toThrow(/too short/);
  });
});

describe("aspect ratio support", () => {
  it("accepts 16:10 and 16:9, rejects ultrawide and 4:3", () => {
    expect(isSupportedAspect(2880, 1800)).toBe(true);
    expect(isSupportedAspect(1920, 1080)).toBe(true);
    expect(isSupportedAspect(3440, 1440)).toBe(false);
    expect(isSupportedAspect(1024, 768)).toBe(false);
  });
});

describe("administrator note (Windows)", () => {
  const windowDetail = (elevated: boolean | null) => {
    const input = healthy();
    input.app = { name: "Wavescan", version: "0.0.1", platform: "windows", build: null, elevated };
    return buildChecks(input).find((c) => c.id === "window")?.detail;
  };

  it("says whether Wavescan runs as administrator, and nothing when unknown", () => {
    expect(windowDetail(true)).toContain("Wavescan is running as administrator");
    expect(windowDetail(false)).toContain("not running as administrator");
    expect(windowDetail(null)).toBe("2880×1800 at 200% scale");
  });
});

describe("diagnostics echo read", () => {
  beforeAll(() => {
    loadBundledScannerData();
  });

  /** A sample_regions payload: two fingerprint areas, then Whiff Whaff's Rejuvenating Glow icon. */
  const pinned = (seq: number) => encodeSamples(seq, [flatSample(), flatSample(), iconSample("RejuvenatingGlow")]);

  const lines = (...texts: string[]) =>
    texts.map((text, i) => ({ text, bounds: { x: 0, y: i * 40, width: 300, height: 30 } }));

  function fakeGame(mainStat: string[]) {
    const reads: number[] = [];
    const deps = {
      sampleRegions: async () => pinned(42),
      readRegions: async (seq: number, regions: RegionRead[]): Promise<RegionText[]> => {
        reads.push(seq);
        const text: Record<string, string[]> = {
          name: ["Whiff Whaff"],
          level: ["+0"],
          mainStat,
          secondaryStat: ["HP 114"],
        };
        return regions.map((r) => ({ id: r.id, lines: lines(...(text[r.id] ?? [])), width: 400, height: 50, elapsed_ms: 12.6 }));
      },
    };
    return { deps, reads };
  }

  it("reads the pinned frame with the scan regions and reports text plus the exported echo", async () => {
    const game = fakeGame(["HP 2.8%"]);
    const read = await readEchoForDiagnostics(game.deps, { width: 2880, height: 1800 });
    expect(game.reads).toEqual([42]);
    expect(read.regions.mainStat).toEqual(["HP 2.8%"]);
    expect(read.ms).toBe(13);
    expect(read.echo).toMatchObject({ echo: "WhiffWhaff", rank: 2, level: 0, stat: "HP" });
    expect(describeEchoRead(read)).toBe("WhiffWhaff +0, 2★, main stat HP, set RejuvenatingGlow");

    const input = { ...healthy(), echoRead: { ok: true as const, value: read } };
    expect(statusOf(input, "echo-read")).toBe("pass");
    expect(buildReport(input).echoRead).toEqual(read);
  });

  it("warns and names the unsure fields when the main stat can't be parsed", async () => {
    const read = await readEchoForDiagnostics(fakeGame(["HP 2.8 %"]).deps, { width: 2880, height: 1800 });
    const input = { ...healthy(), echoRead: { ok: true as const, value: read } };
    expect(statusOf(input, "echo-read")).toBe("warn");
    expect(describeEchoRead(read)).toContain("Unsure: stat");
  });

  it("fails with the error when the read itself fails", () => {
    const input = { ...healthy(), echoRead: { ok: false as const, error: "frame expired", kind: "FrameExpired" } };
    expect(statusOf(input, "echo-read")).toBe("fail");
    expect(buildReport(input).echoRead).toEqual({ error: "frame expired" });
  });
});

describe("input test targets", () => {
  it("clicks the first two echoes in the top grid row, which exists on any inventory with two echoes", () => {
    // 16:10 fixtures: first-row cells span y 0.115–0.265, columns centre at 0.130 and 0.222.
    for (const target of INPUT_TEST_TARGETS) {
      expect(target.y).toBeGreaterThan(0.13);
      expect(target.y).toBeLessThan(0.25);
    }
    expect(INPUT_TEST_TARGETS.map((t) => t.x)).toEqual([0.13, 0.222]);
  });
});
