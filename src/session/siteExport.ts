import type { WutheringToolsScan } from "./exportScan";

// Per-site tweaks to the copied scan, for a site that reads an echo differently from
// Wuthering Tools (ADR 0037). The scan's own keys are Wuthering Tools' (ADR 0008), so
// "Copy and open Wuthering Tools" and "Copy scan only" never go through here.

/**
 * Echo keys Tacet Lab doesn't recognise, and the key it does. Tacet Lab matches an echo by
 * its name with spaces and punctuation removed, and Wuthering Tools' key for "Baby
 * Roseshroom" is `YoungRoseshroom` (issue #103). Once Wuthering Tools renames that key
 * (with a migration for saved data), the synced game data stops producing it and this
 * entry does nothing; remove it then.
 */
export const TACET_LAB_ECHO_KEYS: Readonly<Record<string, string>> = {
  YoungRoseshroom: "BabyRoseshroom",
};

/** The scan as Tacet Lab's import reads it: echo keys renamed, everything else unchanged. */
export function scanForTacetLab(scan: WutheringToolsScan): WutheringToolsScan {
  return {
    ...scan,
    echoes: scan.echoes.map((echo) => {
      const renamed = TACET_LAB_ECHO_KEYS[echo.echo];
      return renamed ? { ...echo, echo: renamed } : echo;
    }),
  };
}
