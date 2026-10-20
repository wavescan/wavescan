// Which cells of the pixel progress bar (PixelProgress.vue) are lit. The bar is a row of
// slanted blocks, like the pixels breaking off the Wavescan mark.

/** One block: fully lit, half lit (just behind the newest one, or partly done), or off. */
export type PixelCell = "on" | "trail" | "off";

/** How many trailing half-lit blocks follow the moving block in `runningCells`. */
export const TRAIL = 2;

/**
 * For progress with a known end (an update download): cells fill from the left. A cell that
 * is partly done shows half lit, so a slow download still visibly moves.
 * `fraction` is 0 to 1; anything outside that range is clamped.
 */
export function filledCells(cells: number, fraction: number): PixelCell[] {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const done = clamped * cells;
  const full = Math.floor(done);
  return Array.from({ length: cells }, (_, i): PixelCell => {
    if (i < full) return "on";
    if (i === full && done > full) return "trail";
    return "off";
  });
}

/**
 * For progress without an end (an auto scan doesn't know how many echoes the bag holds):
 * one block steps along with each item read and wraps round at the end, with a short
 * half-lit trail behind it. Nothing is lit before the first item.
 */
export function runningCells(cells: number, count: number): PixelCell[] {
  const result: PixelCell[] = Array.from({ length: cells }, () => "off");
  if (cells <= 0 || count <= 0) return result;
  const head = (count - 1) % cells;
  result[head] = "on";
  for (let back = 1; back <= Math.min(TRAIL, count - 1, cells - 1); back++) {
    result[(head - back + cells) % cells] = "trail";
  }
  return result;
}
