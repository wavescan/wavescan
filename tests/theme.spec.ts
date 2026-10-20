import { afterEach, describe, expect, it } from "vitest";
import type { KeyValueStorage } from "@/review/scanStore";
import { DEFAULT_THEME, parseTheme, setTheme, theme, THEME_KEY, themeName, useThemeStorage } from "@/settings/theme";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

afterEach(() => useThemeStorage(null));

describe("themeName", () => {
  it("names the daisyUI theme for a scheme and mode", () => {
    expect(themeName({ scheme: "glass", mode: "dark" }, false)).toBe("wavescan-glass-dark");
    expect(themeName({ scheme: "solaris", mode: "light" }, true)).toBe("wavescan-solaris-light");
  });

  it("follows the computer's setting in system mode", () => {
    expect(themeName({ scheme: "jade", mode: "system" }, true)).toBe("wavescan-jade-dark");
    expect(themeName({ scheme: "jade", mode: "system" }, false)).toBe("wavescan-jade-light");
  });
});

describe("parseTheme", () => {
  it("defaults to Echo Glass, dark", () => {
    expect(DEFAULT_THEME).toEqual({ scheme: "glass", mode: "dark" });
    expect(parseTheme(null)).toEqual(DEFAULT_THEME);
  });

  it("reads a saved choice", () => {
    expect(parseTheme('{"scheme":"jade","mode":"system"}')).toEqual({ scheme: "jade", mode: "system" });
  });

  it("falls back per part for unknown or damaged values", () => {
    expect(parseTheme('{"scheme":"neon","mode":"light"}')).toEqual({ scheme: "glass", mode: "light" });
    expect(parseTheme('{"scheme":"solaris"}')).toEqual({ scheme: "solaris", mode: "dark" });
    expect(parseTheme("not json")).toEqual(DEFAULT_THEME);
    expect(parseTheme("[1,2]")).toEqual(DEFAULT_THEME);
  });
});

describe("saving the choice", () => {
  it("loads what was saved and saves changes on this PC", () => {
    const storage = memoryStorage({ [THEME_KEY]: '{"scheme":"solaris","mode":"light"}' });
    useThemeStorage(storage);
    expect(theme()).toEqual({ scheme: "solaris", mode: "light" });

    setTheme({ mode: "dark" });
    expect(theme()).toEqual({ scheme: "solaris", mode: "dark" });
    expect(JSON.parse(storage.data[THEME_KEY] ?? "")).toEqual({ scheme: "solaris", mode: "dark" });
  });

  it("still changes the look when storage is blocked", () => {
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    useThemeStorage(blocked);
    expect(theme()).toEqual(DEFAULT_THEME);
    setTheme({ scheme: "jade" });
    expect(theme().scheme).toBe("jade");
  });
});
