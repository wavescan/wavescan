import {
  MAIN_STAT_ROW,
  NAME_BLOCK,
  PANEL_BOX,
  SECONDARY_STAT_ROW,
  STATS_BLOCK,
  SUBSTAT_BLOCK,
  SUBSTAT_LABEL_COLUMN,
  SUBSTAT_VALUE_COLUMN,
  regionForFrame,
  type FrameSize,
  type RegionFrac,
} from "@wutheringtools/scanner-core";
import type { RegionRead } from "@/ipc/types";

/**
 * The echo's level ("+25"), just left of the set icon. Wuthering Tools doesn't read it
 * (it treats every echo as max level), so it isn't in scanner-core. Measured on the 16:10
 * fixtures (2880×1800 and 2800×1752): text spans x 0.696–0.721, y 0.168–0.187. Padded,
 * and ends before SET_ICON_BOX (x ≥ 0.7266). See docs/screens/echoes.md.
 */
export const LEVEL_ROW: RegionFrac = { x: 0.69, y: 0.16, width: 0.0355, height: 0.035 };

/** Region ids used by the echo extractor. */
export type EchoRegionId =
  | "name"
  | "level"
  | "mainStat"
  | "secondaryStat"
  | "substatLabels"
  | "substatValues"
  | "substatBlock";

const READ_REGIONS: Record<EchoRegionId, RegionFrac> = {
  name: NAME_BLOCK,
  level: LEVEL_ROW,
  mainStat: MAIN_STAT_ROW,
  secondaryStat: SECONDARY_STAT_ROW,
  substatLabels: SUBSTAT_LABEL_COLUMN,
  substatValues: SUBSTAT_VALUE_COLUMN,
  substatBlock: SUBSTAT_BLOCK,
};

/** Every region to OCR for one echo, adjusted for this frame's aspect ratio. */
export function echoReadRegions(frame: FrameSize): RegionRead[] {
  return (Object.entries(READ_REGIONS) as [EchoRegionId, RegionFrac][]).map(([id, region]) => ({
    id,
    region: regionForFrame(region, frame),
  }));
}

/**
 * Regions sampled every tick for change detection: the whole panel (a different echo's
 * art and name) and the stats block (a different roll of the same echo).
 */
export function fingerprintRegions(frame: FrameSize): RegionFrac[] {
  return [regionForFrame(PANEL_BOX, frame), regionForFrame(STATS_BLOCK, frame)];
}
