import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { RegionText } from "@/ipc/types";
import { createRegionReader, readEngineFor, readEngineLabel } from "@/ocr/regionReader";
import {
  PSM_SINGLE_BLOCK,
  PSM_SPARSE_TEXT,
  SCALE,
  createBundledTesseract,
  createTesseractReader,
  describeAssets,
  prepareCrop,
  startFailure,
  type Crop,
  type TesseractWorker,
} from "@/ocr/tesseract";

function solid(width: number, height: number, [r, g, b]: [number, number, number]): Crop {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([r, g, b, 255], i * 4);
  return { width, height, rgba };
}

/** Splits a binary PGM into its size and pixels. */
function parsePgm(pgm: Uint8Array) {
  const header = /^P5\n(\d+) (\d+)\n255\n/.exec(new TextDecoder().decode(pgm.slice(0, 32)));
  if (!header) throw new Error("not a PGM");
  return { width: Number(header[1]), height: Number(header[2]), pixels: pgm.slice(header[0].length) };
}

describe("prepareCrop", () => {
  it("returns a 3× larger grey PGM", () => {
    const { width, height, pixels } = parsePgm(prepareCrop(solid(4, 2, [128, 128, 128])));
    expect([width, height]).toEqual([4 * SCALE, 2 * SCALE]);
    expect(pixels.length).toBe(width * height);
    expect(new Set(pixels)).toEqual(new Set([128]));
  });

  it("stretches contrast around mid-grey and clips at black and white", () => {
    const value = (rgb: [number, number, number]) => parsePgm(prepareCrop(solid(1, 1, rgb))).pixels[0];
    expect(value([148, 148, 148])).toBe(158); // 128 + 20 × 1.5
    expect(value([108, 108, 108])).toBe(98);
    expect(value([250, 250, 250])).toBe(255);
    expect(value([10, 10, 10])).toBe(0);
    // Grey uses the usual luma weights, so pure green is brighter than pure blue.
    expect(value([0, 255, 0])).toBeGreaterThan(value([0, 0, 255])!);
  });

  it("smooths between pixels when enlarging", () => {
    // Black | white, two pixels wide: the enlarged row ramps up instead of jumping.
    const crop = { width: 2, height: 1, rgba: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]) };
    const row = [...parsePgm(prepareCrop(crop)).pixels.slice(0, 6)];
    expect(row).toHaveLength(6);
    expect(row[0]).toBe(0);
    expect(row[5]).toBe(255);
    expect(row.some((v) => v > 0 && v < 255)).toBe(true);
    expect(row).toEqual([...row].sort((a, b) => a - b));
  });

  it("rejects a crop whose pixels don't match its size", () => {
    expect(() => prepareCrop({ width: 2, height: 2, rgba: new Uint8Array(12) })).toThrow(/invalid crop/);
  });
});

/** A fake tesseract.js worker that "reads" whatever `answer` returns for the current mode. */
function fakeWorker(answer: (psm: string) => string[], log: string[] = [], name = "w") {
  let psm = PSM_SINGLE_BLOCK;
  let busy = false;
  const worker: TesseractWorker = {
    async recognize() {
      if (busy) throw new Error("a worker was given two crops at once");
      busy = true;
      log.push(`${name}:read:${psm}`);
      await new Promise((r) => setTimeout(r, 1));
      busy = false;
      const lines = answer(psm).map((text, i) => ({
        text: ` ${text} `,
        bbox: { x0: 3 * SCALE, y0: i * 30 * SCALE, x1: 90 * SCALE, y1: (i * 30 + 20) * SCALE },
      }));
      return { data: { blocks: [{ paragraphs: [{ lines }] }] } };
    },
    async setParameters(params) {
      psm = params.tessedit_pageseg_mode ?? psm;
      log.push(`${name}:psm:${psm}`);
    },
    async terminate() {
      log.push(`${name}:terminate`);
    },
  };
  return worker;
}

describe("createTesseractReader", () => {
  const crop = solid(100, 40, [200, 200, 200]);

  it("returns lines in request order with bounds back in the crop's own pixels", async () => {
    const reader = createTesseractReader([fakeWorker(() => ["HP", "", "Crit. Rate 7.5%"])]);
    const [result] = await reader.read([{ id: "substatLabels", crop }]);
    expect(result).toMatchObject({ id: "substatLabels", width: 100, height: 40 });
    expect(result!.lines).toEqual([
      { text: "HP", bounds: { x: 3, y: 0, width: 87, height: 20 } },
      { text: "Crit. Rate 7.5%", bounds: { x: 3, y: 60, width: 87, height: 20 } },
    ]);
    expect(result!.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  it("shares the pool between reads, one crop per worker at a time", async () => {
    const log: string[] = [];
    const reader = createTesseractReader([fakeWorker(() => ["a"], log, "w1"), fakeWorker(() => ["b"], log, "w2")]);
    const crops = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, crop }));
    const [first, second] = await Promise.all([reader.read(crops), reader.read(crops.slice(0, 2))]);
    expect(first!.map((r) => r.id)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
    expect(second!.map((r) => r.id)).toEqual(["r0", "r1"]);
    expect(log.filter((l) => l.includes("read"))).toHaveLength(7);
    expect(new Set(log.map((l) => l.split(":")[0]))).toEqual(new Set(["w1", "w2"]));
  });

  it("reads an empty name again as sparse text, then goes back to block mode", async () => {
    const log: string[] = [];
    const worker = fakeWorker((psm) => (psm === PSM_SPARSE_TEXT ? ["Whiff Whaff"] : []), log);
    const reader = createTesseractReader([worker], { sparseRetryIds: ["name"] });
    const [name, other] = await reader.read([
      { id: "name", crop },
      { id: "substatBlock", crop },
    ]);
    expect(name!.lines.map((l) => l.text)).toEqual(["Whiff Whaff"]);
    expect(other!.lines).toEqual([]);
    expect(log).toEqual([
      "w:read:6",
      `w:psm:${PSM_SPARSE_TEXT}`,
      `w:read:${PSM_SPARSE_TEXT}`,
      `w:psm:${PSM_SINGLE_BLOCK}`,
      "w:read:6",
    ]);
  });

  it("fails the read when a crop can't be read, and keeps working afterwards", async () => {
    let fail = true;
    const worker = fakeWorker(() => ["ok"]);
    const recognize = worker.recognize.bind(worker);
    worker.recognize = async (...args) => {
      if (fail) throw new Error("wasm trap");
      return recognize(...args);
    };
    const reader = createTesseractReader([worker]);
    await expect(reader.read([{ id: "name", crop }])).rejects.toThrow("wasm trap");
    fail = false;
    expect((await reader.read([{ id: "name", crop }]))[0]!.lines[0]!.text).toBe("ok");
  });

  it("needs at least one worker, and terminates them all", async () => {
    expect(() => createTesseractReader([])).toThrow(/at least one worker/);
    const log: string[] = [];
    await createTesseractReader([fakeWorker(() => [], log, "a"), fakeWorker(() => [], log, "b")]).terminate();
    expect(log).toEqual(["a:terminate", "b:terminate"]);
  });
});

const region = (id: string): RegionText => ({ id, lines: [], width: 1, height: 1, elapsed_ms: 1 });

describe("createBundledTesseract", () => {
  const answers = (text: string) => fakeWorker(() => [text]);
  const crop = { id: "name", crop: solid(1, 1, [0, 0, 0]) };
  const javascript = ((url: string) =>
    Promise.resolve(new Response(url, { status: 200, headers: { "content-type": "text/javascript" } }))) as typeof fetch;

  it("starts the pool from the bundled files on the first read, once", async () => {
    const started: unknown[] = [];
    const tesseract = createBundledTesseract("http://tauri.localhost/tesseract", async (paths) => {
      started.push(paths);
      return [answers("ok")];
    });
    expect(started).toEqual([]);
    const [a, b] = await Promise.all([tesseract.read([crop]), tesseract.read([crop])]);
    expect([a![0]!.lines[0]!.text, b![0]!.lines[0]!.text]).toEqual(["ok", "ok"]);
    expect(started).toEqual([
      {
        workerPath: "http://tauri.localhost/tesseract/worker.min.js",
        corePath: "http://tauri.localhost/tesseract/tesseract-core-simd-lstm.js",
        langPath: "http://tauri.localhost/tesseract",
        workerBlobURL: false,
      },
    ]);
  });

  it("names what each bundled file fetch returned when the pool can't start, and retries next read", async () => {
    let attempts = 0;
    const start = async () => {
      attempts++;
      if (attempts === 1) throw startFailure(undefined);
      return [answers("ok")];
    };
    const tesseract = createBundledTesseract("http://x/tesseract", start, javascript);

    await expect(tesseract.read([crop])).rejects.toThrow(
      "Tesseract couldn't read the echo: a Tesseract worker couldn't load its script (worker.min.js: 200 text/javascript; " +
        "tesseract-core-simd-lstm.js: 200 text/javascript; tesseract-core-simd-lstm.wasm: 200 text/javascript; " +
        "eng.traineddata.gz: 200 text/javascript)",
    );
    expect((await tesseract.read([crop]))[0]!.lines[0]!.text).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("says a failed read came from Tesseract", async () => {
    const broken = fakeWorker(() => {
      throw new Error("no model");
    });
    const tesseract = createBundledTesseract("http://x/tesseract", async () => [broken], javascript);
    await expect(tesseract.read([crop])).rejects.toThrow("Tesseract couldn't read the echo: no model");
  });
});

describe("createRegionReader", () => {
  it("uses Tesseract on Windows and the built-in reader on macOS", () => {
    expect(readEngineFor("windows")).toBe("tesseract");
    expect(readEngineFor("macos")).toBe("native");
    expect(readEngineLabel("tesseract", "windows")).toBe("Tesseract");
    expect(readEngineLabel("native", "macos")).toBe("macOS Vision");
  });

  it("native: passes the request straight to Rust's OCR", async () => {
    const readRegions = async () => [region("name")];
    const read = createRegionReader("native", {
      readRegions,
      cropRegions: () => Promise.reject(new Error("not used")),
      readCrops: () => Promise.reject(new Error("not used")),
    });
    expect(read).toBe(readRegions);
  });

  it("tesseract: crops the same pinned frame in Rust and reads the crops by id", async () => {
    const calls: unknown[] = [];
    const payload = new ArrayBuffer(4 + 2 * (8 + 4));
    const view = new DataView(payload);
    view.setUint32(0, 2, true);
    for (const offset of [4, 16]) {
      view.setUint32(offset, 1, true);
      view.setUint32(offset + 4, 1, true);
    }
    const read = createRegionReader("tesseract", {
      readRegions: () => Promise.reject(new Error("not used")),
      cropRegions: async (seq, regions) => (calls.push([seq, regions]), payload),
      readCrops: async (crops) => crops.map((c) => region(c.id)),
    });
    const name = { x: 0.1, y: 0.1, width: 0.2, height: 0.05 };
    const level = { x: 0.1, y: 0.2, width: 0.05, height: 0.05 };
    const results = await read(7, [
      { id: "name", region: name },
      { id: "level", region: level },
    ]);
    expect(calls).toEqual([[7, [name, level]]]);
    expect(results.map((r) => r.id)).toEqual(["name", "level"]);

    await expect(read(7, [{ id: "name", region: name }])).rejects.toThrow(/asked for 1 crops but got 2/);
  });
});

describe("bundled Tesseract model", () => {
  it("is tessdata_fast 4.1.0's English model, unchanged", () => {
    // https://github.com/tesseract-ocr/tessdata_fast/raw/4.1.0/eng.traineddata (Apache-2.0).
    // To update it: download, `gzip -9 -n`, replace the file, update this hash and ADR 0027,
    // and run the fixture replay before and after.
    const model = gunzipSync(readFileSync("public/tesseract/eng.traineddata.gz"));
    expect(createHash("sha256").update(model).digest("hex")).toBe(
      "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
    );
  });
});

describe("Tesseract start failures", () => {
  it("names a worker script that couldn't load instead of saying undefined", () => {
    // tesseract.js rejects with the error event's message, which a failed script load lacks.
    expect(startFailure(undefined).message).toBe("a Tesseract worker couldn't load its script");
    expect(startFailure("no model").message).toBe("no model");
    const error = new Error("timeout");
    expect(startFailure(error)).toBe(error);
  });

  it("describes what each bundled file fetch returned", async () => {
    const fakeFetch = ((url: string) =>
      url.endsWith(".js")
        ? Promise.resolve(new Response("", { status: 200, headers: { "content-type": "text/html" } }))
        : Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;
    await expect(describeAssets(["http://tauri.localhost/tesseract/worker.min.js", "http://x/eng.traineddata.gz"], fakeFetch)).resolves.toBe(
      "worker.min.js: 200 text/html; eng.traineddata.gz: Failed to fetch",
    );
  });
});
