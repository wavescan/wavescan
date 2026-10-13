import { levenshteinDistance, readsAsPanel, resolveEchoByNameAndCost } from "@wutheringtools/scanner-core";
import type { RegionText } from "@/ipc/types";
import { readingOrder } from "./ocrText";

// Which game screen a read frame shows (architecture.md §2 step 4, ADR 0031). v0.1 knows
// one screen, Bag → Echoes; everything else is "unknown". Decided from the same pinned
// frame the extractor reads, so a frame is never classified from one picture and read
// from another.

/** The screens Wavescan can read. `unknown` is any other screen, or a frame it can't place. */
export type ScreenKind = "bag.echoes" | "unknown";

/** The bag header's word for the Echoes tab ("Echoes  2969/3000"). */
const ECHOES_HEADER = "echoes";

/**
 * Edits allowed between a header word and "echoes". One covers a dropped or misread letter
 * ("Ech0es", "Echoe"), while "Echo" (two edits), on other screens' buttons, doesn't match.
 */
const HEADER_MAX_EDITS = 1;

/** The OCR text of region `id`, in reading order, or "" if it wasn't read. */
function regionText(results: readonly RegionText[], id: string): string {
  const region = results.find((r) => r.id === id);
  return readingOrder(region?.lines ?? [])
    .map((l) => l.text)
    .join(" ")
    .trim();
}

/**
 * Whether the bag header (`HEADER_ROW`) says "Echoes". Only letters count, so the item
 * count glued on by OCR ("Echoes2969/3000") still matches. A zero is taken as an "o"
 * first ("Ech0es"), the usual OCR mix-up.
 */
export function headerSaysEchoes(headerText: string): boolean {
  return headerText
    .toLowerCase()
    .replaceAll("0", "o")
    .split(/[^a-z]+/)
    .some((word) => word.length > 0 && levenshteinDistance(word, ECHOES_HEADER) <= HEADER_MAX_EDITS);
}

/**
 * Which screen the read regions show: `bag.echoes` when the bag header (the `header`
 * region) says "Echoes", otherwise `unknown`. A popup over the bag is `unknown` too: the
 * game blurs everything behind it, header included (fixtures/screens/unknown).
 *
 * Only the header decides, not the panel: an echo the bundled data doesn't know yet (new
 * game patch) is still on this screen, and the user can fix its name in review. Whether an
 * echo is selected and readable is `selectedEchoReads`.
 */
export function classifyScreen(results: readonly RegionText[]): ScreenKind {
  return headerSaysEchoes(regionText(results, "header")) ? "bag.echoes" : "unknown";
}

/**
 * Whether the detail panel reads as an echo: its name matched a known echo, or the
 * secondary stat ("ATK 150") gives a cost. A menu or popup over the bag fails this, and so
 * does an unknown echo below +25 (its secondary stat is lower, so it gives no cost).
 */
export function selectedEchoReads(results: readonly RegionText[]): boolean {
  const secondary = regionText(results, "secondaryStat");
  const identity = resolveEchoByNameAndCost(regionText(results, "name"), secondary);
  return readsAsPanel(secondary, identity.echo !== null);
}

/** Why a frame isn't ready to scan, or `ok`. */
export type ScreenCheck = "ok" | "wrong-screen" | "no-echo";

/**
 * The check before auto mode starts clicking: on Bag → Echoes, with an echo panel that
 * reads. Stricter than `classifyScreen`, because a menu over the bag can still show the
 * header and the grid, and a click would land in the menu.
 */
export function checkScreenForAuto(results: readonly RegionText[]): ScreenCheck {
  if (classifyScreen(results) !== "bag.echoes") return "wrong-screen";
  return selectedEchoReads(results) ? "ok" : "no-echo";
}

/** Plain-language explanation of a failed check, for the UI. */
export function screenCheckMessage(check: Exclude<ScreenCheck, "ok">): string {
  return check === "wrong-screen"
    ? "Can't see Bag → Echoes in the game. Open the bag and pick the Echoes tab, close any popup over it, then try again."
    : "Couldn't read the selected echo. Close any menu or message over the bag, click an echo, then try again.";
}
