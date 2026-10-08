import {
  PANEL_FINGERPRINT_GRID,
  STATS_FINGERPRINT_GRID,
  computeFingerprint,
  createStableFrameDetector,
  type FrameFingerprints,
  type FrameSize,
} from "@wutheringtools/scanner-core";
import type { FracPoint, FracRect } from "@/ipc/types";
import { panelSampleRegions, splitPanelSamples, type PanelSamples } from "@/session/panelSamples";
import { decodeSamples, type Sample } from "@/session/samples";
import {
  GRID_SAMPLE_WIDTH,
  SAME_ROW_DISTANCE,
  findRowEdges,
  gridLayout,
  rowSignature,
  signatureDistance,
  visibleRows,
  type GridLayout,
  type GridRow,
} from "./grid";

// Auto mode's navigator for Bag → Echoes (roadmap Phase 2): clicks every echo in the grid
// from the top, reads each one, scrolls, and stops at the end of the list or at the first
// echo below a minimum level. Sends input only through the injected `click` / `scroll`
// (the guarded auto-mode commands in the app), and never guesses where it is: if the grid
// can't be followed, it stops and says why. See docs/screens/echoes.md "Auto mode".
//
// Where it is in the list: one wheel notch moves the grid about 1/8 of a row (1920×1080
// recording), so each scroll is sized to move well under half a row. The move between two
// reads is then the only one that fits the row edges, even when rows look identical, and
// every row has a fixed number counted from the top of the list. The rows on screen before
// and after a scroll are also compared by their thumbnails as a check.

/** Why a run ended. */
export type NavigatorStop =
  /** Scrolled to the bottom and read every card. */
  | "end-of-list"
  /** Reached an echo below the minimum level (the list is sorted by level, highest first). */
  | "below-min-level"
  /** The user pressed Stop. */
  | "stopped"
  /** A click or scroll was refused: auto mode aborted (mouse moved, focus lost, cap reached) or the window is gone. */
  | "aborted"
  /** The game area isn't 16:10 or 16:9. */
  | "unsupported-shape"
  /** No echo grid on screen (not on Bag → Echoes, or a menu is open). */
  | "grid-not-found"
  /** The first row's clicks didn't change the details panel. */
  | "clicks-not-landing"
  /** The rows on screen after a scroll don't match where they should be. */
  | "lost-track";

/** Where an echo sits in the list: row counted from the top of the list, column 0-5. */
export interface GridPosition {
  row: number;
  column: number;
}

export interface NavigatorProgress {
  /** Echoes read and reported. */
  echoes: number;
  /** Clicks after which the panel didn't change (empty slots at the end of the list, mostly). */
  unchanged: number;
  /** Reads that failed (OCR error, or the panel never settled). */
  errors: number;
  /** The row being read, counted from the top of the list. */
  row: number;
}

export interface NavigatorResult extends NavigatorProgress {
  reason: NavigatorStop;
  /** Plain-language explanation for the UI. */
  detail: string;
}

export interface NavigatorOptions {
  /** Stop at the first echo below this level. 0 reads everything. */
  minLevel: number;
}

/** What the navigator needs from the outside world (real IPC in the app, a fake game in tests). */
export interface NavigatorDeps<Echo extends { level: number | null }> {
  /** Size of the captured game frame. */
  frameSize(): FrameSize;
  sampleRegions(regions: FracRect[], maxWidth: number): Promise<ArrayBuffer>;
  /** Reads the echo shown in frame `seq` (the frame the panel settled in), with that frame's pixel samples. */
  readEcho(seq: number, samples: PanelSamples): Promise<Echo>;
  /** Guarded auto-mode click. Rejects when auto mode aborts. */
  click(target: FracPoint): Promise<unknown>;
  /** Guarded auto-mode wheel scroll; negative `ticks` scroll down. Rejects when auto mode aborts. */
  scroll(target: FracPoint, ticks: number): Promise<unknown>;
  sleep(ms: number): Promise<void>;
  /** Milliseconds from any fixed point (`performance.now()` in the app). */
  now(): number;
  errorMessage(error: unknown): string;
  onEcho(echo: Echo, position: GridPosition): void;
  onProgress?(progress: NavigatorProgress): void;
}

/** Time between samples while waiting for the screen to change (about one frame at 60 fps). */
export const POLL_MS = 16;
/** After a click, how long the panel may keep showing the previous echo before the click counts as "unchanged". */
export const UNCHANGED_AFTER_MS = 700;
/** After a click, how long to wait for the panel to settle at all. */
export const PANEL_TIMEOUT_MS = 3000;
/** After a scroll, how long the grid may stay still before it counts as the end of the list. */
export const SCROLL_TIMEOUT_MS = 600;
/**
 * Wheel notches per scroll when going back to the top. Not a multiple of 8 (notches per row):
 * a move of exactly whole rows would leave the row edges where they were and look like the top.
 */
const TOP_TICKS = 37;
/** Longest wait for the grid to settle after it started moving. */
const SETTLE_TIMEOUT_MS = 3000;
/** Most scrolls to the top before giving up (3,000 echoes is 500 rows, 40 notches ≈ 5 rows). */
const MAX_TOP_SCROLLS = 150;
/** Each scroll moves at most this much of a row, so the move between two reads is never ambiguous. */
const STEP_ROWS = 0.4;
/** Most notches in one scroll, whatever the calibration says. */
const MAX_STEP_TICKS = 8;
/** A grid that moved less than this (frame fraction) didn't move. */
const NO_MOVE = 0.002;
/** A measured move above this much of a row means a step was too big to measure; stop rather than guess. */
const MAX_MEASURABLE_ROWS = 0.45;
/**
 * The least a notch is assumed to move, as a share of a row: 1/8 on a 1920×1080 recording
 * (26 px of a 211 px row). One notch there moved only 13 px, so calibrating from a single
 * small notch alone could make the next scroll too big.
 */
const NOMINAL_NOTCH_ROWS = 1 / 8;
/** Same tolerance as `onPitch` in grid.ts, for matching edges between two reads. */
const SAME_EDGE = 0.003;

/**
 * Most echo reads (OCR) running at once. A read starts as soon as its panel settles, and the
 * next card is clicked while it runs; when this many are still running, the next click waits
 * for the oldest. Rust keeps the last few sampled frames readable (`regions::PINNED_FRAMES`,
 * ADR 0025), and a read takes its frame as soon as it starts.
 */
export const MAX_READS_IN_FLIGHT = 2;

/** Fingerprint sample width (STATS_FINGERPRINT_GRID is 64 cells wide), as in watch mode. */
const PANEL_SAMPLE_WIDTH = 128;

function asImageData(sample: Sample): ImageData {
  // computeFingerprint only reads data/width/height.
  return { data: sample.rgba, width: sample.width, height: sample.height, colorSpace: "srgb" } as ImageData;
}

/** `x` wrapped into (-pitch/2, pitch/2]. */
function wrap(x: number, pitch: number): number {
  return x - pitch * Math.round(x / pitch);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * How far the grid moved up between two sets of row edges, assuming it moved less than half
 * a row: every edge pair's difference wrapped into one row pitch, then the median.
 */
export function measureMove(layout: GridLayout, before: readonly number[], after: readonly number[]): number {
  const moves: number[] = [];
  for (const b of before) for (const a of after) moves.push(wrap(b - a, layout.rowPitch));
  if (moves.length === 0) return 0;
  // Pairs of different rows wrap to roughly the same value as the true pair, so the median holds.
  return median(moves);
}

/** Why a run is ending, thrown inside `run` and turned into its result. */
interface StopSignal {
  navigatorStop: NavigatorStop;
  detail: string;
}

function stopWith(navigatorStop: NavigatorStop, detail: string): StopSignal {
  return { navigatorStop, detail };
}

function isStop(error: unknown): error is StopSignal {
  return typeof error === "object" && error !== null && "navigatorStop" in error;
}

function sameEdges(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((y, i) => Math.abs(y - b[i]!) <= SAME_EDGE);
}

/**
 * Creates a navigator. Call `run()` once (with auto mode armed and the game focused), and
 * `stop()` from the UI to end it after the current action. Everything read before a stop is
 * kept: it's already been passed to `onEcho`.
 */
export function createNavigator<Echo extends { level: number | null }>(
  deps: NavigatorDeps<Echo>,
  options: NavigatorOptions,
) {
  const progress: NavigatorProgress = { echoes: 0, unchanged: 0, errors: 0, row: 0 };
  let stopRequested = false;

  const publish = () => deps.onProgress?.({ ...progress });

  function checkStop() {
    if (stopRequested) throw stopWith("stopped", "Stopped. Everything read so far is kept.");
  }

  /** Runs a guarded input action; a rejection means auto mode aborted. */
  async function act(action: () => Promise<unknown>) {
    checkStop();
    try {
      await action();
    } catch (error) {
      throw stopWith("aborted", `Auto mode stopped: ${deps.errorMessage(error)}. Everything read so far is kept.`);
    }
  }

  async function sampleGrid(layout: GridLayout): Promise<{ seq: number; sample: Sample }> {
    const samples = decodeSamples(await deps.sampleRegions([layout.strip], GRID_SAMPLE_WIDTH));
    const sample = samples.images[0];
    if (!sample) throw stopWith("grid-not-found", "Couldn't sample the echo grid.");
    return { seq: samples.seq, sample };
  }

  /**
   * Waits for the grid to move after a scroll and settle (the same edges in two frames).
   * Returns the settled sample, or the unchanged one after SCROLL_TIMEOUT_MS.
   */
  async function waitForGrid(layout: GridLayout, before: readonly number[]) {
    const started = deps.now();
    let last = await sampleGrid(layout);
    let lastEdges = findRowEdges(layout, last.sample);
    let moved = !sameEdges(lastEdges, before);
    for (;;) {
      if (!moved && deps.now() - started > SCROLL_TIMEOUT_MS) return { ...last, edges: lastEdges };
      if (deps.now() - started > SETTLE_TIMEOUT_MS) {
        throw stopWith("lost-track", "The echo grid didn't settle after scrolling.");
      }
      await deps.sleep(POLL_MS);
      const next = await sampleGrid(layout);
      if (next.seq === last.seq) continue;
      const edges = findRowEdges(layout, next.sample);
      if (moved && sameEdges(edges, lastEdges)) return { ...next, edges };
      if (!sameEdges(edges, before)) moved = true;
      last = next;
      lastEdges = edges;
    }
  }

  async function samplePanel(frame: FrameSize) {
    const samples = decodeSamples(await deps.sampleRegions(panelSampleRegions(frame), PANEL_SAMPLE_WIDTH));
    const { panel, stats, extras } = splitPanelSamples(samples.images);
    if (!panel || !stats) return null;
    const fingerprints: FrameFingerprints = {
      panel: computeFingerprint(asImageData(panel), PANEL_FINGERPRINT_GRID),
      stats: computeFingerprint(asImageData(stats), STATS_FINGERPRINT_GRID),
    };
    return { seq: samples.seq, fingerprints, extras };
  }

  /**
   * Compares each panel with the one shown just before it only (no history of earlier
   * echoes). Every click here is a different card, so "seen before" only has to mean "the
   * click didn't change the panel". With history on, an echo that looked like any earlier
   * one was skipped: the same echo and main stat at +0 in another set differs only by its
   * small set icon (2026-10-08 report). Watch mode keeps the history, because there the
   * user can go back to an echo already read.
   */
  const detector = createStableFrameDetector({ historySize: 0 });
  /**
   * True until the first click is done. The echo selected before the run starts is marked as
   * seen (`primePanel`), so a stale panel can't be read for the first card. If the first click
   * then leaves the panel as it was, that echo *is* the first card (the game selects it when
   * the screen opens), so it's read after all. Otherwise it's forgotten again, so it's read
   * when the scan reaches its card.
   */
  let firstClick = true;

  /** Marks the echo shown before the run as seen. */
  async function primePanel(frame: FrameSize) {
    const started = deps.now();
    while (deps.now() - started <= PANEL_TIMEOUT_MS) {
      const panel = await samplePanel(frame);
      if (panel && detector.observe(panel.fingerprints) === "stable-novel") {
        detector.commitScan(panel.fingerprints);
        return;
      }
      await deps.sleep(POLL_MS);
    }
  }

  /**
   * Clicks one card and waits for the panel to settle on an echo it hasn't shown yet.
   * Returns the frame to read, "unchanged" if the panel kept showing an echo already read
   * (an empty slot, or the click didn't land), or "unsettled".
   */
  async function clickAndWait(frame: FrameSize, target: FracPoint) {
    await act(() => deps.click(target));
    const first = firstClick;
    firstClick = false;
    const started = deps.now();
    for (;;) {
      checkStop();
      const panel = await samplePanel(frame);
      if (panel) {
        const event = detector.observe(panel.fingerprints);
        if (event === "stable-novel") {
          // After the first click, forget the primed echo: it's somewhere further down the
          // list, and has to look new when the scan gets there.
          if (first) detector.reset();
          detector.commitScan(panel.fingerprints);
          return panel;
        }
        if (event === "stable-repeat" && deps.now() - started > UNCHANGED_AFTER_MS) {
          return first ? panel : ("unchanged" as const);
        }
      }
      if (deps.now() - started > PANEL_TIMEOUT_MS) return "unsettled" as const;
      await deps.sleep(POLL_MS);
    }
  }

  /** Set by a read that found an echo below the minimum level; ends the run. */
  let belowMin: StopSignal | null = null;
  /** Reads not reported yet, oldest first. */
  const inFlight: Promise<void>[] = [];
  /** The last read's report, so results are reported in list order. */
  let reported: Promise<void> = Promise.resolve();

  /**
   * Starts reading the echo in frame `seq` without waiting for it. Results are reported in
   * the order the reads started. Once one is below the minimum level, it and every later one
   * are dropped and the run ends at the next check.
   */
  function startRead(seq: number, extras: PanelSamples, position: GridPosition) {
    // Called now, so Rust takes the frame while it's still pinned.
    const read = deps.readEcho(seq, extras).then(
      (echo) => ({ echo }),
      () => ({ echo: null }),
    );
    const report = reported.then(async () => {
      const { echo } = await read;
      if (belowMin) return;
      if (!echo) {
        progress.errors += 1;
      } else if (echo.level !== null && echo.level < options.minLevel) {
        belowMin = stopWith(
          "below-min-level",
          `Reached an echo at +${echo.level}, below the minimum of +${options.minLevel}. Done.`,
        );
        return;
      } else {
        progress.echoes += 1;
        deps.onEcho(echo, position);
      }
      publish();
    });
    reported = report;
    inFlight.push(report);
  }

  /** Throws the below-minimum stop once a read has found one. */
  function checkBelowMin() {
    if (belowMin) throw belowMin;
  }

  /** Waits until fewer than MAX_READS_IN_FLIGHT reads are running. */
  async function makeRoomForRead() {
    while (inFlight.length >= MAX_READS_IN_FLIGHT) await inFlight.shift();
  }

  /** Waits for every read to be reported (before the run returns, however it ends). */
  async function finishReads() {
    while (inFlight.length > 0) await inFlight.shift();
  }

  /**
   * Clicks one row's cards, left to right, starting a read for each new panel. Returns how
   * many clicks showed a new echo. Throws the below-minimum stop as soon as a read finds one.
   */
  async function readRow(frame: FrameSize, row: GridRow, rowNumber: number): Promise<number> {
    progress.row = rowNumber;
    let shown = 0;
    for (const { column, point } of row.targets) {
      checkBelowMin();
      await makeRoomForRead();
      checkBelowMin();
      const panel = await clickAndWait(frame, point);
      if (panel === "unchanged") {
        progress.unchanged += 1;
      } else if (panel === "unsettled") {
        progress.errors += 1;
      } else {
        shown += 1;
        startRead(panel.seq, panel.extras, { row: rowNumber, column });
      }
      publish();
    }
    return shown;
  }

  /** Thumbnails of every visible row, to tell two reads with the same row edges apart. */
  function thumbnails(layout: GridLayout, sample: Sample): number[][] {
    return visibleRows(layout, sample).map((row) => rowSignature(layout, sample, row));
  }

  /** Scrolls up until the grid stops moving. */
  async function scrollToTop(layout: GridLayout, point: FracPoint) {
    let sample = (await sampleGrid(layout)).sample;
    let edges = findRowEdges(layout, sample);
    for (let i = 0; i < MAX_TOP_SCROLLS; i++) {
      await act(() => deps.scroll(point, TOP_TICKS));
      const settled = await waitForGrid(layout, edges);
      const before = thumbnails(layout, sample);
      const after = thumbnails(layout, settled.sample);
      const same =
        sameEdges(settled.edges, edges) &&
        before.length === after.length &&
        before.every((t, j) => signatureDistance(t, after[j]!) < SAME_ROW_DISTANCE);
      if (same) return settled;
      sample = settled.sample;
      edges = settled.edges;
    }
    throw stopWith("lost-track", "Couldn't scroll to the top of the echo list.");
  }

  async function run(): Promise<NavigatorResult> {
    try {
      const frame = deps.frameSize();
      const layout = gridLayout(frame);
      if (!layout) {
        throw stopWith(
          "unsupported-shape",
          `Auto mode supports 16:9 and 16:10 game windows; this one is ${frame.width}×${frame.height}.`,
        );
      }
      // Scroll with the cursor over the middle of the grid.
      const wheelPoint: FracPoint = { x: layout.strip.x + layout.strip.width / 2, y: layout.strip.y + layout.strip.height / 2 };

      let current = await scrollToTop(layout, wheelPoint);
      await primePanel(frame);
      let rows = visibleRows(layout, current.sample);
      const origin = rows[0]?.barTop;
      if (origin === undefined) throw stopWith("grid-not-found", "No echo grid on screen. Open Bag → Echoes first.");

      /** How far the grid has scrolled since the top (frame fraction). */
      let scrolled = 0;
      /** Highest row number read so far. */
      let done = -1;
      /** Calibrated grid move per wheel notch. */
      let perTick = layout.rowPitch * NOMINAL_NOTCH_ROWS;
      const rowNumber = (barTop: number) => Math.round((barTop + scrolled - origin) / layout.rowPitch);

      for (;;) {
        for (const row of rows) {
          const number = rowNumber(row.barTop);
          if (number <= done) continue;
          const shown = await readRow(frame, row, number);
          done = number;
          if (number === 0 && shown < 2 && row.targets.length > 1 && progress.unchanged > 0) {
            throw stopWith(
              "clicks-not-landing",
              "Clicking the first row didn't change the echo details. On Windows, run Wavescan as administrator. " +
                "(Or the list has only one echo.)",
            );
          }
        }

        // Scroll until the first fully visible row is one we haven't read, or the grid can't
        // move any further. A grid that doesn't move after one scroll gets a second try, so
        // a slow frame can't end the run early.
        let stalls = 0;
        for (;;) {
          checkBelowMin();
          const signatures = new Map(rows.map((row) => [rowNumber(row.barTop), rowSignature(layout, current.sample, row)]));
          const ticks = Math.max(1, Math.min(MAX_STEP_TICKS, Math.floor((STEP_ROWS * layout.rowPitch) / perTick)));
          await act(() => deps.scroll(wheelPoint, -ticks));
          const next = await waitForGrid(layout, current.edges);
          const move = measureMove(layout, current.edges, next.edges);
          if (Math.abs(move) < NO_MOVE) {
            stalls += 1;
            if (stalls < 2) continue;
            // The end: read whatever is left on screen (a last row that only now fits).
            for (const row of rows) {
              const number = rowNumber(row.barTop);
              if (number > done) {
                await readRow(frame, row, number);
                done = number;
              }
            }
            await finishReads();
            checkBelowMin();
            publish();
            return { ...progress, reason: "end-of-list", detail: "Reached the end of the echo list." };
          }
          if (move < 0 || move > MAX_MEASURABLE_ROWS * layout.rowPitch) {
            throw stopWith("lost-track", "The echo grid moved further than expected. Stopped to avoid skipping echoes.");
          }
          stalls = 0;
          perTick = Math.max(perTick, move / ticks);
          scrolled += move;
          current = next;
          rows = visibleRows(layout, current.sample);
          if (rows.length === 0) {
            throw stopWith("lost-track", "The echo grid disappeared while scrolling. Stopped to avoid skipping echoes.");
          }
          for (const row of rows) {
            const before = signatures.get(rowNumber(row.barTop));
            if (before && signatureDistance(before, rowSignature(layout, current.sample, row)) >= SAME_ROW_DISTANCE) {
              throw stopWith("lost-track", "The echo grid didn't scroll the way it should. Stopped to avoid skipping echoes.");
            }
          }
          if (rowNumber(rows[0]!.barTop) > done) break;
        }
      }
    } catch (error) {
      await finishReads();
      publish();
      if (isStop(error)) return { ...progress, reason: error.navigatorStop, detail: error.detail };
      return { ...progress, reason: "aborted", detail: deps.errorMessage(error) };
    }
  }

  return {
    run,
    /** Ends the run after the current action. */
    stop() {
      stopRequested = true;
    },
    progress: () => ({ ...progress }),
  };
}

export type Navigator = ReturnType<typeof createNavigator>;
