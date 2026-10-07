import type { OcrLine } from "@/ipc/types";

/**
 * Puts OCR lines in reading order: top to bottom, and left to right within one row.
 *
 * Windows OCR doesn't promise an order. A stat row like "HP ……… 2.8%" has a wide gap, so
 * it can come back as two lines, value first ("2.8%", "HP"), which scanner-core can't
 * parse. Lines whose vertical centres fall within half a line height of each other count
 * as one row.
 */
export function readingOrder(lines: readonly OcrLine[]): OcrLine[] {
  const centre = (l: OcrLine) => l.bounds.y + l.bounds.height / 2;
  const byY = [...lines].sort((a, b) => centre(a) - centre(b));

  const rows: OcrLine[][] = [];
  for (const line of byY) {
    const row = rows.at(-1);
    const first = row?.[0];
    const tolerance = first ? Math.max(first.bounds.height, line.bounds.height) / 2 : 0;
    if (row && first && Math.abs(centre(line) - centre(first)) <= tolerance) row.push(line);
    else rows.push([line]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.bounds.x - b.bounds.x));
}
