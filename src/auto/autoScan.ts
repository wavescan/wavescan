import type { FrameSize } from "@wutheringtools/scanner-core";
import type { AutoModeStatus, FracPoint, FracRect, RegionRead, RegionText } from "@/ipc/types";
import { extractEcho, type ExtractedEcho } from "@/session/echoExtract";
import { echoReadRegions } from "@/session/echoRegions";
import type { PanelSamples } from "@/session/panelSamples";
import {
  createNavigator,
  type GridPosition,
  type NavigatorEcho,
  type NavigatorProgress,
  type NavigatorResult,
  type NavigatorStop,
} from "./navigator";

// One auto-mode scan from start to finish (roadmap Phase 2): start capturing, arm auto mode
// with the phrase the user typed, bring the game to the front, run the navigator, and then
// always disarm and stop capturing, however the run ended. The UI (ScanView) only shows
// what this reports. Kept separate from the view so every path is unit-tested.

/** Capture rate during an auto scan: the navigator waits on new frames, so faster is quicker. */
export const AUTO_FPS = 60;
/** Time for the game to come to the front after focusing (same as the Diagnostics click test). */
export const FOCUS_SETTLE_MS = 600;
/** How long to wait for the first captured frame. */
export const FIRST_FRAME_TIMEOUT_MS = 2000;
const FIRST_FRAME_POLL_MS = 100;

/** Why a scan ended: a navigator reason, or "not-started" if it never got as far as clicking. */
export type AutoScanStop = NavigatorStop | "not-started";

export interface AutoScanResult extends NavigatorProgress {
  reason: AutoScanStop;
  /** Plain-language explanation for the UI. */
  detail: string;
}

/** What an auto scan needs from the app (the IPC commands in the app, fakes in tests). */
export interface AutoScanDeps<Echo extends NavigatorEcho> {
  startCapture(maxFps: number): Promise<unknown>;
  stopCapture(): Promise<unknown>;
  /** Size of the latest captured frame, or null before the first one. */
  frameSize(): Promise<FrameSize | null>;
  arm(phrase: string): Promise<AutoModeStatus>;
  focusGame(): Promise<unknown>;
  disarm(): Promise<unknown>;
  click(target: FracPoint): Promise<unknown>;
  scroll(target: FracPoint, ticks: number): Promise<unknown>;
  sampleRegions(regions: FracRect[], maxWidth: number): Promise<ArrayBuffer>;
  /** Reads the echo in frame `seq` of a `frame`-sized capture (see `readEchoWith`). */
  readEcho(seq: number, frame: FrameSize, samples: PanelSamples): Promise<Echo>;
  sleep(ms: number): Promise<void>;
  now(): number;
  errorMessage(error: unknown): string;
}

export interface AutoScanOptions {
  /** The confirmation the user typed (checked again by Rust). */
  phrase: string;
  /** Stop at the first echo below this level. 0 reads everything. */
  minLevel: number;
}

export interface AutoScanCallbacks<Echo> {
  /** Auto mode is armed and the game is in front; `stopKeyActive` says whether F8 works. */
  onStarted?(info: { stopKeyActive: boolean; frame: FrameSize }): void;
  onEcho(echo: Echo, position: GridPosition): void;
  onProgress?(progress: NavigatorProgress): void;
}

/** `readEcho` for the app: OCR the echo regions of the pinned frame and extract the echo. */
export function readEchoWith(readRegions: (seq: number, regions: RegionRead[]) => Promise<RegionText[]>) {
  return async (seq: number, frame: FrameSize, samples: PanelSamples): Promise<ExtractedEcho> =>
    extractEcho(await readRegions(seq, echoReadRegions(frame)), samples);
}

const EMPTY: NavigatorProgress = { echoes: 0, unchanged: 0, errors: 0, row: 0 };

/** Creates a scan. Call `run()` once; `stop()` ends it after the current action. */
export function createAutoScan<Echo extends NavigatorEcho>(
  deps: AutoScanDeps<Echo>,
  options: AutoScanOptions,
  callbacks: AutoScanCallbacks<Echo>,
) {
  let stopRequested = false;
  let navigator: { stop(): void } | null = null;

  const notStarted = (detail: string): AutoScanResult => ({ ...EMPTY, reason: "not-started", detail });

  async function waitForFrame(): Promise<FrameSize | null> {
    const started = deps.now();
    for (;;) {
      const frame = await deps.frameSize();
      if (frame && frame.width > 0 && frame.height > 0) return frame;
      if (deps.now() - started > FIRST_FRAME_TIMEOUT_MS) return null;
      await deps.sleep(FIRST_FRAME_POLL_MS);
    }
  }

  async function run(): Promise<AutoScanResult> {
    let armed = false;
    try {
      await deps.startCapture(AUTO_FPS);
      const frame = await waitForFrame();
      if (!frame) return notStarted("No picture from the game yet. Is it minimised?");
      if (stopRequested) return notStarted("Stopped before the scan started.");

      const status = await deps.arm(options.phrase);
      armed = true;
      await deps.focusGame();
      await deps.sleep(FOCUS_SETTLE_MS);
      if (stopRequested) return notStarted("Stopped before the scan started.");
      callbacks.onStarted?.({ stopKeyActive: status.stop_key_active, frame });

      const nav = createNavigator<Echo>(
        {
          frameSize: () => frame,
          sampleRegions: deps.sampleRegions,
          readEcho: (seq, samples) => deps.readEcho(seq, frame, samples),
          click: deps.click,
          scroll: deps.scroll,
          sleep: deps.sleep,
          now: deps.now,
          errorMessage: deps.errorMessage,
          onEcho: callbacks.onEcho,
          onProgress: callbacks.onProgress,
        },
        { minLevel: options.minLevel },
      );
      navigator = nav;
      if (stopRequested) nav.stop();
      const result: NavigatorResult = await nav.run();
      return result;
    } catch (error) {
      // Arming (wrong phrase), focusing or capture failed before any echo was read.
      return notStarted(deps.errorMessage(error));
    } finally {
      navigator = null;
      if (armed) await deps.disarm().catch(() => undefined);
      await deps.stopCapture().catch(() => undefined);
    }
  }

  return {
    run,
    /** Ends the scan after the current action. Everything read so far is kept. */
    stop() {
      stopRequested = true;
      navigator?.stop();
    },
  };
}
