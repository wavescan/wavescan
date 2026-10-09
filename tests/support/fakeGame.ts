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
  /**
   * Echoes with the same `look` draw the same details panel (the same echo and main stat
   * at +0 in different sets differ only by a small set icon). Defaults to the echo's index.
   */
  look?: number;
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
  /** How long a read (OCR) takes, in event-loop turns, so reads overlap the next clicks. */
  readTurns?: number;
  /**
   * How far the selected card's gold line sits below the others, in sample pixels. The game
   * draws the selected card slightly larger, so its edge lands a pixel or so lower, and a
   * click moves that from row to row. 0 by default.
   */
  selectedDrop?: number;
  /**
   * Scrolling past either end of the list overshoots and springs back, like the real game
   * (fixtures/raw/scrolling.mp4, 1920×1080): the grid jumps up to 0.27 of a row past the end
   * in one frame, holds for a few frames, then eases back over about 300 ms. The tail of the
   * ease moves less than a sample pixel per frame. Off by default.
   */
  bounce?: boolean;
}

/** Most a scroll past the end overshoots, as a share of a row (measured 0.27). */
const BOUNCE_ROWS = 0.27;
/** Frames the overshoot holds before springing back. */
const BOUNCE_HOLD_FRAMES = 4;
/** Frames the spring back takes (about 300 ms at 60 fps). */
const BOUNCE_FRAMES = 18;

/** Same as `regions::PINNED_FRAMES` in Rust: how many recent frames a read can still use. */
const PINNED_FRAMES = 4;

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
  /** A spring back in progress: from `from` to `to`, starting at frame `start`. */
  let spring: { from: number; to: number; start: number } | null = null;
  let selected = options.selected ?? 0;
  let seq = 0;
  let time = 0;
  const pending: { due: number; apply: () => void }[] = [];
  const log = { clicks: [] as FracPoint[], scrolls: [] as number[], maxReadsInFlight: 0 };
  /** The selected echo in each frame, and the frames a read can still use (newest last). */
  const selectedAt = new Map<number, number>();
  const pinned: number[] = [];
  let readsInFlight = 0;

  function later(apply: () => void) {
    pending.push({ due: seq + (options.lag ?? 0), apply });
  }

  /** Advances one frame, applying input whose time has come. */
  function nextFrame() {
    seq += 1;
    time += 1;
    for (const p of pending.filter((p) => p.due < seq)) p.apply();
    pending.splice(0, pending.length, ...pending.filter((p) => p.due >= seq));
    if (spring) {
      // Ease-out cubic: fast at first, then less than a sample pixel per frame at the end.
      const t = Math.min(1, Math.max(0, (seq - spring.start) / BOUNCE_FRAMES));
      offset = spring.from + (spring.to - spring.from) * (1 - (1 - t) ** 3);
      if (t === 1) spring = null;
    }
  }

  /** Scrolls the grid by `by`, overshooting and springing back past either end when `bounce` is on. */
  function scrollBy(by: number) {
    // A scroll during a spring back starts from where the spring is heading.
    const wanted = (spring ? spring.to : offset) + by;
    const target = Math.min(maxOffset, Math.max(0, wanted));
    spring = null;
    if (!options.bounce || target === wanted) {
      offset = target;
      return;
    }
    const overshoot = Math.min(Math.abs(wanted - target), BOUNCE_ROWS * layout.rowPitch);
    offset = target + Math.sign(wanted - target) * overshoot;
    spring = { from: offset, to: target, start: seq + BOUNCE_HOLD_FRAMES };
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

  /** The last strip drawn, reused until the grid scrolls or the selection moves (most samples see the same grid). */
  let cached: { offset: number; selected: number; sample: Sample } | null = null;

  function renderStrip(): Sample {
    if (cached?.offset === offset && cached.selected === selected) return cached.sample;
    const sample = drawStrip();
    cached = { offset, selected, sample };
    return sample;
  }

  function drawStrip(): Sample {
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
          // Only the row whose card can cover this y, and its neighbours.
          const near = Math.floor((fy + offset - top0) / layout.rowPitch);
          for (let row = Math.max(0, near); row <= Math.min(rowCount - 1, near + 1); row++) {
            const index = row * 6 + column;
            if (index >= echoes.length) continue;
            const drop = index === selected ? ((options.selectedDrop ?? 0) / height) * strip.height : 0;
            const bar = barTop(row) + drop;
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

  const panels = new Map<string, Sample>();

  /** Panel pixels: noise seeded by the selected echo's look, so each look has its own fingerprint. */
  function renderPanel(width: number, height: number, salt: number): Sample {
    const look = echoes[selected]?.look ?? selected;
    const key = `${look}/${salt}`;
    const known = panels.get(key);
    if (known) return known;
    const sample = drawPanel(width, height, salt, look);
    panels.set(key, sample);
    return sample;
  }

  function drawPanel(width: number, height: number, salt: number, look: number): Sample {
    const rgba = new Uint8ClampedArray(width * height * 4);
    let state = (look + 1) * 7919 + salt;
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
      selectedAt.set(seq, selected);
      if (pinned.at(-1) !== seq) pinned.push(seq);
      if (pinned.length > PINNED_FRAMES) pinned.shift();
    if (regions.length === 1) return encodeSamples(seq, [renderStrip()]);
      return encodeSamples(seq, [renderPanel(64, 48, 1), renderPanel(128, 96, 2), renderPanel(16, 16, 3)]);
    },
    async readEcho(frameSeq) {
      // Like Rust: the frame has to be one of the last few sampled when the read starts.
      if (!pinned.includes(frameSeq)) throw new Error("that frame is no longer available; sample again");
      const shown = selectedAt.get(frameSeq)!;
      readsInFlight += 1;
      log.maxReadsInFlight = Math.max(log.maxReadsInFlight, readsInFlight);
      for (let i = 0; i < (options.readTurns ?? 0); i++) await new Promise((resolve) => setTimeout(resolve, 0));
      readsInFlight -= 1;
      return echoes[shown]!;
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
      later(() => scrollBy(-ticks * notch));
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
