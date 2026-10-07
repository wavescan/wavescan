import type { FracRect } from "@/ipc/types";

// Regions read during the OCR test, as fractions of the game window on the
// Bag → Echoes screen. Copied from the optimizer's `src/scanner/layout.ts`
// (NAME_BLOCK, PANEL_BOX) until `@wuthering-tools/scanner-core` exists (ADR 0007).

export interface TestRegion {
  id: string;
  label: string;
  region: FracRect;
}

export const OCR_TEST_REGIONS: TestRegion[] = [
  {
    id: "echo-name",
    label: "Echo name",
    region: { x: 0.685, y: 0.104, width: 0.27, height: 0.034 },
  },
  {
    id: "echo-panel",
    label: "Echo details panel",
    region: { x: 0.685, y: 0.095, width: 0.29, height: 0.67 },
  },
];

/**
 * Where the input test clicks on Bag → Echoes: the first two echoes in the grid (top-left).
 * Clicking a cell only selects that echo, so it's harmless whatever is there. Measured
 * from the 16:10 fixtures: column centres are about 0.130 and 0.222, and the first row's
 * centre is y 0.19 (cells span y 0.115–0.265). The first row is the only one that exists
 * on a small inventory: the old y 0.42 hit the third row and clicked empty space on an
 * account with three echoes (2026-10-07 report).
 */
export const INPUT_TEST_TARGETS = [
  { x: 0.13, y: 0.19 },
  { x: 0.222, y: 0.19 },
] as const;

/** Game UI aspect ratios the layouts support: 16:10 to 16:9, with a little slack. */
export const SUPPORTED_ASPECT = { min: 16 / 10 - 0.05, max: 16 / 9 + 0.05 } as const;

export function isSupportedAspect(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio >= SUPPORTED_ASPECT.min && ratio <= SUPPORTED_ASPECT.max;
}
