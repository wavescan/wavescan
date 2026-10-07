import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

// The scan schema is the contract with the Wuthering Tools web app (ADR 0008).
// These tests pin down what it accepts and, just as importantly, what it rejects.

const schema = JSON.parse(readFileSync("schema/scan.v1.json", "utf8"));
const example = JSON.parse(readFileSync("schema/examples/scan.example.json", "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("scan.v1.json", () => {
  it("accepts the documented example", () => {
    expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
  });

  it("rejects unknown top-level fields (no accidental data in exports)", () => {
    const scan = { ...clone(example), userId: "501055687" };
    expect(validate(scan)).toBe(false);
  });

  it("rejects account identifiers smuggled into meta", () => {
    const scan = clone(example);
    scan.meta.uid = "501055687";
    expect(validate(scan)).toBe(false);
  });

  it("rejects more than 5 substats", () => {
    const scan = clone(example);
    const sub = { type: "CritRate", value: 6.3 };
    scan.echoes[0].substats = [sub, sub, sub, sub, sub, sub];
    expect(validate(scan)).toBe(false);
  });

  it("rejects levels above +25 and invalid costs", () => {
    const tooHigh = clone(example);
    tooHigh.echoes[0].level = 26;
    expect(validate(tooHigh)).toBe(false);

    const badCost = clone(example);
    badCost.echoes[0].cost = 2;
    expect(validate(badCost)).toBe(false);
  });

  it("accepts an unknown rarity as null, but not an out-of-range one", () => {
    const unknown = clone(example);
    unknown.echoes[0].rank = null;
    unknown.echoes[0].lowConfidence = ["rank"];
    expect(validate(unknown), JSON.stringify(validate.errors)).toBe(true);

    const tooHigh = clone(example);
    tooHigh.echoes[0].rank = 6;
    expect(validate(tooHigh)).toBe(false);
  });

  it("rejects display names where registry keys are required", () => {
    const scan = clone(example);
    scan.echoes[0].echo = "Bell-Borne Geochelone";
    expect(validate(scan)).toBe(false);
  });

  it("accepts characters and weapons as optional, forward-compatible sections", () => {
    const scan = clone(example);
    scan.characters = [
      {
        key: "Rebecca",
        level: 90,
        resonanceChain: 2,
        talents: { basic: 10, skill: 10, forte: 10, liberation: 10, intro: 10 },
        echoes: ["scan-echo-1", null, null, null, null],
      },
    ];
    scan.weapons = [];
    expect(validate(scan), JSON.stringify(validate.errors)).toBe(true);
  });
});
