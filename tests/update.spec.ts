import { describe, expect, it } from "vitest";
import { releaseUrl } from "@/feedback/links";
import type { KeyValueStorage } from "@/review/scanStore";
import { createUpdater, decideAtLaunch, OFFERED_KEY, updateStatusText, type AvailableUpdate, type UpdaterDeps } from "@/update/updater";
import { channelOf, compareVersions, isVersion } from "@/update/version";

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

/** A fake update that records what happened to it. */
function fakeUpdate(version: string, opts: { minimumVersion?: string; failDownload?: boolean; failInstall?: boolean } = {}) {
  const log: string[] = [];
  const update: AvailableUpdate = {
    version,
    notes: "Fixes",
    minimumVersion: opts.minimumVersion ?? null,
    download(onProgress) {
      log.push("download");
      if (opts.failDownload) return Promise.reject(new Error("offline"));
      onProgress(50, 100);
      onProgress(100, 100);
      return Promise.resolve();
    },
    install() {
      log.push("install");
      return opts.failInstall ? Promise.reject(new Error("installer failed")) : Promise.resolve();
    },
  };
  return { update, log };
}

function deps(overrides: Partial<UpdaterDeps> = {}): UpdaterDeps & { relaunched: () => number } {
  let relaunches = 0;
  return {
    installed: "0.2.0",
    enabled: true,
    check: () => Promise.resolve(null),
    relaunch: () => {
      relaunches++;
      return Promise.resolve();
    },
    storage: memoryStorage(),
    now: () => new Date("2026-10-16T12:00:00Z"),
    isBusy: () => false,
    ...overrides,
    relaunched: () => relaunches,
  };
}

describe("versions", () => {
  it("orders releases and tester builds by semver", () => {
    const ordered = ["0.1.0", "0.1.1-tester.9", "0.1.1-tester.10", "0.1.1", "0.2.0-tester.1", "0.2.0", "1.0.0"];
    for (let i = 1; i < ordered.length; i++) {
      expect(compareVersions(ordered[i - 1]!, ordered[i]!)).toBeLessThan(0);
      expect(compareVersions(ordered[i]!, ordered[i - 1]!)).toBeGreaterThan(0);
    }
    expect(compareVersions("v0.2.0", "0.2.0")).toBe(0);
    expect(compareVersions("0.2.0-tester.10", "0.2.0-tester.9")).toBeGreaterThan(0); // numbers, not text
  });

  it("treats an unreadable version as the oldest", () => {
    expect(isVersion("latest")).toBe(false);
    expect(compareVersions("latest", "0.0.1")).toBeLessThan(0);
    expect(compareVersions("0.0.1", "latest")).toBeGreaterThan(0);
  });

  it("knows a tester build from a release", () => {
    expect(channelOf("0.2.1-tester.57")).toBe("tester");
    expect(channelOf("0.2.1")).toBe("stable");
    expect(channelOf("0.0.1")).toBe("stable");
  });

  it("links each version to what's new in it", () => {
    expect(releaseUrl("0.2.0")).toBe("https://github.com/wavescan/wavescan/releases/tag/v0.2.0");
    expect(releaseUrl("0.2.1-tester.57")).toBe("https://github.com/wavescan/wavescan/releases/tag/tester-build");
  });
});

describe("decideAtLaunch", () => {
  const update = { version: "0.3.0", minimumVersion: null };

  it("offers a newly found update", () => {
    expect(decideAtLaunch("0.2.0", update, null)).toEqual({ decision: "offer", required: false });
  });

  it("installs at launch an update that was offered last time", () => {
    expect(decideAtLaunch("0.2.0", update, "0.3.0")).toEqual({ decision: "installNow", required: false });
    // An even newer one than last time's offer still counts: the user sat on an update.
    expect(decideAtLaunch("0.2.0", { ...update, version: "0.3.1" }, "0.3.0").decision).toBe("installNow");
  });

  it("forgets an offer once that version (or newer) is installed", () => {
    expect(decideAtLaunch("0.3.0", { ...update, version: "0.3.1" }, "0.3.0").decision).toBe("offer");
  });

  it("installs at once, without a choice, when this version is below the minimum", () => {
    expect(decideAtLaunch("0.2.0", { ...update, minimumVersion: "0.2.5" }, null)).toEqual({ decision: "installNow", required: true });
    expect(decideAtLaunch("0.2.5", { ...update, minimumVersion: "0.2.5" }, null).required).toBe(false);
    expect(decideAtLaunch("0.2.0", { ...update, minimumVersion: "soon" }, null).required).toBe(false);
  });

  it("ignores anything that isn't newer", () => {
    expect(decideAtLaunch("0.3.0", update, null).decision).toBe("none");
    expect(decideAtLaunch("0.3.0", null, "0.3.0").decision).toBe("none");
  });
});

describe("createUpdater", () => {
  it("never checks in a local build", async () => {
    let checks = 0;
    const updater = createUpdater(deps({ enabled: false, check: () => (checks++, Promise.resolve(null)) }));
    await updater.check();
    expect(checks).toBe(0);
    expect(updater.state.status).toBe("off");
    expect(updateStatusText(updater.state)).toMatch(/Local build/);
  });

  it("is up to date when nothing newer is published, and forgets old offers", async () => {
    const d = deps({ storage: memoryStorage({ [OFFERED_KEY]: "0.2.0" }) });
    const updater = createUpdater(d);
    await updater.check();
    expect(updater.state.status).toBe("current");
    expect(updater.state.checkedAt).toBe("2026-10-16T12:00:00.000Z");
    expect(d.storage?.getItem(OFFERED_KEY)).toBeNull();
    expect(updateStatusText(updater.state)).toBe("Up to date (gets releases).");
  });

  it("downloads a new update in the background and offers a restart", async () => {
    const { update, log } = fakeUpdate("0.3.0");
    const d = deps({ check: () => Promise.resolve(update) });
    const updater = createUpdater(d);
    await updater.check();
    expect(log).toEqual(["download"]);
    expect(updater.state).toMatchObject({ status: "ready", version: "0.3.0", progress: 1, atLaunch: false });
    expect(d.storage?.getItem(OFFERED_KEY)).toBe("0.3.0");

    await updater.install();
    expect(log).toEqual(["download", "install"]);
    expect(d.relaunched()).toBe(1);
  });

  it("installs at the next launch when the offer was ignored", async () => {
    const { update, log } = fakeUpdate("0.3.0");
    const updater = createUpdater(deps({ check: () => Promise.resolve(update), storage: memoryStorage({ [OFFERED_KEY]: "0.3.0" }) }));
    await updater.check();
    expect(log).toEqual(["download", "install"]);
    expect(updater.state.atLaunch).toBe(true);
  });

  it("never installs while a scan runs", async () => {
    let busy = true;
    const { update, log } = fakeUpdate("0.3.0");
    const updater = createUpdater(
      deps({ check: () => Promise.resolve(update), storage: memoryStorage({ [OFFERED_KEY]: "0.3.0" }), isBusy: () => busy }),
    );
    await updater.check();
    expect(log).toEqual(["download"]);
    expect(updater.state.status).toBe("ready");
    await updater.install();
    expect(log).toEqual(["download"]);

    busy = false;
    await updater.install();
    expect(log).toEqual(["download", "install"]);
  });

  it("lets the user put off a launch install for this session", async () => {
    let finish!: () => void;
    const { update, log } = fakeUpdate("0.3.0");
    update.download = () => new Promise<void>((resolve) => (finish = resolve));
    const updater = createUpdater(deps({ check: () => Promise.resolve(update), storage: memoryStorage({ [OFFERED_KEY]: "0.3.0" }) }));
    const checking = updater.check();
    await Promise.resolve();
    expect(updater.state.atLaunch).toBe(true);
    updater.postpone();
    finish();
    await checking;
    expect(log).toEqual([]);
    expect(updater.state).toMatchObject({ status: "ready", atLaunch: false });
  });

  it("can't put off a required update unless it failed", async () => {
    const { update } = fakeUpdate("0.3.0", { minimumVersion: "0.2.5", failInstall: true });
    let finish!: () => void;
    const download = update.download.bind(update);
    update.download = (onProgress) => new Promise<void>((resolve) => (finish = () => void download(onProgress).then(resolve)));
    const updater = createUpdater(deps({ check: () => Promise.resolve(update) }));
    const checking = updater.check();
    await Promise.resolve();
    updater.postpone();
    expect(updater.state.atLaunch).toBe(true);

    finish();
    await checking;
    expect(updater.state).toMatchObject({ status: "failed", required: true, atLaunch: true });
    expect(updater.state.problem).toMatch(/installer failed/);
    updater.postpone();
    expect(updater.state.atLaunch).toBe(false);
  });

  it("reports a failed check or download and tries again on request", async () => {
    let online = false;
    const { update } = fakeUpdate("0.3.0");
    const updater = createUpdater(
      deps({ check: () => (online ? Promise.resolve(update) : Promise.reject(new Error("no internet"))) }),
    );
    await updater.check();
    expect(updater.state.status).toBe("failed");
    expect(updateStatusText(updater.state)).toBe("couldn't check for updates: no internet Wavescan tries again next launch.");

    online = true;
    await updater.retry();
    expect(updater.state.status).toBe("ready");

    const broken = fakeUpdate("0.3.0", { failDownload: true });
    const second = createUpdater(deps({ check: () => Promise.resolve(broken.update) }));
    await second.check();
    expect(second.state.problem).toBe("couldn't download the update: offline");
  });

  it("shows the tester channel for tester builds", async () => {
    const updater = createUpdater(deps({ installed: "0.2.1-tester.57" }));
    await updater.check();
    expect(updater.state.channel).toBe("tester");
    expect(updateStatusText(updater.state)).toBe("Up to date (gets tester builds).");
  });
});
