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
 * Where the input test clicks on Bag → Echoes: two cells in the echo grid (left side).
 * Clicking a cell only selects that echo, so it's harmless whatever is there. Measured
 * from the 16:10 fixtures: column centres are about 0.130 and 0.222, and y 0.42 lands
 * inside a full row whether or not the grid is scrolled.
 */
export const INPUT_TEST_TARGETS = [
  { x: 0.13, y: 0.42 },
  { x: 0.222, y: 0.42 },
] as const;

/** Game UI aspect ratios the layouts support: 16:10 to 16:9, with a little slack. */
export const SUPPORTED_ASPECT = { min: 16 / 10 - 0.05, max: 16 / 9 + 0.05 } as const;

export function isSupportedAspect(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio >= SUPPORTED_ASPECT.min && ratio <= SUPPORTED_ASPECT.max;
}
