import type { AppInfo } from "@/ipc/types";
import type { GameDataInfo } from "@/data/scannerData";
import type { EchoCandidate } from "@/session/echoSession";
import { displayName, fieldLabel, rawReading, type FieldId } from "@/review/fields";
import { REPO_URL } from "./links";

// Writes the text of a bug report and the GitHub "new issue" link that carries it. The user
// sees the exact text before anything leaves the app, and GitHub only posts it when they
// press Submit there. Text only: no pictures, no User ID (never read), no file paths.

export type ReportKind = "misread" | "auto" | "game" | "idea";

export const REPORT_KINDS: { kind: ReportKind; label: string; hint: string }[] = [
  { kind: "misread", label: "A value was read wrong", hint: "Includes what Wavescan read for that echo" },
  { kind: "auto", label: "Auto mode got stuck", hint: "Includes how the last auto scan ended" },
  { kind: "game", label: "Can't find or read the game", hint: "Paste the Diagnostics report too" },
  { kind: "idea", label: "Idea or something else", hint: "Tell us what would help" },
];

export interface ReportContext {
  app: AppInfo | null;
  gameData: GameDataInfo | null;
  /** Game frame size, when known. */
  resolution: { width: number; height: number } | null;
  /** Which engine reads text ("Tesseract", "Vision"). */
  reader: string;
  /** Scan mode the echoes came from. */
  mode: "watch" | "auto";
  /** The misread echo and field, for "misread". */
  echo?: { candidate: EchoCandidate; field: FieldId | null } | null;
  /** How the last auto scan ended (its message), for "auto". */
  autoResult?: string | null;
  /** What the user typed. */
  note: string;
  includeSetup: boolean;
}

const TITLES: Record<ReportKind, string> = {
  misread: "Misread",
  auto: "Auto mode",
  game: "Game not found or not read",
  idea: "Idea",
};

/** A short issue title, e.g. "Misread: Crit. DMG on Impermanence Heron". */
export function reportTitle(kind: ReportKind, context: ReportContext): string {
  const echo = context.echo;
  if (kind === "misread" && echo) {
    const what = echo.field ? fieldLabel(echo.candidate, echo.field).replace(" (substat)", "") : "a value";
    return `${TITLES.misread}: ${what} on ${displayName(echo.candidate)}`;
  }
  return `${TITLES[kind]}: `;
}

function echoSection(candidate: EchoCandidate, field: FieldId | null): string[] {
  const lines = [
    "### Echo",
    `Scan #${candidate.index} · ${displayName(candidate)} +${candidate.level ?? "?"}`,
    `Read as name: "${candidate.raw.name}" · level: "${candidate.raw.level}"`,
    `Main stat: "${candidate.raw.mainStat}" · second stat: "${candidate.raw.secondaryStat}"`,
    `Substats as understood: ${candidate.slot.substats.map((s) => `${s.subStat} ${s.subStatValue}`.trim()).join(" | ") || "none"}`,
  ];
  if (field) {
    const raw = rawReading(candidate, field);
    lines.push(`Field: ${fieldLabel(candidate, field)}${raw ? ` · read as "${raw}"` : ""}`);
  }
  return lines;
}

function setupSection(context: ReportContext): string[] {
  const app = context.app;
  const size = context.resolution && context.resolution.width > 0
    ? `${context.resolution.width}×${context.resolution.height}`
    : "unknown";
  return [
    "### Setup",
    `Wavescan ${app?.version ?? "?"}${app?.build ? ` (build ${app.build})` : " (local build)"} · ${app?.platform ?? "?"}`,
    `Game size: ${size} · reader: ${context.reader} · mode: ${context.mode}`,
    `Game data: ${context.gameData ? `${context.gameData.hash.slice(0, 8)} (${context.gameData.echoes} echoes)` : "?"}`,
  ];
}

/** The full report text, exactly as it will appear in the issue. */
export function reportBody(kind: ReportKind, context: ReportContext): string {
  const sections: string[][] = [];
  const note = context.note.trim();
  sections.push(["### What happened", note || "_(describe what you expected and what you saw)_"]);
  if (kind === "misread" && context.echo) sections.push(echoSection(context.echo.candidate, context.echo.field));
  if (kind === "auto" && context.autoResult) sections.push(["### How the auto scan ended", context.autoResult]);
  if (kind === "game") {
    sections.push(["### Diagnostics", "_(Run Diagnostics, press Copy report and paste it here)_"]);
  }
  if (context.includeSetup) sections.push(setupSection(context));
  return sections.map((s) => s.join("\n")).join("\n\n");
}

/**
 * Longest body put in the link. Browsers and GitHub cut very long URLs, so a longer report
 * is shortened in the link, and the full text is on the clipboard to paste instead.
 */
export const MAX_URL_BODY = 6000;

/** The GitHub "new issue" link with the title and body filled in. */
export function newIssueUrl(title: string, body: string): { url: string; truncated: boolean } {
  const truncated = body.length > MAX_URL_BODY;
  const text = truncated
    ? `${body.slice(0, MAX_URL_BODY)}\n\n_(cut short: paste the full report from your clipboard)_`
    : body;
  const params = new URLSearchParams({ title, body: text });
  return { url: `${REPO_URL}/issues/new?${params.toString()}`, truncated };
}
