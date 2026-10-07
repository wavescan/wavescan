import {
  computeSignature,
  parseEchoCandidate,
  parseStatRow,
  resolveEchoByNameAndCost,
  scannerGameData,
  type FieldConfidence,
  type ParsedEchoSlot,
} from "@wutheringtools/scanner-core";
import type { RegionText } from "@/ipc/types";
import type { EchoRegionId } from "./echoRegions";
import { inferRank, statNumber } from "./echoRank";
import { readingOrder } from "./ocrText";
import { toCoreLines } from "./samples";

/** One echo read from the screen, with per-field confidence. */
export interface ExtractedEcho {
  slot: ParsedEchoSlot;
  confidence: {
    name: FieldConfidence;
    cost: FieldConfidence;
    mainStat: FieldConfidence;
    set: FieldConfidence;
    substats: FieldConfidence[];
    level: FieldConfidence;
    rank: FieldConfidence;
  };
  /** 0–25, or null if it couldn't be read. */
  level: number | null;
  /** Rarity 2–5 (see `echoRank.ts`), or null if the numbers don't pin it down. */
  rank: number | null;
  /** Dedupe signature (scanner-core `computeSignature`, plus level and rarity). */
  signature: string;
  /** Raw OCR text, kept to explain low-confidence fields in the review UI. */
  raw: { name: string; level: string; mainStat: string; secondaryStat: string };
}

/** Reads "+25" style level text. Null unless it's a clean 0–25. */
export function parseLevel(text: string): number | null {
  const match = /\+\s*(\d{1,2})\b/.exec(text);
  if (!match?.[1]) return null;
  const level = Number(match[1]);
  return level >= 0 && level <= 25 ? level : null;
}

/**
 * Turns the OCR results for one echo panel into an echo, using scanner-core for every
 * game-specific decision (name matching, cost, stat parsing, substat validation).
 *
 * Set: taken directly when the identified echo can only belong to one set. Otherwise
 * it's left null (low confidence) until set-icon matching lands.
 */
export function extractEcho(results: RegionText[]): ExtractedEcho {
  const byId = new Map(results.map((r) => [r.id as EchoRegionId, r]));
  const text = (id: EchoRegionId, joiner = " ") =>
    readingOrder(byId.get(id)?.lines ?? [])
      .map((l) => l.text)
      .join(joiner)
      .trim();

  const nameText = text("name");
  const levelText = text("level");
  const mainStatText = text("mainStat");
  const secondaryStatText = text("secondaryStat");

  const identity = resolveEchoByNameAndCost(nameText, secondaryStatText);
  const matchedSet = identity.candidateSets.length === 1 ? (identity.candidateSets[0] ?? null) : null;

  const parsed = parseEchoCandidate({
    nameText,
    mainStatText,
    secondaryStatText,
    substatLabelLines: toCoreLines(byId.get("substatLabels")?.lines ?? []),
    substatValueLines: toCoreLines(byId.get("substatValues")?.lines ?? []),
    substatBlockText: text("substatBlock", "\n"),
    matchedSet,
    preResolvedEcho: identity.echo,
  });

  const level = parseLevel(levelText);
  const mainStatLabel = parsed.slot.mainStatLabel;
  const { rank, confidence: rankConfidence } = inferRank({
    cost: parsed.slot.cost === null ? null : Number(parsed.slot.cost),
    level,
    secondaryValue: statNumber(parseStatRow(secondaryStatText)?.rawValue),
    mainStatKey: mainStatLabel ? (scannerGameData().verboseStatLabelMap[mainStatLabel] ?? null) : null,
    mainStatValue: statNumber(parseStatRow(mainStatText)?.rawValue),
  });
  return {
    slot: parsed.slot,
    confidence: {
      ...parsed.confidence,
      set: matchedSet ? parsed.confidence.set : "low",
      level: level === null ? "low" : "high",
      rank: rankConfidence,
    },
    level,
    rank,
    signature: `${computeSignature(parsed.slot)}|L${level ?? "?"}|R${rank ?? "?"}`,
    raw: { name: nameText, level: levelText, mainStat: mainStatText, secondaryStat: secondaryStatText },
  };
}
