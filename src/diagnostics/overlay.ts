import type { FrameSize, RegionFrac } from "@wutheringtools/scanner-core";
import { echoReadRegions, fingerprintRegions, type EchoRegionId } from "@/session/echoRegions";
import { mainStatLabelRegion } from "@/session/hpLabel";
import { setIconSearchRegion } from "@/session/setIcon";

// The boxes Wavescan reads on Bag → Echoes, for drawing over the Diagnostics preview. A box
// that misses its text (a shifted capture, an unmeasured resolution) shows at a glance, and
// a tester can send the picture: it's the preview Rust already masked, plus these outlines.
// The regions come from the same functions a scan uses, so the picture can't drift from
// what's really read.

/** What a box is for, which decides its colour. */
export type OverlayKind = "text" | "pixels" | "change" | "private";

export interface OverlayBox {
  id: string;
  /** What the box is, in a few words (the User ID box shows it as a caption). */
  label: string;
  kind: OverlayKind;
  /** Fractions of the game area. */
  region: RegionFrac;
}

/**
 * The User ID area that Rust blacks out and refuses to read (`safety::USER_ID_REGION`,
 * ADR 0013). Drawn so testers can see the mask covers their ID. Kept in step with Rust by
 * a test that reads `safety.rs`.
 */
export const USER_ID_REGION: RegionFrac = { x: 0.86, y: 0.975, width: 0.14, height: 0.025 };

const TEXT_LABELS: Record<EchoRegionId, string> = {
  name: "name",
  level: "level",
  mainStat: "main stat",
  secondaryStat: "second stat",
  substatLabels: "substat names",
  substatValues: "substat values",
  substatBlock: "substats (fallback)",
  substatRow1: "substat row 1 (fallback)",
  substatRow2: "substat row 2 (fallback)",
  substatRow3: "substat row 3 (fallback)",
  substatRow4: "substat row 4 (fallback)",
  substatRow5: "substat row 5 (fallback)",
};

/** Every box to draw for a frame of this size, in drawing order (big boxes first). */
export function overlayBoxes(frame: FrameSize): OverlayBox[] {
  const [panel, stats] = fingerprintRegions(frame);
  const boxes: OverlayBox[] = [];
  if (panel) boxes.push({ id: "panel", label: "change check: panel", kind: "change", region: panel });
  if (stats) boxes.push({ id: "stats", label: "change check: stats", kind: "change", region: stats });
  for (const { id, region } of echoReadRegions(frame)) {
    boxes.push({ id, label: TEXT_LABELS[id as EchoRegionId] ?? id, kind: "text", region });
  }
  boxes.push({ id: "setIcon", label: "set icon", kind: "pixels", region: setIconSearchRegion(frame) });
  boxes.push({ id: "mainStatLabel", label: "HP check", kind: "pixels", region: mainStatLabelRegion(frame) });
  boxes.push({ id: "userId", label: "User ID (never read)", kind: "private", region: USER_ID_REGION });
  return boxes;
}

/** A box in canvas pixels, rounded to whole pixels. */
export function toPixels(region: RegionFrac, width: number, height: number) {
  return {
    x: Math.round(region.x * width),
    y: Math.round(region.y * height),
    width: Math.round(region.width * width),
    height: Math.round(region.height * height),
  };
}

/** Outline colour per kind: green for OCR, blue for pixel checks, grey for change checks, red for private. */
export const OVERLAY_COLOURS: Record<OverlayKind, string> = {
  text: "#22c55e",
  pixels: "#38bdf8",
  change: "rgba(255, 255, 255, 0.45)",
  private: "#ef4444",
};

/**
 * Draws `boxes` onto a 2D canvas context of `width` × `height` (the preview's size). Only
 * outlines: a caption inside a small box would hide the text it frames, so the colours are
 * explained under the picture instead. The User ID box is the exception, captioned above.
 */
export function drawOverlay(context: CanvasRenderingContext2D, boxes: readonly OverlayBox[], width: number, height: number) {
  const fontSize = Math.max(10, Math.round(height / 60));
  context.font = `${fontSize}px sans-serif`;
  context.lineWidth = Math.max(1, Math.round(height / 500));
  for (const box of boxes) {
    const { x, y, width: w, height: h } = toPixels(box.region, width, height);
    context.strokeStyle = OVERLAY_COLOURS[box.kind];
    context.setLineDash(box.kind === "change" ? [4, 4] : []);
    context.strokeRect(x + 0.5, y + 0.5, w, h);
    if (box.kind === "private") {
      const captionY = y - fontSize - 6;
      context.fillStyle = "rgba(0, 0, 0, 0.65)";
      context.fillRect(x, captionY, context.measureText(box.label).width + 6, fontSize + 4);
      context.fillStyle = OVERLAY_COLOURS.private;
      context.fillText(box.label, x + 3, captionY + fontSize);
    }
  }
  context.setLineDash([]);
}
