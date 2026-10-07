import { scannerGameData, type FieldConfidence } from "@wutheringtools/scanner-core";

// Works out an echo's rarity (rank 2–5) from the numbers on its panel.
//
// The bundled game data only has each main stat's value at max level. Two facts turn that
// into the value at any level (checked against every endpoint of the in-game ranges; see
// docs/screens/echoes.md "Rarity"):
//  - each rarity has its own level cap: rank 2 → +10, 3 → +15, 4 → +20, 5 → +25;
//  - values grow by 16% of the +0 value per level, so value(L) = max × (1 + 0.16·L) / (1 + 0.16·cap).
//
// The free secondary stat (flat HP on cost 1, flat ATK on cost 3/4) is the main signal: a
// whole number whose expected value differs by ≥ 33% between neighbouring ranks. The main
// stat is a cross-check, because between ranks 2 and 3 it differs by only ~8%.

/** Highest level an echo of each rarity can reach. */
export const MAX_LEVEL_BY_RANK: Readonly<Record<number, number>> = { 2: 10, 3: 15, 4: 20, 5: 25 };

const RANKS = [2, 3, 4, 5] as const;
const GROWTH_PER_LEVEL = 0.16;
/**
 * Allowed gap between the read and expected value, as a share of the expected value. Covers
 * the game rounding the underlying number differently from us; far below the 8% gap
 * between the closest pair of ranks.
 */
const RELATIVE_TOLERANCE = 0.03;

export interface RankInput {
  cost: number | null;
  level: number | null;
  /** The free secondary stat's value (e.g. 114 for "HP 114"), or null if unread. */
  secondaryValue: number | null;
  /** Main stat key from scanner data (e.g. "HP", "Electro"), or null if unread. */
  mainStatKey: string | null;
  /** Main stat percentage as shown (e.g. 2.8 for "2.8%"), or null if unread. */
  mainStatValue: number | null;
}

export interface RankResult {
  rank: number | null;
  confidence: FieldConfidence;
}

/** Value of a stat at `level`, given its value at the rarity's max level. Null above the cap. */
export function valueAtLevel(maxValue: number, rank: number, level: number): number | null {
  const cap = MAX_LEVEL_BY_RANK[rank];
  if (cap === undefined || level < 0 || level > cap) return null;
  return (maxValue * (1 + GROWTH_PER_LEVEL * level)) / (1 + GROWTH_PER_LEVEL * cap);
}

/**
 * True if `read` is what the game would display for `expected`. `step` is the display
 * precision (1 for whole numbers, 0.1 for one-decimal percentages).
 */
function matches(read: number, expected: number, step: number): boolean {
  return Math.abs(read - expected) <= step / 2 + expected * RELATIVE_TOLERANCE;
}

/** Ranks whose expected value at this level matches what was read. */
function ranksMatching(read: number, level: number, step: number, maxFor: (rank: number) => number | undefined) {
  return RANKS.filter((rank) => {
    const max = maxFor(rank);
    if (max === undefined) return false;
    const expected = valueAtLevel(max, rank, level);
    return expected !== null && matches(read, expected, step);
  });
}

/**
 * Picks the rarity that explains the panel's numbers. High confidence needs the secondary
 * stat to match exactly one rank and the main stat (if read) to agree. A rank found from the
 * main stat alone is returned with low confidence; anything ambiguous returns null.
 */
export function inferRank(input: RankInput): RankResult {
  const { cost, level } = input;
  if (cost === null || level === null) return { rank: null, confidence: "low" };
  const data = scannerGameData();

  const mainKey = input.mainStatKey;
  const mainMatches =
    mainKey && input.mainStatValue !== null
      ? ranksMatching(input.mainStatValue, level, 0.1, (rank) => data.statsTable[cost]?.[mainKey]?.[rank])
      : null;

  if (input.secondaryValue !== null) {
    const secondaryMatches = ranksMatching(input.secondaryValue, level, 1, (rank) =>
      data.flatBonusesByRankByType[cost]?.[rank],
    );
    const [rank] = secondaryMatches;
    if (secondaryMatches.length === 1 && rank !== undefined) {
      const mainAgrees = mainMatches === null || mainMatches.includes(rank);
      return { rank, confidence: mainAgrees ? "high" : "low" };
    }
  }

  const [mainOnly] = mainMatches ?? [];
  if (mainMatches?.length === 1 && mainOnly !== undefined) return { rank: mainOnly, confidence: "low" };
  return { rank: null, confidence: "low" };
}

/** Reads the number out of a stat value like "2.8%" or "114". Null if it isn't one. */
export function statNumber(rawValue: string | undefined): number | null {
  if (!rawValue) return null;
  const match = /^[+-]?\d+(?:\.\d+)?/.exec(rawValue.replace(/\s+/g, ""));
  return match ? Number(match[0]) : null;
}
