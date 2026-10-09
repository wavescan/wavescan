import {
  computeSignature,
  normalizeStatLabel,
  parseEchoCandidate,
  parseStatRow,
  resolveEchoByNameAndCost,
  scannerGameData,
  type FieldConfidence,
  type ParsedEchoSlot,
} from "@wutheringtools/scanner-core";
import type { RegionText } from "@/ipc/types";
import { SUBSTAT_ROW_IDS, type EchoRegionId } from "./echoRegions";
import { inferMainStatKey, inferRank, rowValue } from "./echoRank";
import { expectedSubstatCount } from "./exportScan";
import { readingOrder } from "./ocrText";
import { toCoreLines } from "./samples";
import { matchHpLabel } from "./hpLabel";
import type { PanelSamples } from "./panelSamples";
import { matchSetIcon } from "./setIcon";

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
  /** Set-icon match score per candidate set, when the icon had to be matched. */
  setScores: Record<string, number> | null;
  /**
   * Which substat row crop (0–4) shows the "Echo Skill" heading, or null if none does.
   * Only tuned substats are shown, so the heading marks where the list really ends.
   */
  echoSkillRow: number | null;
}

/** The panel's wording for a stat key ("HP" → "HP", "Electro" → "Electro DMG Bonus"). */
function labelForStatKey(key: string): string {
  const entry = Object.entries(scannerGameData().verboseStatLabelMap).find(([, k]) => k === key);
  return entry?.[0] ?? key;
}

/** Reads "+25" style level text. Null unless it's a clean 0–25. */
export function parseLevel(text: string): number | null {
  const match = /\+\s*(\d{1,2})\b/.exec(text);
  if (!match?.[1]) return null;
  const level = Number(match[1]);
  return level >= 0 && level <= 25 ? level : null;
}

/**
 * The five per-row substat crops' text for scanner-core's fallback pass, or undefined when
 * they weren't read. A row is passed as "" when it can't hold a substat (below the
 * echo's level, e.g. the Echo Skill text on a +0 echo) or doesn't read as a known stat:
 * scanner-core's `parseStatRow` falls back to its first label-and-number guess, so a line
 * of description like "dealing 80.96%" would otherwise count as a row.
 */
export function substatRowTexts(
  rowText: (id: EchoRegionId) => string | null,
  level: number | null,
): string[] | undefined {
  const texts = SUBSTAT_ROW_IDS.map(rowText);
  if (texts.every((t) => t === null)) return undefined;
  const rows = level === null ? SUBSTAT_ROW_IDS.length : expectedSubstatCount(level);
  return texts.map((text, i) => {
    if (!text || i >= rows) return "";
    const row = parseStatRow(text);
    return row && normalizeStatLabel(row.rawLabel) ? text : "";
  });
}

/** The "Echo Skill" heading under the stats, also when the crop cuts it to "ho Skill". */
const ECHO_SKILL_HEADING = /^\S{0,4}\s*skill$/i;

/**
 * Which of the five substat row crops shows the "Echo Skill" heading, or null when none
 * does (or they weren't read). Only tuned substats are shown, so on an echo levelled past
 * an unlock without tuning, the heading sits right after the last substat. The heading is
 * a line of its own; a stat such as "Resonance Skill DMG Bonus 8.6%" doesn't match.
 */
export function echoSkillRow(rowText: (id: EchoRegionId) => string | null): number | null {
  const index = SUBSTAT_ROW_IDS.findIndex((id) =>
    (rowText(id) ?? "").split("\n").some((l) => ECHO_SKILL_HEADING.test(l.trim())),
  );
  return index === -1 ? null : index;
}

/**
 * Turns the OCR results for one echo panel into an echo, using scanner-core for every
 * game-specific decision (name matching, cost, stat parsing, substat validation).
 *
 * Set: taken directly when the identified echo can only belong to one set. Otherwise it's
 * matched from `samples.setIcon` among the echo's possible sets, and left null (low
 * confidence) when no set clearly wins or there's no sample.
 *
 * Main stat: when OCR found no label (Windows OCR drops a lone "HP"), `samples.mainStatLabel`
 * is checked for an "HP" label (`matchHpLabel`): high confidence when the value also fits
 * HP at the read rarity and level, low otherwise. Failing that, the stat is worked out from
 * the value, cost, rarity and level (`inferMainStatKey`) and flagged low.
 */
export function extractEcho(results: RegionText[], samples: PanelSamples = {}): ExtractedEcho {
  const { setIcon, mainStatLabel: labelSample } = samples;
  const byId = new Map(results.map((r) => [r.id as EchoRegionId, r]));
  const text = (id: EchoRegionId, joiner = " ") =>
    readingOrder(byId.get(id)?.lines ?? [])
      .map((l) => l.text)
      .join(joiner)
      .trim();

  const nameText = text("name");
  const levelText = text("level");
  const level = parseLevel(levelText);
  const mainStatText = text("mainStat");
  const secondaryStatText = text("secondaryStat");

  const rowText = (id: EchoRegionId) => (byId.has(id) ? text(id, "\n") : null);

  const identity = resolveEchoByNameAndCost(nameText, secondaryStatText);
  const sets = identity.candidateSets;
  const iconMatch = sets.length > 1 && setIcon ? matchSetIcon(setIcon, sets) : null;
  const matchedSet = sets.length === 1 ? (sets[0] ?? null) : (iconMatch?.set ?? null);

  const parsed = parseEchoCandidate({
    nameText,
    mainStatText,
    secondaryStatText,
    substatLabelLines: toCoreLines(byId.get("substatLabels")?.lines ?? []),
    substatValueLines: toCoreLines(byId.get("substatValues")?.lines ?? []),
    substatTexts: substatRowTexts((id) => (byId.has(id) ? text(id, "\n") : null), level),
    substatBlockText: text("substatBlock", "\n"),
    matchedSet,
    preResolvedEcho: identity.echo,
  });

  const cost = parsed.slot.cost === null ? null : Number(parsed.slot.cost);
  const mainStatValue = rowValue(mainStatText);
  const rankInput = { cost, level, secondaryValue: rowValue(secondaryStatText), mainStatValue };

  let mainStatLabel = parsed.slot.mainStatLabel;
  let mainStatConfidence = parsed.confidence.mainStat;
  let mainStatKey = mainStatLabel ? (scannerGameData().verboseStatLabelMap[mainStatLabel] ?? null) : null;
  let rank = inferRank({ ...rankInput, mainStatKey });
  if (!mainStatLabel && labelSample && matchHpLabel(labelSample).hp) {
    mainStatKey = "HP";
    mainStatLabel = labelForStatKey(mainStatKey);
    rank = inferRank({ ...rankInput, mainStatKey });
    // High rank confidence with a main value read means that value fits HP at this rarity.
    mainStatConfidence = mainStatValue !== null && rank.confidence === "high" ? "high" : "low";
  }
  if (!mainStatLabel) {
    const inferred = inferMainStatKey({ cost, level, rank: rank.rank, value: mainStatValue });
    if (inferred) {
      mainStatKey = inferred;
      mainStatLabel = labelForStatKey(inferred);
      mainStatConfidence = "low";
      rank = inferRank({ ...rankInput, mainStatKey });
    }
  }
  const slot = { ...parsed.slot, mainStatLabel };
  return {
    slot,
    confidence: {
      ...parsed.confidence,
      mainStat: mainStatConfidence,
      set: matchedSet ? parsed.confidence.set : "low",
      level: level === null ? "low" : "high",
      rank: rank.confidence,
    },
    level,
    rank: rank.rank,
    signature: `${computeSignature(slot)}|L${level ?? "?"}|R${rank.rank ?? "?"}`,
    raw: { name: nameText, level: levelText, mainStat: mainStatText, secondaryStat: secondaryStatText },
    setScores: iconMatch?.scores ?? null,
    echoSkillRow: echoSkillRow(rowText),
  };
}
