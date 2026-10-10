import { beforeAll, describe, expect, it } from "vitest";
import { getScannerEcho, scannerGameData } from "@wutheringtools/scanner-core";
import { loadBundledScannerData, setName } from "@/data/scannerData";
import { extractEcho } from "@/session/echoExtract";
import type { EchoCandidate } from "@/session/echoSession";
import { toScanEcho } from "@/session/exportScan";
import {
  confirmField,
  displayName,
  fixEcho,
  fixLevel,
  fixMainStat,
  fixRank,
  fixSet,
  fixSubstatValue,
  flaggedFields,
  legalSubstatValues,
  mainStatOptions,
  rawReading,
  rollTier,
  setOptions,
  substatKey,
  type FieldId,
} from "@/review/fields";
import type { RegionText } from "@/ipc/types";
import { line, sabercatPanel } from "./support/echoPanels";

beforeAll(() => {
  loadBundledScannerData();
});

/** One of the sets Sabercat Prowler comes in. */
const SET = "PactofNeonlightLeap";

const candidate = (panel: RegionText[] = sabercatPanel(), index = 1): EchoCandidate => ({
  ...extractEcho(panel),
  id: `echo-${index}`,
  index,
});

/** Sabercat Prowler with its set picked, so nothing is flagged. */
const clean = () => fixSet(candidate(), SET);

/** What the export says about the same echo: its `lowConfidence`, or ["unknown"] if it's left out. */
function exported(c: EchoCandidate): string[] {
  const echo = toScanEcho(c, 1);
  return echo ? (echo.lowConfidence ?? []) : ["unknown"];
}

const withoutAtkRow = () =>
  sabercatPanel().map((r) => (r.id === "substatLabels" ? { ...r, lines: r.lines.filter((l) => l.text !== "ATK") } : r));
const withoutLevel = () => sabercatPanel().map((r) => (r.id === "level" ? { ...r, lines: [line("+?", 0)] } : r));
/** The last substat (ATK) read as a flat 45, which isn't a legal flat ATK roll. */
const withFlatAtk = () =>
  sabercatPanel().map((r) =>
    r.id === "substatValues" ? { ...r, lines: r.lines.map((l) => (l.bounds.y === 158 ? { ...l, text: "45" } : l)) } : r,
  );

describe("flaggedFields", () => {
  it("flags the set when the echo comes in several and the icon wasn't matched", () => {
    expect(getScannerEcho("SabercatProwler").sets?.length).toBeGreaterThan(1);
    expect(flaggedFields(candidate())).toEqual(["set"]);
    expect(flaggedFields(clean())).toEqual([]);
  });

  it("flags a substat value the game can't roll", () => {
    const c = fixSet(candidate(sabercatPanel("17.5%")), SET);
    expect(flaggedFields(c)).toEqual(["substat.0"]);
    // scanner-core snaps the misread to the nearest legal roll, and flags it.
    expect(c.slot.substats[0]?.subStatValue).toBe("17.4%");
  });

  it("flags a missing level and a short substat list", () => {
    expect(flaggedFields(fixSet(candidate(withoutLevel()), SET))).toContain("level");
    expect(flaggedFields(fixSet(candidate(withoutAtkRow()), SET))).toContain("substats");
  });

  it("flags an unknown echo by name", () => {
    const c = clean();
    const unknown = { ...c, slot: { ...c.slot, echo: null } };
    expect(flaggedFields(unknown)).toContain("name");
    expect(displayName(unknown)).toBe('Unknown ("Sabercat Prowler")');
  });

  it("agrees with the export: flagged exactly when the export marks something", () => {
    const cases = [
      candidate(),
      clean(),
      fixSet(candidate(sabercatPanel("17.5%")), SET),
      candidate(withoutLevel()),
      candidate(withoutAtkRow()),
      fixSet(candidate(withFlatAtk()), SET),
      { ...clean(), slot: { ...clean().slot, echo: null } },
    ];
    for (const c of cases) {
      expect(flaggedFields(c).length > 0, JSON.stringify(exported(c))).toBe(exported(c).length > 0);
    }
  });
});

describe("fixes", () => {
  it("offers only legal rolls and fixes a misread substat", () => {
    const c = fixSet(candidate(sabercatPanel("17.5%")), SET);
    expect(substatKey(c, 0)).toBe("CritDMG");
    expect(legalSubstatValues("CritDMG")).toEqual([12.6, 13.8, 15, 16.2, 17.4, 18.6, 19.8, 21]);
    expect(() => fixSubstatValue(c, 0, 17.5)).toThrow(/can roll/);

    const fixed = fixSubstatValue(c, 0, 18.6);
    expect(fixed.slot.substats[0]?.subStatValue).toBe("18.6%");
    expect(flaggedFields(fixed)).toEqual([]);
    expect(exported(fixed)).toEqual([]);
    expect(toScanEcho(fixed, 1)?.substats[0]).toEqual({ type: "CritDMG", value: 18.6 });
    expect(fixed.checked).toEqual(["set", "substat.0"]);
    // The original is untouched.
    expect(c.slot.substats[0]?.subStatValue).toBe("17.4%");
  });

  it("accepts a flagged value as read", () => {
    const c = fixSet(candidate(sabercatPanel("17.5%")), SET);
    const ok = confirmField(c, "substat.0");
    expect(flaggedFields(ok)).toEqual([]);
    expect(exported(ok)).toEqual([]);
  });

  it("writes flat substats as whole numbers", () => {
    const c = fixSet(candidate(withFlatAtk()), SET);
    const index = c.slot.substats.findIndex((_, i) => substatKey(c, i) === "ATK_FLAT");
    expect(index).toBeGreaterThan(-1);
    expect(flaggedFields(c)).toContain(`substat.${index}`);
    const fixed = fixSubstatValue(c, index, 40);
    expect(fixed.slot.substats[index]?.subStatValue).toBe("40");
    expect(toScanEcho(fixed, 1)?.substats).toContainEqual({ type: "ATK_FLAT", value: 40 });
  });

  it("confirming a short substat list clears the export flag", () => {
    const c = fixSet(candidate(withoutAtkRow()), SET);
    expect(exported(c)).toContain("substats");
    const ok = confirmField(c, "substats");
    expect(flaggedFields(ok)).toEqual([]);
    expect(exported(ok)).not.toContain("substats");
  });

  it("sets level and rarity within range", () => {
    const c = fixSet(candidate(withoutLevel()), SET);
    expect(() => fixLevel(c, 26)).toThrow();
    const fixed = fixLevel(c, 25);
    expect(fixed.level).toBe(25);
    expect(flaggedFields(fixed)).not.toContain("level");
    expect(fixRank(fixed, 5).rank).toBe(5);
    expect(() => fixRank(fixed, 6)).toThrow();
  });

  it("picks an echo; its cost comes with it, and the set is asked again if it no longer fits", () => {
    const c = clean();
    const unknown = { ...c, slot: { ...c.slot, echo: null } };
    const fixed = fixEcho(unknown, "SabercatProwler");
    expect(fixed.slot.echo).toBe("SabercatProwler");
    expect(Number(fixed.slot.cost)).toBe(3);
    expect(fixed.slot.set).toBe(SET);
    expect(flaggedFields(fixed)).toEqual([]);
    expect(() => fixEcho(unknown, "NotAnEcho")).toThrow(/unknown echo/);

    const other = Object.values(scannerGameData().echoes).find(
      (e) => (e.sets?.length ?? 0) > 1 && !e.sets?.includes(SET),
    );
    const moved = fixEcho(unknown, other!.key);
    expect(moved.slot.set).toBeNull();
    expect(flaggedFields(moved)).toContain("set");

    const oneSet = Object.values(scannerGameData().echoes).find((e) => e.sets?.length === 1);
    const picked = fixEcho(unknown, oneSet!.key);
    expect(picked.slot.set).toBe(oneSet!.sets![0]);
    expect(picked.checked).toEqual(expect.arrayContaining(["name", "set"]));
  });

  it("changes the main stat to one the cost allows", () => {
    expect(mainStatOptions(3)).toContain("Fusion");
    const fixed = fixMainStat(clean(), "ATK");
    expect(fixed.slot.mainStatLabel).toBe("ATK");
    expect(toScanEcho(fixed, 1)?.stat).toBe("ATK");
  });

  it("offers the sets the echo comes in, with their names", () => {
    expect(setOptions(candidate(), [])).toEqual(getScannerEcho("SabercatProwler").sets);
    expect(setName(SET)).toBe("Pact of Neonlight Leap");
  });
});

describe("rollTier", () => {
  it("places a value among the legal rolls", () => {
    expect(rollTier("CritDMG", 12.6)).toEqual({ tier: 1, of: 8 });
    expect(rollTier("CritDMG", 21)).toEqual({ tier: 8, of: 8 });
    expect(rollTier("ATK_FLAT", 40)).toEqual({ tier: 2, of: 4 });
    expect(rollTier("CritDMG", 17.5)).toBeNull();
    expect(rollTier(null, 10)).toBeNull();
  });
});

it("gives the raw text behind each field it keeps", () => {
  const fields: FieldId[] = ["name", "set", "mainStat", "level", "rank", "substats", "substat.0"];
  expect(fields.map((f) => rawReading(clean(), f))).toEqual([
    "Sabercat Prowler",
    null,
    "Fusion DMG Bonus 30.0%",
    "+25",
    "Fusion DMG Bonus 30.0%",
    null,
    null,
  ]);
});
