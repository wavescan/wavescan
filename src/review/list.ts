import { setName } from "@/data/scannerData";
import type { EchoCandidate } from "@/session/echoSession";
import { candidateCost, displayName, flaggedFields, isClear, type FieldId } from "./fields";

// Filtering, sorting and counting for the review screen's echo list. Pure functions.

export interface ReviewFilter {
  /** Free text matched against the echo's name, set and stats. */
  search: string;
  /** Only echoes that still need checking. */
  toCheck: boolean;
  /** A set key, or null for any set. */
  set: string | null;
  /** 1, 3 or 4, or null for any cost. */
  cost: number | null;
  /** Lowest level to show (0 shows everything). */
  minLevel: number;
}

export const EMPTY_FILTER: ReviewFilter = { search: "", toCheck: false, set: null, cost: null, minLevel: 0 };

function searchText(candidate: EchoCandidate): string {
  const parts = [
    displayName(candidate),
    candidate.slot.set ? setName(candidate.slot.set) : "",
    candidate.slot.mainStatLabel,
    ...candidate.slot.substats.map((s) => s.subStat),
    `#${candidate.index}`,
  ];
  return parts.join(" ").toLowerCase();
}

/** True when `candidate` passes every part of `filter`. */
export function matchesFilter(candidate: EchoCandidate, filter: ReviewFilter): boolean {
  if (filter.toCheck && isClear(candidate)) return false;
  if (filter.set !== null && candidate.slot.set !== filter.set) return false;
  if (filter.cost !== null && candidateCost(candidate) !== filter.cost) return false;
  if (filter.minLevel > 0 && (candidate.level ?? -1) < filter.minLevel) return false;
  const terms = filter.search.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = searchText(candidate);
  return terms.every((term) => text.includes(term));
}

/** The candidates passing `filter`, newest scan first. */
export function filterCandidates(candidates: EchoCandidate[], filter: ReviewFilter): EchoCandidate[] {
  return candidates.filter((c) => matchesFilter(c, filter)).sort((a, b) => b.index - a.index);
}

/** One stop in the "Check them now" walk-through: an echo and one of its flagged fields. */
export interface QueueItem {
  id: string;
  field: FieldId;
}

/** Every flagged field, oldest scan first, in panel order within an echo. */
export function reviewQueue(candidates: EchoCandidate[]): QueueItem[] {
  return [...candidates]
    .sort((a, b) => a.index - b.index)
    .flatMap((c) => flaggedFields(c).map((field) => ({ id: c.id, field })));
}

export interface ReviewSummary {
  total: number;
  /** Echoes with at least one field still to check. */
  toCheck: number;
  /** Echoes the user checked or fixed at least one field on. */
  checkedByUser: number;
  /** Echoes that can't be exported until the echo itself is picked. */
  unknown: number;
  /** How many echoes are +25, +20 to +24, and below +20 (level unknown counts as below). */
  levels: { max: number; high: number; low: number };
  /** Set key → count, most common first. */
  sets: [string, number][];
}

export function summarize(candidates: EchoCandidate[]): ReviewSummary {
  const sets = new Map<string, number>();
  const summary: ReviewSummary = {
    total: candidates.length,
    toCheck: 0,
    checkedByUser: 0,
    unknown: 0,
    levels: { max: 0, high: 0, low: 0 },
    sets: [],
  };
  for (const c of candidates) {
    if (!isClear(c)) summary.toCheck += 1;
    if (c.checked?.length) summary.checkedByUser += 1;
    if (!c.slot.echo) summary.unknown += 1;
    const level = c.level ?? -1;
    if (level === 25) summary.levels.max += 1;
    else if (level >= 20) summary.levels.high += 1;
    else summary.levels.low += 1;
    if (c.slot.set) sets.set(c.slot.set, (sets.get(c.slot.set) ?? 0) + 1);
  }
  summary.sets = [...sets.entries()].sort((a, b) => b[1] - a[1] || setName(a[0]).localeCompare(setName(b[0])));
  return summary;
}
