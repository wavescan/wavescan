import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadBundledScannerData } from "@/data/scannerData";
import { extractEcho } from "@/session/echoExtract";
import { newIssueUrl, MAX_URL_BODY, reportBody, reportTitle, type ReportContext } from "@/feedback/issue";
import { ALLOWED_URL_PREFIXES, isAllowedUrl, issueSearchUrl, REPO_URL, sourceUrl } from "@/feedback/links";
import { problemForAutoStop, problemForError } from "@/feedback/problems";
import type { AutoScanStop } from "@/auto/autoScan";
import { readinessItems, readinessSummary } from "@/setup/readiness";
import { searchTopics } from "@/help/troubleshooting";
import type { AppInfo, GameWindow } from "@/ipc/types";
import { rgbToRgba } from "@/ui/setIconUrl";
import { sabercatPanel } from "./support/echoPanels";

beforeAll(() => {
  loadBundledScannerData();
});

const app: AppInfo = { name: "Wavescan", version: "0.1.0", platform: "windows", build: "269ae79", elevated: false };

describe("links", () => {
  it("only allows the repository's pages and the Fair Play policy", () => {
    expect(isAllowedUrl(`${REPO_URL}/issues/new?title=x`)).toBe(true);
    expect(isAllowedUrl("https://github.com/wavescan/wavescan-evil/issues")).toBe(false);
    expect(isAllowedUrl("https://github.com/someone/else")).toBe(false);
    expect(isAllowedUrl("https://example.com")).toBe(false);
    expect(isAllowedUrl("file:///C:/Windows")).toBe(false);
  });

  it("matches the opener scope in the Tauri capability (ADR 0028)", () => {
    const capability = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8")) as {
      permissions: (string | { identifier: string; allow: { url: string }[] })[];
    };
    const opener = capability.permissions.find(
      (p): p is { identifier: string; allow: { url: string }[] } => typeof p === "object" && p.identifier === "opener:allow-open-url",
    );
    const scoped = opener?.allow.map((a) => a.url.replace(/\*$/, "")) ?? [];
    expect(scoped).toEqual([...ALLOWED_URL_PREFIXES]);
    expect(capability.permissions).not.toContain("opener:default");
  });

  it("points at the exact source of a CI build, or main for a local one", () => {
    expect(sourceUrl("269ae79")).toBe(`${REPO_URL}/tree/269ae79`);
    expect(sourceUrl(null)).toBe(`${REPO_URL}/tree/main`);
    expect(sourceUrl("../evil")).toBe(`${REPO_URL}/tree/main`);
    expect(isAllowedUrl(issueSearchUrl("Crit. DMG"))).toBe(true);
  });
});

describe("issue reports", () => {
  const candidate = () => ({ ...extractEcho(sabercatPanel("17.5%")), id: "watch-35", index: 35 });
  const context = (over: Partial<ReportContext> = {}): ReportContext => ({
    app,
    gameData: { hash: "6f2a91c0".padEnd(64, "0"), version: 1, echoes: 412, characters: 40 },
    resolution: { width: 2560, height: 1440 },
    reader: "Tesseract",
    mode: "watch",
    echo: { candidate: candidate(), field: "substat.0" },
    note: "the game shows 18.6%",
    includeSetup: true,
    ...over,
  });

  it("describes a misread with what was read and the setup", () => {
    expect(reportTitle("misread", context())).toBe("Misread: Crit. DMG on Sabercat Prowler");
    const body = reportBody("misread", context());
    expect(body).toContain("the game shows 18.6%");
    expect(body).toContain('Read as name: "Sabercat Prowler"');
    expect(body).toContain("Scan #35");
    expect(body).toContain("Wavescan 0.1.0 (build 269ae79)");
    expect(body).toContain("2560×1440");
    expect(body).not.toMatch(/user ?id/i);
  });

  it("leaves the setup out when unticked", () => {
    expect(reportBody("idea", context({ includeSetup: false, echo: null }))).not.toContain("### Setup");
  });

  it("builds a GitHub new-issue link, cutting very long reports", () => {
    const short = newIssueUrl("Misread: x", "body & more");
    expect(short.truncated).toBe(false);
    expect(short.url.startsWith(`${REPO_URL}/issues/new?`)).toBe(true);
    expect(new URL(short.url).searchParams.get("body")).toBe("body & more");
    expect(isAllowedUrl(short.url)).toBe(true);

    const long = newIssueUrl("t", "x".repeat(MAX_URL_BODY + 500));
    expect(long.truncated).toBe(true);
    expect(new URL(long.url).searchParams.get("body")).toContain("cut short");
  });
});

describe("problems", () => {
  it("explains common errors with steps", () => {
    expect(problemForError("WindowNotFound", "x", "windows")).toMatchObject({ title: "Wuthering Waves isn't running", tone: "warn" });
    expect(problemForError("InputBlocked", "x", "windows").steps.join(" ")).toMatch(/administrator/);
    expect(problemForError("InputBlocked", "x", "macos").steps.join(" ")).toMatch(/Accessibility/);
    expect(problemForError("PermissionDenied", "screen", "macos").steps.join(" ")).toMatch(/Screen Recording/);
    const unknown = problemForError(null, "something odd", null);
    expect(unknown).toMatchObject({ cause: "something odd", reportable: true });
  });

  it("covers every way an auto scan can end", () => {
    const reasons: AutoScanStop[] = [
      "end-of-list",
      "below-min-level",
      "stopped",
      "aborted",
      "unsupported-shape",
      "grid-not-found",
      "clicks-not-landing",
      "lost-track",
      "not-started",
    ];
    for (const reason of reasons) {
      const problem = problemForAutoStop(reason, "detail.", 12);
      expect(problem.title.length).toBeGreaterThan(0);
    }
    expect(problemForAutoStop("end-of-list", "Done.", 30).tone).toBe("success");
    expect(problemForAutoStop("lost-track", "It moved 1.4 rows.", 212).cause).toContain("212 echoes");
  });
});

describe("readiness", () => {
  const window = (width: number, height: number, minimized = false): GameWindow => ({
    id: 1,
    client_rect: { x: 0, y: 0, width, height },
    scale_factor: 1,
    focused: true,
    minimized,
  });

  it("checks only what it can see", () => {
    const items = readinessItems({ ok: true, value: window(2560, 1440) }, app);
    expect(items.map((i) => [i.id, i.status])).toEqual([
      ["game", "ok"],
      ["visible", "ok"],
      ["shape", "ok"],
      ["admin", "todo"],
    ]);
    expect(readinessSummary(items)).toEqual({ ready: 3, total: 3 });
  });

  it("says what to do when the game is missing, minimised or the wrong shape", () => {
    expect(readinessItems({ ok: false, kind: "WindowNotFound", message: "x" }, null)[0]).toMatchObject({
      status: "todo",
      detail: "Start Wuthering Waves",
    });
    expect(readinessItems({ ok: true, value: window(2560, 1440, true) }, null).map((i) => i.id)).toEqual(["game", "visible"]);
    expect(readinessItems({ ok: true, value: window(3440, 1440) }, null)[2]).toMatchObject({ id: "shape", status: "todo" });
  });

  it("doesn't list the administrator check on macOS", () => {
    const mac = { ...app, platform: "macos" as const, elevated: null };
    expect(readinessItems(null, mac).map((i) => i.id)).toEqual(["game"]);
  });
});

describe("troubleshooting", () => {
  it("finds topics by any word and hides other platforms' topics", () => {
    expect(searchTopics("hdr", "windows").map((t) => t.id)).toEqual(["layout"]);
    expect(searchTopics("", "windows").some((t) => t.id === "black")).toBe(false);
    expect(searchTopics("", "macos").some((t) => t.id === "admin")).toBe(false);
    expect(searchTopics("administrator", "windows").map((t) => t.id)).toContain("admin");
  });
});

it("turns a set icon's RGB bytes into opaque RGBA", () => {
  const rgba = rgbToRgba({ width: 2, height: 1, data: new Uint8Array([1, 2, 3, 4, 5, 6]) });
  expect([...rgba]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
});
