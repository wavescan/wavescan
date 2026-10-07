import type { FrameSize } from "@wutheringtools/scanner-core";
import type { FracRect, RegionRead, RegionText } from "@/ipc/types";
import { echoReadRegions, fingerprintRegions } from "@/session/echoRegions";
import { extractEcho } from "@/session/echoExtract";
import { decodeSamples } from "@/session/samples";
import { setIconSearchRegion } from "@/session/setIcon";
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
  /** Set-icon match score per candidate set, when the icon had to be matched. */
  setScores: Record<string, number> | null;
}

/** Same sample width as a scan, so the set icon is matched from the same detail. */
const SAMPLE_WIDTH = 128;

export async function readEchoForDiagnostics(deps: EchoReadDeps, frame: FrameSize): Promise<EchoRead> {
  // Sampling pins the frame, so every region is read from the same picture. The set icon
  // is sampled with it (its pixels are only compared, never stored or reported).
  const regions = [...fingerprintRegions(frame), setIconSearchRegion(frame)];
  const { seq, images } = decodeSamples(await deps.sampleRegions(regions, SAMPLE_WIDTH));
  const results = await deps.readRegions(seq, echoReadRegions(frame));
  const extracted = extractEcho(results, images[2]);
  return {
    regions: Object.fromEntries(results.map((r) => [r.id, r.lines.map((l) => l.text)])),
    ms: Math.round(Math.max(0, ...results.map((r) => r.elapsed_ms))),
    echo: toScanEcho({ ...extracted, id: "diagnostics", index: 1 }, 1),
    setScores: extracted.setScores,
  };
}

/** One-line summary for the checks list, e.g. "WhiffWhaff +0, 2★, main stat HP". */
export function describeEchoRead(read: EchoRead): string {
  const echo = read.echo;
  if (!echo) return `Couldn't identify the echo (name read as "${(read.regions.name ?? []).join(" ")}")`;
  const summary = `${echo.echo} +${echo.level ?? "?"}, ${echo.rank ? `${echo.rank}★` : "rarity ?"}, main stat ${
    echo.stat ?? "?"
  }, set ${echo.echoSet ?? "?"}`;
  const unsure = uncertainFields(read);
  return unsure.length ? `${summary}. Unsure: ${unsure.join(", ")}` : summary;
}

/** Fields the scanner wasn't sure about. */
export function uncertainFields(read: EchoRead): string[] {
  return read.echo?.lowConfidence ?? [];
}
