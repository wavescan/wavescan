import { describe, expect, it } from "vitest";
import { CONFIRMATION_PHRASE, runInputTest, type InputTestDeps } from "@/diagnostics/inputTest";
import { readFileSync } from "node:fs";

const targets = [
  { x: 0.1, y: 0.4 },
  { x: 0.2, y: 0.4 },
];

/** Fake deps that record calls and return scripted panel text. */
function fakeDeps(panels: string[], overrides: Partial<InputTestDeps> = {}) {
  const calls: string[] = [];
  let read = 0;
  const deps: InputTestDeps = {
    arm: async (phrase) => {
      calls.push(`arm:${phrase}`);
    },
    focusGame: async () => {
      calls.push("focus");
    },
    click: async (t) => {
      calls.push(`click:${t.x}`);
    },
    disarm: async () => {
      calls.push("disarm");
    },
    readPanel: async () => panels[Math.min(read++, panels.length - 1)] ?? "",
    sleep: async () => undefined,
    errorMessage: (e) => String(e),
    ...overrides,
  };
  return { deps, calls };
}

describe("click test", () => {
  it("passes when the panel text changes after a click, and always disarms", async () => {
    const { deps, calls } = fakeDeps(["Sabercat Prowler", "Hecate", "Hecate"]);
    const result = await runInputTest(deps, CONFIRMATION_PHRASE, targets);
    expect(result.outcome).toBe("panel-changed");
    expect(result.clicks).toBe(2);
    expect(calls).toEqual([
      "arm:I understand",
      "focus",
      "click:0.1",
      "click:0.2",
      "disarm",
    ]);
  });

  it("reports no-change (with admin advice) when clicks have no effect", async () => {
    const { deps } = fakeDeps(["Same", "Same", "Same"]);
    const result = await runInputTest(deps, CONFIRMATION_PHRASE, targets);
    expect(result.outcome).toBe("no-change");
    expect(result.detail).toMatch(/needs Wavescan to run as administrator/);
  });

  it("stops at the first error, reports it, and still disarms", async () => {
    const { deps, calls } = fakeDeps(["A", "B"], {
      click: async () => {
        throw "auto mode stopped: the mouse was moved";
      },
    });
    const result = await runInputTest(deps, CONFIRMATION_PHRASE, targets);
    expect(result).toEqual({
      outcome: "error",
      detail: "auto mode stopped: the mouse was moved",
      clicks: 0,
    });
    expect(calls.at(-1)).toBe("disarm");
  });

  it("uses the same confirmation phrase as the Rust safety module", () => {
    const rust = readFileSync("src-tauri/src/safety.rs", "utf8");
    expect(rust).toContain(`pub const CONFIRMATION_PHRASE: &str = "${CONFIRMATION_PHRASE}";`);
  });
});
