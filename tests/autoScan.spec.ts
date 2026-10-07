import { describe, expect, it } from "vitest";
import { createAutoScan, type AutoScanDeps } from "@/auto/autoScan";
import type { AutoModeStatus } from "@/ipc/types";
import { createFakeGame, fakeEchoes, type FakeEcho } from "./support/fakeGame";

// An auto scan from start to finish against the pretend grid (tests/support/fakeGame.ts),
// with fake capture and auto-mode commands that record what was called. Whatever happens,
// auto mode must end disarmed and capture stopped.

const ARMED: AutoModeStatus = { state: "Armed", actions_used: 0, stop_key_active: true };

function setup(overrides: Partial<AutoScanDeps<FakeEcho>> = {}, count = 20) {
  const fake = createFakeGame({ echoes: fakeEchoes(count) });
  const calls: string[] = [];
  const deps: AutoScanDeps<FakeEcho> = {
    startCapture: async () => calls.push("startCapture"),
    stopCapture: async () => calls.push("stopCapture"),
    frameSize: async () => fake.deps.frameSize(),
    arm: async (phrase) => {
      calls.push(`arm:${phrase}`);
      if (phrase !== "I understand") throw new Error("the confirmation didn't match");
      return ARMED;
    },
    focusGame: async () => calls.push("focusGame"),
    disarm: async () => calls.push("disarm"),
    click: fake.deps.click,
    scroll: fake.deps.scroll,
    sampleRegions: fake.deps.sampleRegions,
    readEcho: (seq, _frame, setIcon) => fake.deps.readEcho(seq, setIcon),
    sleep: fake.deps.sleep,
    now: fake.deps.now,
    errorMessage: fake.deps.errorMessage,
    ...overrides,
  };
  return { fake, calls, deps };
}

async function runScan(deps: AutoScanDeps<FakeEcho>, phrase = "I understand", minLevel = 0) {
  const read: number[] = [];
  let started: boolean | null = null;
  const scan = createAutoScan(deps, { phrase, minLevel }, {
    onEcho: (echo) => read.push(echo.id),
    onStarted: ({ stopKeyActive }) => (started = stopKeyActive),
  });
  const result = await scan.run();
  return { result, read, started };
}

describe("auto scan", () => {
  it("arms, focuses the game, reads everything, then disarms and stops capturing", async () => {
    const { deps, calls } = setup();
    const { result, read, started } = await runScan(deps);
    expect(result.reason).toBe("end-of-list");
    expect(read).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(started).toBe(true);
    expect(calls).toEqual(["startCapture", "arm:I understand", "focusGame", "disarm", "stopCapture"]);
  });

  it("doesn't start (and never clicks) when the phrase is wrong", async () => {
    const { deps, calls, fake } = setup();
    const { result, read } = await runScan(deps, "i agree");
    expect(result.reason).toBe("not-started");
    expect(result.detail).toContain("confirmation");
    expect(read).toEqual([]);
    expect(fake.log.clicks).toHaveLength(0);
    expect(calls).not.toContain("disarm"); // never armed
    expect(calls.at(-1)).toBe("stopCapture");
  });

  it("doesn't arm when the game sends no picture", async () => {
    const { deps, calls } = setup({ frameSize: async () => null });
    const { result } = await runScan(deps);
    expect(result.reason).toBe("not-started");
    expect(calls).toEqual(["startCapture", "stopCapture"]);
  });

  it("disarms even when focusing the game fails", async () => {
    const { deps, calls, fake } = setup({
      focusGame: async () => {
        throw new Error("the game window is minimised");
      },
    });
    const { result } = await runScan(deps);
    expect(result.reason).toBe("not-started");
    expect(fake.log.clicks).toHaveLength(0);
    expect(calls.slice(-2)).toEqual(["disarm", "stopCapture"]);
  });

  it("disarms and keeps what was read when auto mode aborts mid-scan", async () => {
    const setupResult = setup();
    let clicks = 0;
    const deps = {
      ...setupResult.deps,
      click: async (target: { x: number; y: number }) => {
        clicks += 1;
        if (clicks > 4) throw new Error("auto mode stopped: the stop key was pressed");
        return setupResult.deps.click(target);
      },
    };
    const { result, read } = await runScan(deps);
    expect(result.reason).toBe("aborted");
    expect(result.detail).toContain("stop key");
    expect(read).toEqual([0, 1, 2, 3]);
    expect(setupResult.calls.slice(-2)).toEqual(["disarm", "stopCapture"]);
  });

  it("passes the minimum level to the navigator", async () => {
    const fakeLevels = createFakeGame({ echoes: fakeEchoes(18, (i) => (i < 7 ? 25 : 10)) });
    const { deps } = setup({
      click: fakeLevels.deps.click,
      scroll: fakeLevels.deps.scroll,
      sampleRegions: fakeLevels.deps.sampleRegions,
      readEcho: (seq, _frame, setIcon) => fakeLevels.deps.readEcho(seq, setIcon),
      frameSize: async () => fakeLevels.deps.frameSize(),
      sleep: fakeLevels.deps.sleep,
      now: fakeLevels.deps.now,
    });
    const { result, read } = await runScan(deps, "I understand", 25);
    expect(result.reason).toBe("below-min-level");
    expect(read).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("stops when Stop is pressed, and still cleans up", async () => {
    const { deps, calls } = setup();
    const read: number[] = [];
    const scan = createAutoScan(deps, { phrase: "I understand", minLevel: 0 }, {
      onEcho: (echo) => {
        read.push(echo.id);
        if (read.length === 3) scan.stop();
      },
    });
    const result = await scan.run();
    expect(result.reason).toBe("stopped");
    expect(read).toEqual([0, 1, 2]);
    expect(calls.slice(-2)).toEqual(["disarm", "stopCapture"]);
  });

  it("reports when F8 couldn't be claimed", async () => {
    const { deps } = setup({ arm: async () => ({ ...ARMED, stop_key_active: false }) });
    const { started } = await runScan(deps);
    expect(started).toBe(false);
  });
});
