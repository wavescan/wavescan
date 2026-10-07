import type { ScanEcho } from "@/session/exportScan";

// Compares an exported echo with its hand-checked golden (fixtures/screens/<screen>/<WxH>/*.json)
// field by field. Used by tests/fixtureReplay.fixtures.ts. See docs/fixtures.md.

/** A golden file: what the screenshot really shows, checked by eye (docs/fixtures.md rule 3). */
export interface GoldenEcho {
  echo: string;
  /** null = not confirmed by eye yet, so not compared. */
  echoSet: string | null;
  cost: 1 | 3 | 4;
  rank: number;
  level: number;
  stat: string;
  substats: { type: string; value: number }[];
  /** Character key, or null when the panel shows no "Equipped by" line. */
  equippedBy: string | null;
  notes?: string;
}

/**
 * - `correct`: matches the golden.
 * - `flagged`: wrong or missing, but listed in `lowConfidence`, so the web app asks the user.
 * - `missing`: exported as null (the schema's "couldn't read it", ADR 0008).
 * - `wrong`: a different value, not flagged. A silent misread: the one outcome that fails.
 * - `skipped`: not compared (golden not confirmed, or the scanner doesn't read it yet).
 */
export type Outcome = "correct" | "flagged" | "missing" | "wrong" | "skipped";

export interface FieldResult {
  field: string;
  expected: unknown;
  actual: unknown;
  outcome: Outcome;
}

/**
 * Fields the scanner doesn't read yet, so they're always exported as null. `equippedBy`
 * comes with the "Equipped by" reader (roadmap Phase 2, PR D). Remove it from here then.
 */
export const NOT_READ_YET = new Set(["equippedBy"]);

const SCALARS = ["echo", "echoSet", "cost", "rank", "level", "stat", "equippedBy"] as const;

function judge(field: string, expected: unknown, actual: unknown, low: Set<string>): Outcome {
  if (expected === actual) return "correct";
  if (low.has(field)) return "flagged";
  if (actual === null || actual === undefined) return "missing";
  return "wrong";
}

/** Compares one exported echo (null = the scanner couldn't identify it) with its golden. */
export function compareEcho(golden: GoldenEcho, actual: ScanEcho | null): FieldResult[] {
  const low = new Set(actual?.lowConfidence ?? []);
  const results: FieldResult[] = [];

  for (const field of SCALARS) {
    const expected = golden[field];
    const got = actual ? actual[field] : null;
    const skip = NOT_READ_YET.has(field) || (field === "echoSet" && expected === null);
    results.push({ field, expected, actual: got, outcome: skip ? "skipped" : judge(field, expected, got, low) });
  }

  const actualSubs = actual?.substats ?? [];
  const count = Math.max(golden.substats.length, actualSubs.length);
  for (let i = 0; i < count; i++) {
    const field = `substats.${i}`;
    const expected = golden.substats[i] ?? null;
    const got = actualSubs[i] ?? null;
    const same = expected !== null && got !== null && expected.type === got.type && expected.value === got.value;
    const flagged = low.has(`${field}.value`) || low.has(`${field}.type`) || low.has(field);
    let outcome: Outcome;
    if (same) outcome = "correct";
    else if (flagged) outcome = "flagged";
    else if (got === null) outcome = "missing";
    else outcome = "wrong";
    results.push({ field, expected, actual: got, outcome });
  }
  return results;
}

export interface Summary {
  /** Fields compared (everything except `skipped`). */
  compared: number;
  correct: number;
  flagged: number;
  missing: number;
  wrong: number;
  skipped: number;
  /** correct / compared, 0–1. The release gate is ≥ 0.99 (CLAUDE.md). */
  accuracy: number;
}

/** Totals over any number of field results. */
export function summarize(results: FieldResult[]): Summary {
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  const skipped = count("skipped");
  const compared = results.length - skipped;
  const correct = count("correct");
  return {
    compared,
    correct,
    flagged: count("flagged"),
    missing: count("missing"),
    wrong: count("wrong"),
    skipped,
    accuracy: compared === 0 ? 1 : correct / compared,
  };
}
