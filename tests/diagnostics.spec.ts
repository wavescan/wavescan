import { describe, expect, it } from "vitest";
import { buildChecks, buildReport, formatReport, type DiagnosticsInput } from "@/diagnostics/report";
import { decodePreview } from "@/diagnostics/preview";
import { isSupportedAspect } from "@/diagnostics/regions";
import type { GameWindow } from "@/ipc/types";

const window: GameWindow = {
  id: 1234,
  client_rect: { x: 0, y: 0, width: 2880, height: 1800 },
  scale_factor: 2,
  focused: true,
  minimized: false,
};

function healthy(): DiagnosticsInput {
  return {
    app: { name: "Wavescan", version: "0.0.1", platform: "windows", build: "abc1234" },
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
