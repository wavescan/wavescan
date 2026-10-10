import { beforeAll, describe, expect, it } from "vitest";
import { loadBundledScannerData } from "@/data/scannerData";
import { extractEcho } from "@/session/echoExtract";
import type { EchoCandidate } from "@/session/echoSession";
import { fixLevel, fixSet } from "@/review/fields";
import { EMPTY_FILTER, filterCandidates, reviewQueue, summarize } from "@/review/list";
import { createScanStore, loadSaved, STORAGE_KEY, type KeyValueStorage } from "@/review/scanStore";
import { sabercatPanel } from "./support/echoPanels";

beforeAll(() => {
  loadBundledScannerData();
});

const SET = "PactofNeonlightLeap";
const make = (index: number, level = 25, critDmg = "17.4%"): EchoCandidate => {
  const c: EchoCandidate = { ...extractEcho(sabercatPanel(critDmg)), id: `echo-${index}`, index };
  return fixLevel(c, level);
};

describe("review list", () => {
  // #1 clean +25; #2 +20 but with 5 substats (one too many for +20); #3 set unknown +25;
  // #4 misread Crit. DMG +25
  const list = () => [
    fixSet(make(1), SET),
    fixSet(make(2, 20), SET),
    make(3),
    fixSet(make(4, 25, "17.5%"), SET),
  ];

  it("filters by what still needs checking, level, cost, set and search", () => {
    const all = list();
    expect(filterCandidates(all, EMPTY_FILTER).map((c) => c.index)).toEqual([4, 3, 2, 1]);
    expect(filterCandidates(all, { ...EMPTY_FILTER, toCheck: true }).map((c) => c.index)).toEqual([4, 3, 2]);
    expect(filterCandidates(all, { ...EMPTY_FILTER, minLevel: 25 }).map((c) => c.index)).toEqual([4, 3, 1]);
    expect(filterCandidates(all, { ...EMPTY_FILTER, cost: 4 })).toEqual([]);
    expect(filterCandidates(all, { ...EMPTY_FILTER, set: SET }).map((c) => c.index)).toEqual([4, 2, 1]);
    expect(filterCandidates(all, { ...EMPTY_FILTER, search: "sabercat neonlight" })).toHaveLength(3);
    expect(filterCandidates(all, { ...EMPTY_FILTER, search: "#3" }).map((c) => c.index)).toEqual([3]);
  });

  it("queues every flagged field, oldest echo first", () => {
    expect(reviewQueue(list())).toEqual([
      { id: "echo-2", field: "substats" },
      { id: "echo-3", field: "set" },
      { id: "echo-4", field: "substat.0" },
    ]);
  });

  it("summarises what's in the scan", () => {
    const summary = summarize(list());
    expect(summary).toMatchObject({ total: 4, toCheck: 3, checkedByUser: 4, unknown: 0 });
    expect(summary.levels).toEqual({ max: 3, high: 1, low: 0 });
    expect(summary.sets).toEqual([[SET, 3]]);
  });
});

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("scan store", () => {
  const echo = () => extractEcho(sabercatPanel());

  it("numbers echoes from both modes in one list", () => {
    const store = createScanStore(null);
    expect(store.add(echo(), "watch")).toMatchObject({ id: "watch-1", index: 1 });
    expect(store.add(echo(), "auto")).toMatchObject({ id: "auto-2", index: 2 });
    expect(store.state.mode).toBe("auto");
  });

  it("applies fixes, undoes them and removes echoes", () => {
    const store = createScanStore(null);
    const added = store.add(echo(), "watch");
    store.update(fixSet(added, SET));
    expect(store.get(added.id)?.slot.set).toBe(SET);
    store.undo(added.id);
    expect(store.get(added.id)?.slot.set).toBeNull();
    store.remove(added.id);
    expect(store.state.candidates).toEqual([]);
  });

  it("keeps a copy in storage that a later launch can restore or discard", () => {
    const storage = memoryStorage();
    const first = createScanStore(storage, () => new Date("2026-10-10T14:12:00Z"));
    first.add(echo(), "watch");
    first.setResolution({ width: 2560, height: 1440 });
    first.add(echo(), "watch");
    expect(storage.data.has(STORAGE_KEY)).toBe(true);

    const second = createScanStore(storage);
    expect(second.state.candidates).toEqual([]);
    expect(second.restorable.scan?.candidates).toHaveLength(2);
    expect(second.restorable.scan?.updatedAt).toBe("2026-10-10T14:12:00.000Z");
    second.restore();
    expect(second.state.candidates).toHaveLength(2);
    expect(second.state.resolution).toEqual({ width: 2560, height: 1440 });
    expect(second.restorable.scan).toBeNull();

    second.clear();
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
    expect(createScanStore(storage).restorable.scan).toBeNull();
  });

  it("a new scan replaces the saved one", () => {
    const storage = memoryStorage();
    createScanStore(storage).add(echo(), "watch");
    const next = createScanStore(storage);
    next.add(echo(), "auto");
    expect(next.restorable.scan).toBeNull();
    expect(loadSaved(storage)?.candidates).toHaveLength(1);
    expect(loadSaved(storage)?.mode).toBe("auto");
  });

  it("ignores damaged or blocked storage", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    expect(loadSaved(storage)).toBeNull();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, state: {} }));
    expect(loadSaved(storage)).toBeNull();
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => undefined,
    };
    const store = createScanStore(blocked);
    expect(() => store.add(echo(), "watch")).not.toThrow();
    expect(store.state.candidates).toHaveLength(1);
  });
});
