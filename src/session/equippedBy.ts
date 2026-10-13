import { findEquippedByName, matchEquippedBy, PLAYER_CHARACTER_KEY } from "@wutheringtools/scanner-core";
import { allCharacters } from "@/data/scannerData";
import { playerName } from "@/settings/playerName";

// Who an echo is equipped by (ADR 0030). scanner-core's `matchEquippedBy` reads the
// "Equipped by <name>" line; this decides what the export says, using the current in-game
// name setting each time, so entering or changing the name later fixes echoes already read.

/** What the export says about an echo's character, and whether the user should check it. */
export interface EquippedBy {
  /** A character key, "Rover" for the main character, or null when not equipped (or unknown). */
  key: string | null;
  /** The line was read but the name didn't clearly match anyone. */
  flagged: boolean;
}

/** The parts of a candidate this needs (raw text from the panel, plus a fix from the review screen). */
export interface EquippedByInput {
  raw: { equippedBy?: string };
  /** Set in the review screen: a character key, "Rover", or null for "not equipped". */
  equippedByFix?: string | null;
  /** The line was read after the rest of the echo (`equippedByWatch.ts`). */
  equippedByLate?: boolean;
  /** Fields the user checked in the review screen. */
  checked?: string[];
}

/**
 * Who the echo is equipped by. A fix from the review screen wins. Otherwise the OCR'd line is
 * matched against every character and the player's in-game name: the main character exports
 * as "Rover" (the importing app picks its Rover entry), and an unclear name exports null,
 * flagged. Echoes read before this field existed have no raw text and export null, unflagged,
 * as they always did. A line read late (after the rest of the echo) exports its name but
 * stays flagged until the user checks it in the review screen.
 */
export function resolveEquippedBy(candidate: EquippedByInput, name: string | null = playerName()): EquippedBy {
  if (candidate.equippedByFix !== undefined) return { key: candidate.equippedByFix, flagged: false };
  const text = candidate.raw.equippedBy;
  if (text === undefined) return { key: null, flagged: false };
  const match = matchEquippedBy(text.split("\n"), allCharacters(), name);
  const late = candidate.equippedByLate === true && !candidate.checked?.includes("equippedBy");
  switch (match.kind) {
    case "character":
      return { key: match.key, flagged: late };
    case "player":
      return { key: PLAYER_CHARACTER_KEY, flagged: late };
    case "unknown":
      return { key: null, flagged: true };
    default:
      return { key: null, flagged: false };
  }
}

/** Display name for an export key: a character's name, "You (main character)", or "Not equipped". */
export function equippedByLabel(key: string | null): string {
  if (key === null) return "Not equipped";
  if (key === PLAYER_CHARACTER_KEY) return "You (main character)";
  return allCharacters().find((c) => c.key === key)?.name ?? key;
}

/** Characters the user can pick in the review screen: everyone except Rover's per-element entries. */
export function equipChoices(): { key: string; name: string }[] {
  return allCharacters()
    .filter((c) => !/^rover/i.test(c.key))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const REDACTED_PLAYER = "<player name>";
const REDACTED_UNKNOWN = "<name not recognised>";

/**
 * Hides the player's in-game name in text that leaves the app (Diagnostics reports, bug
 * reports). Every case-insensitive copy of `name` is replaced, and so is any name after
 * "Equipped by" that isn't a character's: an OCR slip ("Cl0ver") or a name typed
 * differently would otherwise get through. Character names stay, so misreads of them can
 * still be reported.
 */
export function redactPlayerName(text: string, name: string | null = playerName()): string {
  let out = text;
  if (name) out = out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), REDACTED_PLAYER);
  return out
    .split("\n")
    .map((line) => {
      const found = findEquippedByName([line]);
      if (found === null || found.includes(REDACTED_PLAYER)) return line;
      const match = matchEquippedBy([line], allCharacters(), name);
      if (match.kind === "character") return line;
      const replacement = match.kind === "player" ? REDACTED_PLAYER : REDACTED_UNKNOWN;
      const at = line.lastIndexOf(found);
      // The name comes back with its spacing tidied, so it may not appear as-is: drop the rest of the line.
      if (at === -1) return `${line.slice(0, line.search(/by/i) + 2)} ${replacement}`;
      return line.slice(0, at) + replacement + line.slice(at + found.length);
    })
    .join("\n");
}

/** Applies `redactPlayerName` to every string in a JSON-like value (a Diagnostics report). */
export function redactDeep<T>(value: T, name: string | null = playerName()): T {
  if (typeof value === "string") return redactPlayerName(value, name) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => redactDeep(v, name)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, name)])) as T;
  }
  return value;
}
