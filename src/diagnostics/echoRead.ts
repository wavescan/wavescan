import type { FrameSize } from "@wutheringtools/scanner-core";
import type { FracRect, RegionRead, RegionText } from "@/ipc/types";
import { echoReadRegions, fingerprintRegions } from "@/session/echoRegions";
import { extractEcho } from "@/session/echoExtract";
import { decodeSamples } from "@/session/samples";
import { toScanEcho, type ScanEcho } from "@/session/exportScan";

// Reads the selected echo exactly the way a scan does (same regions, same parsing) so a
// pasted diagnostics report shows what each box read and what the scanner made of it.
// Text only: no images, and every region is outside the User ID (Rust refuses otherwise).

export interface EchoReadDeps {
  sampleRegions(regions: FracRect[], maxWidth: number): Promise<ArrayBuffer>;
  readRegions(seq: number, regions: RegionRead[]): Promise<RegionText[]>;
}

export interface EchoRead {
  /** OCR lines per scanner region (name, level, mainStat, …), in reading order of the API. */
  regions: Record<string, string[]>;
  /** Slowest region, in milliseconds. */
  ms: number;
  /** The echo as it would be exported, or null if the echo couldn't be identified. */
  echo: ScanEcho | null;
}

/** Smallest sample that still pins a frame; the pixels aren't used. */
const PIN_SAMPLE_WIDTH = 8;

export async function readEchoForDiagnostics(deps: EchoReadDeps, frame: FrameSize): Promise<EchoRead> {
  // Sampling pins the frame, so every region is read from the same picture.
  const { seq } = decodeSamples(await deps.sampleRegions(fingerprintRegions(frame), PIN_SAMPLE_WIDTH));
  const results = await deps.readRegions(seq, echoReadRegions(frame));
  const extracted = extractEcho(results);
  return {
    regions: Object.fromEntries(results.map((r) => [r.id, r.lines.map((l) => l.text)])),
    ms: Math.round(Math.max(0, ...results.map((r) => r.elapsed_ms))),
    echo: toScanEcho({ ...extracted, id: "diagnostics", index: 1 }, 1),
  };
}

/** One-line summary for the checks list, e.g. "WhiffWhaff +0, 2★, main stat HP". */
export function describeEchoRead(read: EchoRead): string {
  const echo = read.echo;
  if (!echo) return `Couldn't identify the echo (name read as "${(read.regions.name ?? []).join(" ")}")`;
  const summary = `${echo.echo} +${echo.level ?? "?"}, ${echo.rank ? `${echo.rank}★` : "rarity ?"}, main stat ${
    echo.stat ?? "?"
  }`;
  const unsure = uncertainFields(read);
  return unsure.length ? `${summary}. Unsure: ${unsure.join(", ")}` : summary;
}

/**
 * Fields the scanner wasn't sure about, ignoring the set: it can't be read until set-icon
 * matching lands, so it would make every report look like a failure.
 */
export function uncertainFields(read: EchoRead): string[] {
  return (read.echo?.lowConfidence ?? []).filter((field) => field !== "echoSet");
}
