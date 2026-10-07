import type { FrameSize } from "@wutheringtools/scanner-core";
import { COLUMN_X, GRID_16_10, gridLayout, type GridLayout } from "@/auto/grid";
import type { NavigatorDeps } from "@/auto/navigator";
import type { FracPoint, FracRect } from "@/ipc/types";
import type { Sample } from "@/session/samples";
import { encodeSamples } from "./samplePayload";

// A pretend Bag → Echoes screen for navigator tests: a scrolling 6-column grid drawn the way
// grid.ts expects (card art, bright rarity line, dark level bar), a details panel whose
// pixels depend on the selected echo, clicks and wheel scrolls, and a virtual clock. Input
// can take effect a few frames late, like the real game.

export interface FakeEcho {
  id: number;
  level: number | null;
}

export interface FakeGameOptions {
  echoes: FakeEcho[];
  frame?: FrameSize;
  /** Grid move per wheel notch, as a share of a row (1/8 measured at 1920×1080). */
  notchRows?: number;
  /** Rows already scrolled past when the test starts. */
  startRows?: number;
  /** Index of the echo selected when the test starts (the game selects the first). */
  selected?: number;
  /** Frames before a click or scroll shows on screen. */
  lag?: number;
  /** False: clicks are swallowed (Windows without administrator). */
  clicksLand?: boolean;
  /** Art brightness for a card; constant art makes every row look the same. */
  art?: (echo: FakeEcho, cy: number) => number;
}

/** Where row 0's gold line sits at the top of the list (16:10 top-of-list fixture). */
const TOP_ROW_16_10 = 0.237;
const SAMPLE_WIDTH = 256;
const CARD_HALF_WIDTH = 0.0385;

export function createFakeGame(options: FakeGameOptions) {
  const frame = options.frame ?? { width: 2880, height: 1800 };
  const layout: GridLayout = gridLayout(frame) ?? GRID_16_10;
  const scale = layout.rowPitch / GRID_16_10.rowPitch;
  const echoes = options.echoes;
  const rowCount = Math.ceil(echoes.length / 6);
  const top0 = TOP_ROW_16_10 * scale;
  const stripBottom = layout.strip.y + layout.strip.height;
  // The list ends with the last row's level bar just inside the scrolling area.
  const lastBarTop = top0 + (rowCount - 1) * layout.rowPitch;
  const maxOffset = Math.max(0, lastBarTop + layout.levelBarHeight + 0.01 * scale - stripBottom);
  const notch = (options.notchRows ?? 1 / 8) * layout.rowPitch;
  const art = options.art ?? ((echo: FakeEcho, cy: number) => 40 + ((echo.id * 37 + cy * 11) % 9) * 18);

  let offset = Math.min(maxOffset, (options.startRows ?? 0) * layout.rowPitch);
  let selected = options.selected ?? 0;
  let seq = 0;
  let time = 0;
  const pending: { due: number; apply: () => void }[] = [];
  const log = { clicks: [] as FracPoint[], scrolls: [] as number[] };

  function later(apply: () => void) {
    pending.push({ due: seq + (options.lag ?? 0), apply });
  }

  /** Advances one frame, applying input whose time has come. */
  function nextFrame() {
    seq += 1;
    time += 1;
    for (const p of pending.filter((p) => p.due < seq)) p.apply();
    pending.splice(0, pending.length, ...pending.filter((p) => p.due >= seq));
  }

  const barTop = (row: number) => top0 + row * layout.rowPitch - offset;

  /** The echo index under a point, or null for empty space. */
  function cardAt(point: FracPoint): number | null {
    if (point.y < layout.strip.y || point.y > stripBottom) return null;
    const column = COLUMN_X.findIndex((x) => Math.abs(point.x - x) <= CARD_HALF_WIDTH);
    if (column < 0) return null;
    for (let row = 0; row < rowCount; row++) {
      const bar = barTop(row);
      if (point.y >= bar - layout.cardArtHeight && point.y < bar + layout.levelBarHeight) {
        const index = row * 6 + column;
        return index < echoes.length ? index : null;
      }
    }
    return null;
  }

  function renderStrip(): Sample {
    const { strip } = layout;
    const height = Math.round((SAMPLE_WIDTH * strip.height * frame.height) / (strip.width * frame.width));
    const rgba = new Uint8ClampedArray(SAMPLE_WIDTH * height * 4);
    const line = (2.5 / height) * strip.height;
    for (let y = 0; y < height; y++) {
      const fy = strip.y + ((y + 0.5) / height) * strip.height;
      for (let x = 0; x < SAMPLE_WIDTH; x++) {
        const fx = strip.x + ((x + 0.5) / SAMPLE_WIDTH) * strip.width;
        const column = COLUMN_X.findIndex((cx) => Math.abs(fx - cx) <= CARD_HALF_WIDTH);
        // Gap between cards: real frames measure 45-90 near the top (darker than most art),
        // so a card's top edge never makes a bright-to-dark drop of its own.
        let value = 80;
        if (column >= 0) {
          for (let row = 0; row < rowCount; row++) {
            const index = row * 6 + column;
            if (index >= echoes.length) continue;
            const bar = barTop(row);
            const artTop = bar - layout.cardArtHeight;
            if (fy >= artTop && fy < bar - line) {
              value = art(echoes[index]!, Math.floor(((fy - artTop) / layout.cardArtHeight) * 4));
            } else if (fy >= bar - line && fy < bar) value = 215;
            else if (fy >= bar && fy < bar + layout.levelBarHeight) value = 60;
          }
        }
        rgba.set([value, value, value, 255], (y * SAMPLE_WIDTH + x) * 4);
      }
    }
    return { width: SAMPLE_WIDTH, height, rgba };
  }

  /** Panel pixels: noise seeded by the selected echo, so each echo has its own fingerprint. */
  function renderPanel(width: number, height: number, salt: number): Sample {
    const rgba = new Uint8ClampedArray(width * height * 4);
    let state = (selected + 1) * 7919 + salt;
    for (let i = 0; i < width * height; i++) {
      state = (state * 1103515245 + 12345) % 2147483648;
      const v = 30 + (state % 200);
      rgba.set([v, v, v, 255], i * 4);
    }
    return { width, height, rgba };
  }

  const deps: NavigatorDeps<FakeEcho> = {
    frameSize: () => frame,
    async sampleRegions(regions: FracRect[]) {
      nextFrame();
      if (regions.length === 1) return encodeSamples(seq, [renderStrip()]);
      return encodeSamples(seq, [renderPanel(64, 48, 1), renderPanel(128, 96, 2), renderPanel(16, 16, 3)]);
    },
    async readEcho() {
      return echoes[selected]!;
    },
    async click(target) {
      log.clicks.push(target);
      if (options.clicksLand === false) return;
      const index = cardAt(target);
      later(() => {
        if (index !== null) selected = index;
      });
    },
    async scroll(_target, ticks) {
      log.scrolls.push(ticks);
      later(() => {
        offset = Math.min(maxOffset, Math.max(0, offset - ticks * notch));
      });
    },
    async sleep(ms) {
      time += ms;
    },
    now: () => time,
    errorMessage: (error) => (error instanceof Error ? error.message : String(error)),
    onEcho: () => undefined,
  };

  return { deps, log, layout, rowCount };
}

/** `count` echoes with ids 0, 1, 2, … and the given level (or levels by index). */
export function fakeEchoes(count: number, level: number | ((index: number) => number | null) = 25): FakeEcho[] {
  return Array.from({ length: count }, (_, id) => ({ id, level: typeof level === "number" ? level : level(id) }));
}
