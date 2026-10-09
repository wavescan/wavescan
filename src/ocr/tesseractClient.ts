import type { RegionText } from "@/ipc/types";
import type { CropRead } from "./tesseract";
import type { ReadRequest, ReadResponse } from "./tesseract.worker";

/** The parts of a `Worker` the client uses (a fake one in tests). */
export interface WorkerLike {
  postMessage(message: ReadRequest, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ReadResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

/**
 * The page's side of `tesseract.worker.ts`: sends crops, and resolves each read when its
 * answer comes back. The worker starts on the first read. If it crashes, every pending
 * read fails and the next read starts a fresh worker.
 */
export function createTesseractClient(spawn: () => WorkerLike) {
  let worker: WorkerLike | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve: (r: RegionText[]) => void; reject: (e: Error) => void }>();

  function start(): WorkerLike {
    const started = spawn();
    started.addEventListener("message", ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if ("error" in data) request.reject(new Error(`Tesseract couldn't read the echo: ${data.error}`));
      else request.resolve(data.regions);
    });
    started.addEventListener("error", (event) => {
      started.terminate();
      if (worker === started) worker = null;
      const error = new Error(`The Tesseract reader stopped: ${event.message || "unknown error"}`);
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    });
    return started;
  }

  return {
    /** Reads `crops` in the worker. Their pixel buffers move to the worker (unusable here afterwards). */
    read(crops: CropRead[]): Promise<RegionText[]> {
      worker ??= start();
      const id = nextId++;
      const result = new Promise<RegionText[]>((resolve, reject) => pending.set(id, { resolve, reject }));
      const buffers = [...new Set(crops.map((c) => c.crop.rgba.buffer))];
      worker.postMessage({ id, crops } satisfies ReadRequest, buffers);
      return result;
    },
  };
}

export type TesseractClient = ReturnType<typeof createTesseractClient>;
