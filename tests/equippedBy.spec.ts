import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadBundledScannerData } from "@/data/scannerData";
import { buildReport, formatReport, type DiagnosticsInput } from "@/diagnostics/report";
import { reportBody } from "@/feedback/issue";
import { confirmField, fixEquippedBy, flaggedFields, rawReading } from "@/review/fields";
import { extractEcho } from "@/session/echoExtract";
import type { EchoCandidate } from "@/session/echoSession";
import { equipChoices, equippedByLabel, redactDeep, redactPlayerName, resolveEquippedBy } from "@/session/equippedBy";
import { toScanEcho } from "@/session/exportScan";
import { echoReadRegions } from "@/session/echoRegions";
import { PLAYER_NAME_KEY, playerName, setPlayerName, usePlayerNameStorage } from "@/settings/playerName";
import { line, region, sabercatPanel } from "./support/echoPanels";

beforeAll(() => {
  loadBundledScannerData();
});

/** A Map standing in for localStorage. */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

beforeEach(() => {
  usePlayerNameStorage(memoryStorage());
  setPlayerName("Clover");
});
afterEach(() => usePlayerNameStorage(null));

/** Sabercat Prowler, with these lines read in the "Equipped by" box (none = box not read). */
function candidate(...equippedLines: string[]): EchoCandidate {
  const panel = sabercatPanel();
  if (equippedLines.length > 0) panel.push(region("equippedBy", equippedLines.map((t, i) => line(t, i * 30))));
  return { ...extractEcho(panel), id: "echo-1", index: 1 };
}

describe("reading the Equipped by line", () => {
  it("reads it from its own box on every frame shape", () => {
    for (const frame of [
      { width: 2880, height: 1800 },
      { width: 1920, height: 1080 },
    ]) {
      expect(echoReadRegions(frame).map((r) => r.id)).toContain("equippedBy");
    }
  });

  it("keeps the raw text, so the in-game name can change later", () => {
    expect(candidate("Equipped by Clover").raw.equippedBy).toBe("Equipped by Clover");
    expect(candidate().raw.equippedBy).toBeUndefined();
  });
});

describe("resolveEquippedBy", () => {
  it("exports a character's key", () => {
    expect(resolveEquippedBy(candidate("Equipped by Camellya"))).toEqual({ key: "Camellya", flagged: false });
    expect(resolveEquippedBy(candidate("Equipped by QGingxiao"))).toEqual({ key: "Qingxiao", flagged: false });
  });

  it('exports the main character as "Rover", by the in-game name', () => {
    expect(resolveEquippedBy(candidate("Equipped by Clover"))).toEqual({ key: "Rover", flagged: false });
  });

  it("flags the main character when the in-game name isn't set, and follows the setting", () => {
    const c = candidate("Equipped by Airia");
    expect(resolveEquippedBy(c)).toEqual({ key: null, flagged: true });
    setPlayerName("Airia");
    expect(resolveEquippedBy(c)).toEqual({ key: "Rover", flagged: false });
  });

  it("is null and not flagged when there's no line, or when the box wasn't read (older saved scans)", () => {
    expect(resolveEquippedBy(candidate("s", "a ee", "Peal '"))).toEqual({ key: null, flagged: false });
    expect(resolveEquippedBy(candidate())).toEqual({ key: null, flagged: false });
  });

  it("uses the review screen's fix over the reading", () => {
    const fixed = fixEquippedBy(candidate("Equipped by Xqzzv"), "Lupa");
    expect(resolveEquippedBy(fixed)).toEqual({ key: "Lupa", flagged: false });
    expect(resolveEquippedBy(fixEquippedBy(candidate("Equipped by Lupa"), null))).toEqual({ key: null, flagged: false });
  });
});

describe("export and review", () => {
  it("exports the key, and flags a name nobody matches", () => {
    expect(toScanEcho(candidate("Equipped by Camellya"), 1)?.equippedBy).toBe("Camellya");
    expect(toScanEcho(candidate("Equipped by Clover"), 1)?.equippedBy).toBe("Rover");
    const unknown = toScanEcho(candidate("Equipped by Xqzzv"), 1);
    expect(unknown?.equippedBy).toBeNull();
    expect(unknown?.lowConfidence).toContain("equippedBy");
  });

  it("lists a flagged name for review until it's fixed", () => {
    const c = candidate("Equipped by Xqzzv");
    expect(flaggedFields(c)).toContain("equippedBy");
    expect(rawReading(c, "equippedBy")).toBe("Equipped by Xqzzv");
    const fixed = fixEquippedBy(c, "Rover");
    expect(flaggedFields(fixed)).not.toContain("equippedBy");
    expect(toScanEcho(fixed, 1)?.equippedBy).toBe("Rover");
    expect(toScanEcho(fixed, 1)?.lowConfidence ?? []).not.toContain("equippedBy");
  });

  it("exports a line read late with its name, flagged until the user checks it", () => {
    const late: EchoCandidate = { ...candidate("Equipped by Augusta"), equippedByLate: true };
    expect(resolveEquippedBy(late)).toEqual({ key: "Augusta", flagged: true });
    expect(toScanEcho(late, 1)?.equippedBy).toBe("Augusta");
    expect(toScanEcho(late, 1)?.lowConfidence).toContain("equippedBy");
    expect(flaggedFields(late)).toContain("equippedBy");
    const checked = confirmField(late, "equippedBy");
    expect(resolveEquippedBy(checked)).toEqual({ key: "Augusta", flagged: false });
    expect(toScanEcho(checked, 1)?.lowConfidence ?? []).not.toContain("equippedBy");
    expect(flaggedFields(checked)).not.toContain("equippedBy");
  });

  it("offers every character except Rover's per-element entries", () => {
    const keys = equipChoices().map((c) => c.key);
    expect(keys).toContain("YangyangXuanling");
    expect(keys.some((k) => /^rover/i.test(k))).toBe(false);
    expect(equippedByLabel("Rover")).toBe("You (main character)");
    expect(equippedByLabel("LuukHerssen")).toBe("Luuk Herssen");
    expect(equippedByLabel(null)).toBe("Not equipped");
  });
});

describe("the in-game name setting", () => {
  it("is saved on this PC, trimmed, and cleared by a blank", () => {
    const storage = memoryStorage();
    usePlayerNameStorage(storage);
    setPlayerName("  Airia ");
    expect(playerName()).toBe("Airia");
    expect(storage.map.get(PLAYER_NAME_KEY)).toBe("Airia");
    setPlayerName(" ");
    expect(playerName()).toBeNull();
    expect(storage.map.has(PLAYER_NAME_KEY)).toBe(false);
  });
});

describe("hiding the in-game name", () => {
  it("replaces the name anywhere, any case", () => {
    expect(redactPlayerName("I'm clover, Equipped by Clover")).toBe("I'm <player name>, Equipped by <player name>");
  });

  it("hides an OCR slip of the name, and any unrecognised name after Equipped by", () => {
    expect(redactPlayerName("Equipped by Cl0ver")).toBe("Equipped by <player name>");
    expect(redactPlayerName("Equipped by Airia", null)).toBe("Equipped by <name not recognised>");
    expect(redactPlayerName("Equipped  by   Some  Name", null)).toBe("Equipped  by <name not recognised>");
  });

  it("keeps characters' names, so their misreads can be reported", () => {
    expect(redactPlayerName("Equipped by Camellya")).toBe("Equipped by Camellya");
    expect(redactPlayerName("Echo Skill\nSummon a Spearback")).toBe("Echo Skill\nSummon a Spearback");
  });

  it("is applied to every string of a Diagnostics report", () => {
    const report = buildReport({
      app: null,
      gameData: null,
      userAgent: "test",
      window: null,
      candidates: [],
      capture: null,
      ocr: [
        {
          id: "panel",
          label: "Echo panel",
          outcome: {
            ok: true,
            value: { lines: [{ text: "Equipped by Clover", bounds: { x: 0, y: 0, width: 1, height: 1 } }], elapsed_ms: 1, width: 1, height: 1 },
          },
        },
      ],
      echoRead: null,
      input: null,
    } satisfies DiagnosticsInput);
    const text = formatReport(report);
    expect(text).not.toMatch(/clover/i);
    expect(text).toContain("Equipped by <player name>");
    expect(redactDeep({ a: ["Clover"], b: 3, c: null })).toEqual({ a: ["<player name>"], b: 3, c: null });
  });

  it("is applied to bug reports", () => {
    const body = reportBody("misread", {
      app: null,
      gameData: null,
      resolution: null,
      reader: "Tesseract",
      mode: "watch",
      echo: { candidate: candidate("Equipped by Cl0ver"), field: "equippedBy" },
      note: "Clover's echo",
      includeSetup: false,
    });
    expect(body).not.toMatch(/cl[o0]ver/i);
    expect(body).toContain("<player name>");
  });
});
