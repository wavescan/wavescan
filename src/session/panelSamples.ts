import type { FrameSize, RegionFrac } from "@wutheringtools/scanner-core";
import { fingerprintRegions } from "./echoRegions";
import { mainStatLabelRegion } from "./hpLabel";
import type { Sample } from "./samples";
import { setIconSearchRegion } from "./setIcon";

// The small images taken from the echo panel on every tick (watch mode, auto mode and
// Diagnostics alike): two for change detection, and two that the extractor reads by their
// pixels because OCR can't (the set icon, and an "HP" main-stat label). Sampling them
// together means they all come from the frame that's then OCR'd.

/** Pixel samples the extractor uses besides OCR, from the same frame as the OCR. */
export interface PanelSamples {
  /** `setIconSearchRegion`: tells the set apart for echoes that can be in more than one. */
  setIcon?: Sample;
  /** `mainStatLabelRegion`: recognises "HP", which Windows OCR doesn't read. */
  mainStatLabel?: Sample;
}

/** Every region to sample, in the order `splitPanelSamples` expects. */
export function panelSampleRegions(frame: FrameSize): RegionFrac[] {
  return [...fingerprintRegions(frame), setIconSearchRegion(frame), mainStatLabelRegion(frame)];
}

/** Splits decoded samples of `panelSampleRegions` into change-detection images and extractor samples. */
export function splitPanelSamples(images: readonly Sample[]): {
  panel: Sample | undefined;
  stats: Sample | undefined;
  extras: PanelSamples;
} {
  const [panel, stats, setIcon, mainStatLabel] = images;
  return { panel, stats, extras: { setIcon, mainStatLabel } };
}
