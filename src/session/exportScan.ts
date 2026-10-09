import { mapParsedEchoes, type MappedEcho } from "@wutheringtools/scanner-core";
import type { EchoCandidate } from "./echoSession";

// Builds the WutheringToolsScan v1 file (schema/scan.v1.json, ADR 0008) from candidates.

export interface ScanMeta {
  scannerVersion: string;
  platform: "windows" | "macos";
  resolution: { width: number; height: number };
  mode: "watch" | "auto";
  scannedAt?: Date;
}

export interface ScanEcho {
  scanId: string;
  echo: string;
  echoSet: string | null;
  cost: 1 | 3 | 4;
  rank: number | null;
  level: number | null;
  stat: string | null;
  substats: { type: string; value: number }[];
  equippedBy: string | null;
  lowConfidence?: string[];
}

export interface WutheringToolsScan {
  format: "WutheringToolsScan";
  version: 1;
  meta: {
    scannerVersion: string;
    scannedAt: string;
    platform: "windows" | "macos";
    resolution: { width: number; height: number };
    language: "en";
    mode: "watch" | "auto";
  };
  echoes: ScanEcho[];
}

/** Result of building a scan: the file, plus how many candidates couldn't be exported. */
export interface BuiltScan {
  scan: WutheringToolsScan;
  /** Candidates whose echo couldn't be identified (they need fixing before export). */
  skippedUnknown: number;
}

const COSTS = new Set([1, 3, 4]);

/** Substats unlock one per 5 levels (+5, +10, …, +25), so a +N echo shows ⌊N/5⌋ of them. */
export function expectedSubstatCount(level: number): number {
  return Math.min(5, Math.floor(level / 5));
}

/** True when `count` substats is right for the level, or ends where the Echo Skill heading shows. */
function substatCountFits(count: number, level: number, echoSkillRow: number | null): boolean {
  const expected = expectedSubstatCount(level);
  return count === expected || (count < expected && echoSkillRow === count);
}

function substatsOf(mapped: MappedEcho): { type: string; value: number; slot: number }[] {
  const out: { type: string; value: number; slot: number }[] = [];
  for (let i = 1; i <= 5; i++) {
    const type = mapped[`echoSubStatsType${i}` as keyof MappedEcho] as string | null;
    const value = mapped[`echoSubStatsValue${i}` as keyof MappedEcho] as number | null;
    if (type && value !== null && value > 0) out.push({ type, value, slot: i - 1 });
  }
  return out;
}

/**
 * Converts one candidate. Returns null if the echo itself is unknown (the file requires
 * a registry key). Unknown set / main stat / level are exported as null and listed in
 * `lowConfidence` so the web app asks the user to check them.
 *
 * Rarity is worked out from the panel's numbers (`echoRank.ts`); it's null when they
 * don't pin it down.
 *
 * `substats` is flagged when the count doesn't match the level. Otherwise a row the OCR
 * missed would silently import as an echo with fewer substats (Windows OCR drops a lone
 * "HP" label, found by the fixture replay on 2026-10-07). Fewer is fine only when the
 * "Echo Skill" heading is the very next row: the level unlocked a slot that wasn't tuned,
 * so the game shows nothing there (Spearback +5 with no substats, 2026-10-09 report).
 */
export function toScanEcho(candidate: EchoCandidate, scanIndex: number): ScanEcho | null {
  const [mapped] = mapParsedEchoes([candidate.slot], false);
  const cost = Number(candidate.slot.cost);
  if (!mapped?.echo || !COSTS.has(cost)) return null;

  const substats = substatsOf(mapped);
  const low = new Set<string>();
  const c = candidate.confidence;
  if (c.name === "low") low.add("echo");
  if (c.cost === "low") low.add("cost");
  if (c.mainStat === "low" || !mapped.stat) low.add("stat");
  if (c.set === "low" || !mapped.echoSet) low.add("echoSet");
  if (c.level === "low" || candidate.level === null) low.add("level");
  if (c.rank === "low" || candidate.rank === null) low.add("rank");
  if (candidate.level !== null && !substatCountFits(substats.length, candidate.level, candidate.echoSkillRow)) {
    low.add("substats");
  }
  substats.forEach((s, i) => {
    if (c.substats[s.slot] === "low") low.add(`substats.${i}.value`);
  });

  const echo: ScanEcho = {
    scanId: `scan-echo-${scanIndex}`,
    echo: mapped.echo,
    echoSet: mapped.echoSet ?? null,
    cost: cost as 1 | 3 | 4,
    rank: candidate.rank,
    level: candidate.level,
    stat: mapped.stat,
    substats: substats.map(({ type, value }) => ({ type, value })),
    equippedBy: null,
  };
  if (low.size > 0) echo.lowConfidence = [...low];
  return echo;
}

export function buildScan(candidates: EchoCandidate[], meta: ScanMeta): BuiltScan {
  const echoes: ScanEcho[] = [];
  let skippedUnknown = 0;
  for (const candidate of candidates) {
    const echo = toScanEcho(candidate, echoes.length + 1);
    if (echo) echoes.push(echo);
    else skippedUnknown += 1;
  }
  return {
    scan: {
      format: "WutheringToolsScan",
      version: 1,
      meta: {
        scannerVersion: meta.scannerVersion,
        scannedAt: (meta.scannedAt ?? new Date()).toISOString(),
        platform: meta.platform,
        resolution: meta.resolution,
        language: "en",
        mode: meta.mode,
      },
      echoes,
    },
    skippedUnknown,
  };
}
