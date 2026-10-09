import { createWorker, type Worker, type WorkerOptions } from "tesseract.js";
import type { OcrLine, RegionText } from "@/ipc/types";

// The Tesseract reader (ADR 0027): reads echo text on Windows, and in the fixture replay on
// every OS. Every Tesseract setting lives in this file, set up like Wuthering Tools' browser
// scanner (optimizer `src/workers/echoScanner.worker.ts`), so a fix found in one app
// applies to the other. Change a setting only with a fixture replay run before and after
// (`npm run test:fixtures`, docs/fixtures.md).

/** Characters Tesseract may output. Same list as Wuthering Tools. */
export const CHAR_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜàáâãäåèéêëìíîïòóôõöùúûü0123456789.:,-'+% ";
/** Page segmentation "single uniform block of text". */
export const PSM_SINGLE_BLOCK = "6";
/**
 * Page segmentation "sparse text", for a retry when a crop read as nothing. Modes 6 and 7
 * return nothing for one clean Whiff Whaff name crop that mode 11 reads.
 */
export const PSM_SPARSE_TEXT = "11";
/** Crops are enlarged this many times (with smoothing) before reading. */
export const SCALE = 3;
/** Contrast stretch around mid-grey. */
export const CONTRAST = 1.5;
/** Workers reading in parallel. An echo has about 11 crops. */
export const POOL_SIZE = 3;
/** The model file name; Tesseract looks for `${langPath}/eng.traineddata.gz`. */
export const LANGUAGE = "eng";
/** Tesseract's "LSTM only" engine mode, which the `fast` model is made for. */
const OEM_LSTM_ONLY = 1;
/**
 * How long a worker may take to start (load the WebAssembly core and model). Starting
 * takes about a second; when it can't (e.g. the CSP blocks WebAssembly), tesseract.js
 * waits forever instead of failing, so give up after this.
 */
export const STARTUP_TIMEOUT_MS = 30_000;

/** An RGBA image, e.g. one region of a frame from `crop_regions`. */
export interface Crop {
  width: number;
  height: number;
  rgba: Uint8Array | Uint8ClampedArray;
}

/** One region to read: the crop and the id echoed back in its `RegionText`. */
export interface CropRead {
  id: string;
  crop: Crop;
}

/**
 * Wuthering Tools' prep: grey, enlarged `SCALE`× with bilinear smoothing, then contrast
 * ×`CONTRAST` around mid-grey. Returns a binary PGM image (a tiny header plus one byte per
 * pixel), which Tesseract decodes the same way as a PNG without the cost of compressing.
 *
 * Grey is taken before enlarging (Wuthering Tools enlarges first): both steps are linear,
 * so the result is the same up to rounding, and enlarging one channel is 3× less work.
 */
export function prepareCrop({ width, height, rgba }: Crop): Uint8Array {
  if (width <= 0 || height <= 0 || rgba.length !== width * height * 4) {
    throw new Error(`invalid crop: ${width}×${height} with ${rgba.length} bytes`);
  }
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i++) {
    grey[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
  }

  const outWidth = width * SCALE;
  const outHeight = height * SCALE;
  const header = new TextEncoder().encode(`P5\n${outWidth} ${outHeight}\n255\n`);
  const out = new Uint8Array(header.length + outWidth * outHeight);
  out.set(header);

  // For each output column (and row): the two source pixels it lies between, and how far
  // towards the second. Pixel centres line up like a canvas drawImage with smoothing.
  const spans = (outLength: number, length: number) => {
    const first = new Int32Array(outLength);
    const second = new Int32Array(outLength);
    const weight = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const pos = Math.min(Math.max((i + 0.5) / SCALE - 0.5, 0), length - 1);
      first[i] = Math.floor(pos);
      second[i] = Math.min(first[i]! + 1, length - 1);
      weight[i] = pos - first[i]!;
    }
    return { first, second, weight };
  };
  const xs = spans(outWidth, width);
  const ys = spans(outHeight, height);

  let o = header.length;
  for (let y = 0; y < outHeight; y++) {
    const top = ys.first[y]! * width;
    const bottom = ys.second[y]! * width;
    const fy = ys.weight[y]!;
    for (let x = 0; x < outWidth; x++) {
      const x0 = xs.first[x]!;
      const x1 = xs.second[x]!;
      const fx = xs.weight[x]!;
      const upper = grey[top + x0]! * (1 - fx) + grey[top + x1]! * fx;
      const lower = grey[bottom + x0]! * (1 - fx) + grey[bottom + x1]! * fx;
      const value = (upper * (1 - fy) + lower * fy - 128) * CONTRAST + 128;
      out[o++] = Math.round(Math.min(255, Math.max(0, value)));
    }
  }
  return out;
}

/** The parts of a tesseract.js result this reader uses. */
interface RecognizedLine {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
interface Recognized {
  data: { blocks: { paragraphs: { lines: RecognizedLine[] }[] }[] | null };
}

/** The parts of a tesseract.js worker this reader uses (a fake one in tests). */
export interface TesseractWorker {
  recognize(image: Uint8Array, options: object, output: { text: boolean; blocks: boolean }): Promise<Recognized>;
  setParameters(params: Record<string, string>): Promise<unknown>;
  terminate(): Promise<unknown>;
}

/** Lines from a result, with bounds mapped back to the crop's own pixels (like OS OCR). */
function toLines(result: Recognized): OcrLine[] {
  return (result.data.blocks ?? [])
    .flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
    .map((line) => ({
      text: line.text.trim(),
      bounds: {
        x: Math.floor(line.bbox.x0 / SCALE),
        y: Math.floor(line.bbox.y0 / SCALE),
        width: Math.ceil((line.bbox.x1 - line.bbox.x0) / SCALE),
        height: Math.ceil((line.bbox.y1 - line.bbox.y0) / SCALE),
      },
    }))
    .filter((line) => line.text);
}

export interface TesseractReaderOptions {
  /** Region ids read again in sparse-text mode when the first read finds nothing. */
  sparseRetryIds?: readonly string[];
}

/**
 * Reads crops with a pool of Tesseract workers, one crop per worker at a time. Results come
 * back in request order. Several `read` calls can be in flight at once (auto mode reads one
 * echo while clicking the next); their crops share the pool.
 */
export function createTesseractReader(workers: TesseractWorker[], options: TesseractReaderOptions = {}) {
  if (workers.length === 0) throw new Error("the Tesseract reader needs at least one worker");
  const sparseRetry = new Set(options.sparseRetryIds ?? []);
  const idle = [...workers];
  const waiting: ((worker: TesseractWorker) => void)[] = [];

  /** Runs `task` on the next free worker, which nobody else uses until it finishes. */
  async function withWorker<T>(task: (worker: TesseractWorker) => Promise<T>): Promise<T> {
    const worker = idle.pop() ?? (await new Promise<TesseractWorker>((resolve) => waiting.push(resolve)));
    try {
      return await task(worker);
    } finally {
      const next = waiting.shift();
      if (next) next(worker);
      else idle.push(worker);
    }
  }

  /** Reads one crop. Its time covers the prep and the reading, not waiting for a worker. */
  async function readOne({ id, crop }: CropRead): Promise<RegionText> {
    const prepStarted = performance.now();
    const image = prepareCrop(crop);
    const prepMs = performance.now() - prepStarted;
    return withWorker(async (worker) => {
      const started = performance.now();
      const output = { text: false, blocks: true };
      let lines = toLines(await worker.recognize(image, {}, output));
      if (lines.length === 0 && sparseRetry.has(id)) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM_SPARSE_TEXT });
        try {
          lines = toLines(await worker.recognize(image, {}, output));
        } finally {
          await worker.setParameters({ tessedit_pageseg_mode: PSM_SINGLE_BLOCK });
        }
      }
      const elapsed_ms = prepMs + performance.now() - started;
      return { id, lines, width: crop.width, height: crop.height, elapsed_ms };
    });
  }

  return {
    /** Reads every crop; rejects if any read fails. */
    read: (crops: CropRead[]): Promise<RegionText[]> => Promise.all(crops.map(readOne)),
    /** Stops every worker. The reader can't be used afterwards. */
    terminate: () => Promise.all(workers.map((worker) => worker.terminate())).then(() => undefined),
  };
}

export type TesseractReader = ReturnType<typeof createTesseractReader>;

/** Where tesseract.js finds its worker script, WebAssembly core and model. */
export type TesseractPaths = Pick<Partial<WorkerOptions>, "workerPath" | "corePath" | "workerBlobURL"> & {
  langPath: string;
};

/**
 * Starts `POOL_SIZE` tesseract.js workers with this file's settings. `paths` says where
 * the worker script, WebAssembly core and model are (the app passes its own bundled copies,
 * so nothing is ever fetched from tesseract.js's default CDN; Node only needs `langPath`).
 *
 * Rejects if a worker can't start (e.g. a missing asset), or hasn't started after
 * `timeoutMs` (tesseract.js hangs when the CSP blocks WebAssembly).
 */
export async function startTesseractWorkers(
  paths: TesseractPaths,
  count = POOL_SIZE,
  timeoutMs = STARTUP_TIMEOUT_MS,
): Promise<TesseractWorker[]> {
  const started = await Promise.allSettled(
    Array.from({ length: count }, () => withTimeout(startWorker(paths), timeoutMs)),
  );
  const workers = started.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const failure = started.find((r) => r.status === "rejected");
  if (failure) {
    await Promise.all(workers.map((worker) => worker.terminate()));
    throw startFailure(failure.reason);
  }
  return workers;
}

/**
 * The error for a worker that didn't start. When tesseract.js's own worker script can't
 * load at all, the browser's error event has no message and tesseract.js rejects with
 * `undefined`; say what that means instead of "undefined".
 */
export function startFailure(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (reason === undefined || reason === null || reason === "") {
    return new Error("a Tesseract worker couldn't load its script");
  }
  return new Error(String(reason));
}

/**
 * Fetches each URL and describes what came back, e.g. "worker.min.js: 200 text/javascript".
 * Used only after the reader failed to start, so the diagnostics report says which bundled
 * file was missing or served wrongly (a missing file comes back as the app's index.html).
 */
export async function describeAssets(urls: readonly string[], fetchUrl: typeof fetch = fetch): Promise<string> {
  const results = await Promise.all(
    urls.map(async (url) => {
      const name = url.slice(url.lastIndexOf("/") + 1);
      try {
        const response = await fetchUrl(url);
        return `${name}: ${response.status} ${response.headers.get("content-type") ?? "no type"}`;
      } catch (error) {
        return `${name}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }),
  );
  return results.join("; ");
}

/** `promise`, or a rejection once `ms` have passed without it settling. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tesseract didn't start within ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Starts one worker with this file's settings. */
async function startWorker(paths: TesseractPaths): Promise<TesseractWorker> {
  const worker: Worker = await createWorker(LANGUAGE, OEM_LSTM_ONLY, {
    ...paths,
    gzip: true,
    // The model ships with the app; don't keep a second copy in the webview's storage.
    cacheMethod: "none",
  });
  await worker.setParameters({
    tessedit_char_whitelist: CHAR_WHITELIST,
    // tesseract.js types this as an enum; the value is Tesseract's own "6".
    tessedit_pageseg_mode: PSM_SINGLE_BLOCK as never,
  });
  // tesseract.js's own types are wider (any image type, enum parameters) than this file uses.
  return worker as unknown as TesseractWorker;
}
