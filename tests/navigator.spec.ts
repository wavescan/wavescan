import { describe, expect, it } from "vitest";
import { GRID_16_10 } from "@/auto/grid";
import { createNavigator, measureMove, type GridPosition, type NavigatorOptions } from "@/auto/navigator";
import { createFakeGame, fakeEchoes, type FakeEcho, type FakeGameOptions } from "./support/fakeGame";

// The auto-mode navigator against a pretend echo grid (tests/support/fakeGame.ts): it has
// to read every echo exactly once, in order, whatever the scroll position, input lag or
// row contents, and stop with a reason instead of guessing when it can't keep track.

async function scan(game: FakeGameOptions, options: NavigatorOptions = { minLevel: 0 }) {
  const fake = createFakeGame(game);
  const read: { echo: FakeEcho; position: GridPosition }[] = [];
  const navigator = createNavigator({ ...fake.deps, onEcho: (echo, position) => read.push({ echo, position }) }, options);
  const result = await navigator.run();
  return { result, ids: read.map((r) => r.echo.id), read, fake, navigator };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("navigator", () => {
  it("reads every echo once, in order, and stops at the end of the list", async () => {
    // 50 echoes: 8 full rows and a last row of 2 (like the end-of-list fixture).
    const { result, ids, read } = await scan({ echoes: fakeEchoes(50) });
    expect(result.reason).toBe("end-of-list");
    expect(ids).toEqual(range(50));
    expect(read[49]!.position).toEqual({ row: 8, column: 1 });
    expect(result.echoes).toBe(50);
    expect(result.unchanged).toBe(4); // the empty slots after the last echo
    expect(result.errors).toBe(0);
  });

  it("reads a short list that fits on screen without scrolling", async () => {
    const { result, ids } = await scan({ echoes: fakeEchoes(14) });
    expect(result.reason).toBe("end-of-list");
    expect(ids).toEqual(range(14));
  });

  it("scrolls back to the top first", async () => {
    const { result, ids } = await scan({ echoes: fakeEchoes(60), startRows: 5, selected: 33 });
    expect(result.reason).toBe("end-of-list");
    expect(ids).toEqual(range(60));
  });

  it("keeps track when every row looks the same", async () => {
    const { result, ids } = await scan({ echoes: fakeEchoes(48), art: () => 90 });
    expect(result.reason).toBe("end-of-list");
    expect(ids).toEqual(range(48));
  });

  it("copes with clicks and scrolls that show up a few frames late", async () => {
    const { result, ids } = await scan({ echoes: fakeEchoes(40), lag: 3 });
    expect(result.reason).toBe("end-of-list");
    expect(ids).toEqual(range(40));
  });

  it("works on a 16:9 game window", async () => {
    const { result, ids } = await scan({ echoes: fakeEchoes(45), frame: { width: 1920, height: 1080 } });
    expect(result.reason).toBe("end-of-list");
    expect(ids).toEqual(range(45));
  });

  it("stops at the first echo below the minimum level, without reporting it", async () => {
    // Sorted by level: 12 at +25, 12 at +20, then +15 and lower.
    const levels = (i: number) => (i < 12 ? 25 : i < 24 ? 20 : 15);
    const { result, ids } = await scan({ echoes: fakeEchoes(60, levels) }, { minLevel: 20 });
    expect(result.reason).toBe("below-min-level");
    expect(ids).toEqual(range(24));
  });

  it("reports an echo whose level couldn't be read, and keeps going", async () => {
    const { result, ids } = await scan({ echoes: fakeEchoes(12, (i) => (i === 3 ? null : 25)) }, { minLevel: 20 });
    expect(result.reason).toBe("end-of-list");
    expect(ids).toEqual(range(12));
  });

  it("stops when clicks don't reach the game", async () => {
    const { result, ids } = await scan({ echoes: fakeEchoes(30), clicksLand: false });
    expect(result.reason).toBe("clicks-not-landing");
    // Only the echo the game had already selected (the first one) was read.
    expect(ids).toEqual([0]);
  });

  it("reads the first card even when the game already shows it", async () => {
    const { ids } = await scan({ echoes: fakeEchoes(6), selected: 0 });
    expect(ids).toEqual(range(6));
  });

  it("doesn't read a stale panel for the first card when another echo was selected", async () => {
    const { ids } = await scan({ echoes: fakeEchoes(18), selected: 15, lag: 2 });
    expect(ids).toEqual(range(18));
  });

  it("stops instead of guessing when one notch moves more than half a row", async () => {
    const { result, ids } = await scan({ echoes: fakeEchoes(60), notchRows: 0.6 });
    expect(result.reason).toBe("lost-track");
    // Everything read before that is real and in order.
    expect(ids).toEqual(range(ids.length));
  });

  it("stops when auto mode refuses an action, keeping what was read", async () => {
    const fake = createFakeGame({ echoes: fakeEchoes(30) });
    let clicks = 0;
    const read: number[] = [];
    const navigator = createNavigator(
      {
        ...fake.deps,
        onEcho: (echo) => read.push(echo.id),
        click: async (target) => {
          clicks += 1;
          if (clicks > 8) throw new Error("the mouse moved");
          return fake.deps.click(target);
        },
      },
      { minLevel: 0 },
    );
    const result = await navigator.run();
    expect(result.reason).toBe("aborted");
    expect(result.detail).toContain("the mouse moved");
    expect(read).toEqual(range(8));
  });

  it("stops when the user presses Stop", async () => {
    const fake = createFakeGame({ echoes: fakeEchoes(30) });
    const read: number[] = [];
    const navigator = createNavigator(
      {
        ...fake.deps,
        onEcho: (echo) => {
          read.push(echo.id);
          if (read.length === 5) navigator.stop();
        },
      },
      { minLevel: 0 },
    );
    const result = await navigator.run();
    expect(result.reason).toBe("stopped");
    expect(read).toEqual(range(5));
  });

  it("refuses window shapes the grid hasn't been measured at", async () => {
    const { result, fake } = await scan({ echoes: fakeEchoes(6), frame: { width: 3440, height: 1440 } });
    expect(result.reason).toBe("unsupported-shape");
    expect(fake.log.clicks).toHaveLength(0);
    expect(fake.log.scrolls).toHaveLength(0);
  });

  it("never scrolls more than the step limit at once while reading", async () => {
    const { fake } = await scan({ echoes: fakeEchoes(60) });
    const down = fake.log.scrolls.filter((t) => t < 0);
    expect(down.length).toBeGreaterThan(0);
    // 0.4 of a row at 1/8 of a row per notch.
    expect(Math.min(...down)).toBeGreaterThanOrEqual(-3);
  });

  it("stays inside auto mode's action cap for a full inventory", async () => {
    // The cap is 5,000 actions per session (safety.rs). 3,000 echoes is 3,000 clicks plus the
    // scrolls, so scrolling has to cost under 4 actions per row.
    const { fake } = await scan({ echoes: fakeEchoes(120) });
    const rows = fake.rowCount;
    const downScrolls = fake.log.scrolls.filter((t) => t < 0).length;
    expect(downScrolls / rows).toBeLessThan(3.5);
    expect(fake.log.clicks.length).toBe(rows * 6);
  });
});

describe("measureMove", () => {
  const p = GRID_16_10.rowPitch;
  it("measures a move smaller than half a row from the row edges", () => {
    expect(measureMove(GRID_16_10, [0.3, 0.3 + p, 0.3 + 2 * p], [0.25, 0.25 + p])).toBeCloseTo(0.05);
  });

  it("isn't thrown off by a row entering or leaving", () => {
    expect(measureMove(GRID_16_10, [0.3, 0.3 + p], [0.26 + p, 0.26 + 2 * p])).toBeCloseTo(0.04);
  });

  it("is 0 when nothing moved, and when there are no edges", () => {
    expect(measureMove(GRID_16_10, [0.3, 0.3 + p], [0.3, 0.3 + p])).toBeCloseTo(0);
    expect(measureMove(GRID_16_10, [], [0.3])).toBe(0);
  });
});
