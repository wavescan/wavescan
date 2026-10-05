import type { FracPoint } from "@/ipc/types";

// The auto-mode input spike (roadmap Phase 0): does a synthetic click actually reach the
// game? Windows drops input to an elevated game *silently*, so we check the effect: the
// echo details panel should change after clicking different grid cells.

/** The phrase that arms auto mode (must match `safety::CONFIRMATION_PHRASE` in Rust). */
export const CONFIRMATION_PHRASE = "I understand";

export type InputTestOutcome = "panel-changed" | "no-change" | "error";

export interface InputTestResult {
  outcome: InputTestOutcome;
  detail: string;
  clicks: number;
}

/** Everything the test needs, injected so it can be unit-tested without the game. */
export interface InputTestDeps {
  arm(phrase: string): Promise<unknown>;
  focusGame(): Promise<unknown>;
  click(target: FracPoint): Promise<unknown>;
  disarm(): Promise<unknown>;
  /** OCR text of the echo details panel. */
  readPanel(): Promise<string>;
  sleep(ms: number): Promise<void>;
  errorMessage(error: unknown): string;
}

/** Time for the game to come to the front after focusing. */
export const FOCUS_SETTLE_MS = 600;
/** Time for the panel to redraw after a click (measured redraw is one frame; this is generous). */
export const CLICK_SETTLE_MS = 400;

export async function runInputTest(
  deps: InputTestDeps,
  phrase: string,
  targets: readonly FracPoint[],
): Promise<InputTestResult> {
  let clicks = 0;
  try {
    await deps.arm(phrase);
    await deps.focusGame();
    await deps.sleep(FOCUS_SETTLE_MS);

    const seen = [await deps.readPanel()];
    for (const target of targets) {
      await deps.click(target);
      clicks += 1;
      await deps.sleep(CLICK_SETTLE_MS);
      seen.push(await deps.readPanel());
    }

    const changed = seen.some((text, i) => i > 0 && text !== seen[i - 1]);
    return changed
      ? { outcome: "panel-changed", detail: "The game responded to Wavescan's clicks.", clicks }
      : {
          outcome: "no-change",
          detail:
            "The echo details didn't change after clicking. If Wuthering Waves runs as " +
            "administrator, run Wavescan as administrator too. Also check you're on " +
            "Bag → Echoes with more than one echo.",
          clicks,
        };
  } catch (error) {
    return { outcome: "error", detail: deps.errorMessage(error), clicks };
  } finally {
    await deps.disarm().catch(() => undefined);
  }
}
