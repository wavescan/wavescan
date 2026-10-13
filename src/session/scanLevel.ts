// The lowest echo level Wavescan keeps, in watch mode and auto mode alike. Below +5 an echo
// has no tuned substats yet, so it's fodder for any build, and reading it only slows the scan
// and fills the list. Auto mode can be told to stop higher (`NavigatorOptions.minLevel`),
// never lower.

/** Echoes below this level are never read into a scan. */
export const MIN_SCAN_LEVEL = 5;

/**
 * True when an echo at `level` is below `MIN_SCAN_LEVEL` and must be skipped. An unread level
 * (null) isn't below: the echo is kept, and review flags the missing level.
 */
export function isBelowScanLevel(level: number | null): boolean {
  return level !== null && level < MIN_SCAN_LEVEL;
}
