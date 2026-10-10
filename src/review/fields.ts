import {
  costByClass,
  getScannerEcho,
  getSubstatType,
  mapParsedEchoes,
  scannerGameData,
  type MappedEcho,
} from "@wutheringtools/scanner-core";
import { labelForStatKey } from "@/session/echoExtract";
import { rowValue } from "@/session/echoRank";
import type { EchoCandidate } from "@/session/echoSession";
import { substatCountFits } from "@/session/exportScan";

// What the review screen shows and lets the user fix, for one scanned echo. Pure functions
// over `EchoCandidate`, so the "needs a look" rules here match what the export flags in
// `lowConfidence` (exportScan.ts), and every fix is testable without the UI.

/** A field the user can check or fix. Substat rows are `substat.0` … `substat.4` (on-screen order). */
export type FieldId = "name" | "set" | "mainStat" | "level" | "rank" | "substats" | `substat.${number}`;

/** Plain-English name of a field, for buttons, the review queue and bug reports. */
export function fieldLabel(candidate: EchoCandidate, field: FieldId): string {
  if (field.startsWith("substat.")) {
    const row = candidate.slot.substats[Number(field.slice(8))];
    return row?.subStat ? `${row.subStat} (substat)` : "substat";
  }
  const labels: Record<string, string> = {
    name: "Echo",
    set: "Sonata set",
    mainStat: "Main stat",
    level: "Level",
    rank: "Rarity",
    substats: "Number of substats",
  };
  return labels[field] ?? field;
}

/** The echo's name for display, or `Unknown ("<what was read>")`. */
export function displayName(candidate: EchoCandidate): string {
  const key = candidate.slot.echo;
  if (!key) return `Unknown ("${candidate.raw.name}")`;
  // getScannerEcho returns undefined at runtime for an unknown key despite its type.
  return (getScannerEcho(key) as ReturnType<typeof getScannerEcho> | undefined)?.name ?? key;
}

/** The main stat's key in the game data ("CritRate"), or null if it wasn't read. */
export function mainStatKey(candidate: EchoCandidate): string | null {
  const label = candidate.slot.mainStatLabel;
  return label ? (scannerGameData().verboseStatLabelMap[label] ?? null) : null;
}

/** The main stat value as read ("22.0%" → 22), or null. */
export function mainStatValue(candidate: EchoCandidate): number | null {
  return rowValue(candidate.raw.mainStat);
}

/** Substat keys as the export names them ("CritDMG", "ATK_FLAT"), or null for an empty row. */
export function substatKey(candidate: EchoCandidate, index: number): string | null {
  const row = candidate.slot.substats[index];
  return row?.subStat ? getSubstatType(row) : null;
}

/** The values the game can roll for a substat, lowest first, or [] if unknown. */
export function legalSubstatValues(key: string | null): number[] {
  return key ? (scannerGameData().subStatsTable[key] ?? []) : [];
}

/** True for substats shown as a percentage. Flat ATK/HP/DEF are whole numbers. */
export function isPercentSubstat(key: string | null): boolean {
  return key !== null && !key.endsWith("_FLAT");
}

/**
 * How good a roll is: its position among the legal values (1 = lowest … `of` = highest).
 * Null when the value isn't one the game can roll (a misread) or the stat is unknown.
 */
export function rollTier(key: string | null, value: number | null): { tier: number; of: number } | null {
  const values = legalSubstatValues(key);
  if (value === null || values.length === 0) return null;
  const index = values.findIndex((v) => Math.abs(v - value) < 0.05);
  return index === -1 ? null : { tier: index + 1, of: values.length };
}

/** The substat's numeric value, or null if it couldn't be read. */
export function substatValue(candidate: EchoCandidate, index: number): number | null {
  const text = candidate.slot.substats[index]?.subStatValue;
  if (!text) return null;
  const value = Number.parseFloat(text.replace("%", ""));
  return Number.isFinite(value) ? value : null;
}

/** Main stats an echo of this cost can have (keys), for the main-stat fixer. */
export function mainStatOptions(cost: number | null): string[] {
  return cost === null ? [] : Object.keys(scannerGameData().statsTable[cost] ?? {});
}

/** Sets this echo can roll (keys), or every set when the echo is unknown. */
export function setOptions(candidate: EchoCandidate, allSets: string[]): string[] {
  const key = candidate.slot.echo;
  const echo = key ? (getScannerEcho(key) as ReturnType<typeof getScannerEcho> | undefined) : undefined;
  return echo?.sets?.length ? echo.sets : allSets;
}

function costOf(candidate: EchoCandidate): number | null {
  const cost = Number(candidate.slot.cost);
  return candidate.slot.cost === null || !Number.isFinite(cost) ? null : cost;
}

/**
 * The fields that still need the user's eyes, in panel order. Mirrors `toScanEcho`: a field
 * is listed here exactly when the export would put it in `lowConfidence` (or leave the echo
 * out because it's unknown), and nothing the user has checked or fixed is listed.
 */
export function flaggedFields(candidate: EchoCandidate): FieldId[] {
  const c = candidate.confidence;
  const checked = new Set(candidate.checked ?? []);
  const [mapped] = mapParsedEchoes([candidate.slot], false);
  const out: FieldId[] = [];
  const add = (field: FieldId, flagged: boolean) => {
    if (flagged && !checked.has(field)) out.push(field);
  };

  add("name", !mapped?.echo || c.name === "low" || c.cost === "low");
  add("level", c.level === "low" || candidate.level === null);
  add("rank", c.rank === "low" || candidate.rank === null);
  add("set", c.set === "low" || !mapped?.echoSet);
  add("mainStat", c.mainStat === "low" || !mapped?.stat);
  candidate.slot.substats.forEach((row, i) => {
    add(`substat.${i}`, Boolean(row.subStat) && c.substats[i] === "low");
  });
  const count = mapped ? mappedSubstatCount(mapped) : 0;
  add(
    "substats",
    candidate.level !== null && !substatCountFits(count, candidate.level, candidate.echoSkillRow),
  );
  return out;
}

/** Substats the export would include (a known type and a value above 0), like `substatsOf` there. */
function mappedSubstatCount(mapped: MappedEcho): number {
  let count = 0;
  for (let i = 1; i <= 5; i++) {
    const type = mapped[`echoSubStatsType${i}` as keyof MappedEcho];
    const value = mapped[`echoSubStatsValue${i}` as keyof MappedEcho] as number | null;
    if (type && value !== null && value > 0) count += 1;
  }
  return count;
}

/** True when nothing on this echo needs checking. */
export function isClear(candidate: EchoCandidate): boolean {
  return flaggedFields(candidate).length === 0;
}

/**
 * The raw OCR text behind a field, for the "Read as" line and bug reports. Null when the
 * extractor doesn't keep raw text for that field (set, substats).
 */
export function rawReading(candidate: EchoCandidate, field: FieldId): string | null {
  if (field === "name") return candidate.raw.name || null;
  if (field === "level") return candidate.raw.level || null;
  if (field === "mainStat" || field === "rank") return candidate.raw.mainStat || null;
  // Substat rows keep only the parsed value (scanner-core snaps a misread such as "17.5%" to
  // the nearest legal roll and flags it), not the raw text, so there's nothing more to show.
  return null;
}

// ---- Fixes. Each returns a new candidate: the old one is never changed. ----

function withChecked(candidate: EchoCandidate, field: FieldId): string[] {
  return [...new Set([...(candidate.checked ?? []), field])];
}

/** The user says the field is right as read. */
export function confirmField(candidate: EchoCandidate, field: FieldId): EchoCandidate {
  const confidence = { ...candidate.confidence, substats: [...candidate.confidence.substats] };
  if (field === "name") {
    confidence.name = "high";
    confidence.cost = "high";
  } else if (field === "set" || field === "mainStat" || field === "level" || field === "rank") {
    confidence[field] = "high";
  } else if (field.startsWith("substat.")) {
    confidence.substats[Number(field.slice(8))] = "high";
  }
  return { ...candidate, confidence, checked: withChecked(candidate, field) };
}

/** Sets the level (0–25). */
export function fixLevel(candidate: EchoCandidate, level: number): EchoCandidate {
  if (!Number.isInteger(level) || level < 0 || level > 25) throw new Error("level must be 0–25");
  return confirmField({ ...candidate, level }, "level");
}

/** Sets the rarity (2–5). */
export function fixRank(candidate: EchoCandidate, rank: number): EchoCandidate {
  if (!Number.isInteger(rank) || rank < 1 || rank > 5) throw new Error("rarity must be 1–5");
  return confirmField({ ...candidate, rank }, "rank");
}

/** Sets the sonata set (a set key). */
export function fixSet(candidate: EchoCandidate, set: string): EchoCandidate {
  return confirmField({ ...candidate, slot: { ...candidate.slot, set } }, "set");
}

/** Sets the main stat (a stat key such as "CritRate"). */
export function fixMainStat(candidate: EchoCandidate, key: string): EchoCandidate {
  return confirmField({ ...candidate, slot: { ...candidate.slot, mainStatLabel: labelForStatKey(key) } }, "mainStat");
}

/**
 * Sets which echo this is (an echo key). Cost follows from the echo, and the set too when
 * the echo only comes in one.
 */
export function fixEcho(candidate: EchoCandidate, key: string): EchoCandidate {
  const echo = getScannerEcho(key) as ReturnType<typeof getScannerEcho> | undefined;
  if (!echo) throw new Error(`unknown echo ${key}`);
  const onlySet = echo.sets?.length === 1 ? echo.sets[0] : undefined;
  const setStillFits = candidate.slot.set !== null && (echo.sets ?? []).includes(candidate.slot.set);
  const set = onlySet ?? (setStillFits ? candidate.slot.set : null);
  const slot = { ...candidate.slot, echo: key, cost: costByClass(echo.class), set };
  const next = confirmField({ ...candidate, slot }, "name");
  if (onlySet) return confirmField(next, "set");
  if (setStillFits) return next;
  // The old set can't belong to this echo, so ask for it again.
  return {
    ...next,
    confidence: { ...next.confidence, set: "low" },
    checked: (next.checked ?? []).filter((f) => f !== "set"),
  };
}

/** Sets one substat's value. `value` must be a value the game can roll for that stat. */
export function fixSubstatValue(candidate: EchoCandidate, index: number, value: number): EchoCandidate {
  const row = candidate.slot.substats[index];
  if (!row) throw new Error(`no substat ${index}`);
  const key = getSubstatType(row);
  const legal = legalSubstatValues(key);
  if (legal.length > 0 && !legal.some((v) => Math.abs(v - value) < 0.05)) {
    throw new Error(`${value} isn't a value ${row.subStat} can roll`);
  }
  const text = isPercentSubstat(key) ? `${value.toFixed(1)}%` : String(Math.round(value));
  const substats = candidate.slot.substats.map((s, i) => (i === index ? { ...s, subStatValue: text } : s));
  return confirmField({ ...candidate, slot: { ...candidate.slot, substats } }, `substat.${index}`);
}

/** Display name of a main-stat or substat key ("CritRate" → "Crit. Rate"). */
export function statLabel(key: string): string {
  return key.endsWith("_FLAT") ? labelForStatKey(key.slice(0, -5)) : labelForStatKey(key);
}

/** The cost as a number, or null. */
export function candidateCost(candidate: EchoCandidate): number | null {
  return costOf(candidate);
}
