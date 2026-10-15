import { createHash, createPublicKey } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { matchEchoName, scannerGameData } from "@wutheringtools/scanner-core";
import bundledAssets from "@/data/scanner-assets.json";
import bundledData from "@/data/scanner-data.json";
import trustedKeys from "@/data/trusted-keys.json";
import { checkSignature, signingPayload, type SignedFields } from "@/data/signature";
import { downloadGameData, SCANNER_DATA_URL, type DownloadDeps } from "@/data/gameDataDownload";
import { loadSavedGameData, SAVED_ASSETS_KEY, SAVED_DATA_KEY, saveGameData } from "@/data/savedGameData";
import { isNewer, refreshGameData, startGameData, whenNotScanning, type GameDataDeps } from "@/data/gameData";
import { describeGameData, gameDataStatus, loadBundledScannerData } from "@/data/scannerData";
import { echoIconUrl } from "@/data/echoIcons";
import { navigation } from "@/ui/navigation";
import { assetsFile, fakeFetch, KEY_ID, signedDataFile, TEST_KEYS } from "./support/signedGameData";

const ASSETS_URL = "https://www.wutheringtools.com/scanner-assets.json";
const verify = (file: SignedFields) => checkSignature(file, TEST_KEYS);
const bundledHashes = { dataHash: bundledData.hash, assetsHash: bundledAssets.hash };

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function download(files: Record<string, unknown>, current = bundledHashes) {
  const fake = fakeFetch(files);
  const deps: DownloadDeps = { fetchText: fake.fetchText, checkSignature: verify };
  return { result: downloadGameData(current, deps), calls: fake.calls };
}

afterEach(() => {
  navigation.busy = false;
  loadBundledScannerData();
});

describe("signature", () => {
  it("builds the same text Wuthering Tools signs", () => {
    const file = signedDataFile();
    expect(signingPayload(file)).toBe(
      ["WutheringToolsScannerData", "1", file.publishedAt, file.hash, file.assets?.hash].join("\n"),
    );
  });

  it("accepts a file signed with a trusted key", async () => {
    expect(await verify(signedDataFile())).toBeNull();
  });

  it("rejects unsigned files, unknown keys and changed content", async () => {
    expect(await verify(signedDataFile({ sign: false }))).toMatch(/isn't signed/);
    expect(await checkSignature(signedDataFile(), {})).toMatch(/doesn't know/);
    const tampered = { ...signedDataFile(), hash: "0".repeat(64) };
    expect(await verify(tampered)).toMatch(/doesn't match/);
    const moved = signedDataFile();
    expect(await verify({ ...moved, assets: { hash: "1".repeat(64) } })).toMatch(/doesn't match/);
    expect(await verify({ ...moved, publishedAt: "2031-01-01T00:00:00.000Z" })).toMatch(/doesn't match/);
  });

  it("trusts only well-formed P-256 keys, each under its own id", () => {
    const entries = Object.entries(trustedKeys.keys as Record<string, string>);
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, spki] of entries) {
      const der = Buffer.from(spki, "base64");
      const key = createPublicKey({ key: der, format: "der", type: "spki" });
      expect(key.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
      expect(createHash("sha256").update(der).digest("hex").slice(0, 16)).toBe(id);
    }
  });

  it("ships with no keys but the real ones (none from tests)", async () => {
    // The built-in keys never include the test key.
    expect(await checkSignature(signedDataFile())).toMatch(/doesn't know/);
    expect(KEY_ID).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("downloadGameData", () => {
  it("says current when Wuthering Tools publishes what's in use", async () => {
    const { result, calls } = download({ [SCANNER_DATA_URL]: signedDataFile() });
    expect(await result).toMatchObject({ kind: "current" });
    expect(calls).toEqual([SCANNER_DATA_URL]);
  });

  it("returns newer data, without downloading pictures that didn't change", async () => {
    const { result, calls } = download({ [SCANNER_DATA_URL]: signedDataFile({ rename: "Sabercat Renamed" }) });
    const outcome = await result;
    expect(outcome.kind).toBe("updated");
    if (outcome.kind !== "updated") return;
    expect(outcome.data.data.echoes.SabercatProwler?.name).toBe("Sabercat Renamed");
    expect(outcome.assets).toBeNull();
    expect(calls).toEqual([SCANNER_DATA_URL]);
  });

  it("downloads the pictures when the signed data names new ones", async () => {
    const assets = assetsFile(true);
    const { result, calls } = download({
      [SCANNER_DATA_URL]: signedDataFile({ assets }),
      [ASSETS_URL]: assets,
    });
    const outcome = await result;
    expect(outcome.kind).toBe("updated");
    if (outcome.kind !== "updated") return;
    expect(outcome.assets?.file.hash).toBe(assets.hash);
    expect(calls).toEqual([SCANNER_DATA_URL, ASSETS_URL]);
  });

  it("refuses pictures that don't match the signed hash", async () => {
    const named = assetsFile(true);
    const served = assetsFile(true);
    served.data.echoIcons.icons.AbyssalGladius = "data:image/webp;base64,BBBB"; // hash left as named
    const { result } = download({ [SCANNER_DATA_URL]: signedDataFile({ assets: named }), [ASSETS_URL]: served });
    expect(await result).toEqual({ kind: "failed", reason: expect.stringMatching(/pictures don't match/) as string });
  });

  it("refuses data whose content doesn't match its hash", async () => {
    const file = signedDataFile({ rename: "Signed Name" });
    file.data.echoes.SabercatProwler!.name = "Swapped After Signing";
    const { result } = download({ [SCANNER_DATA_URL]: file });
    expect(await result).toEqual({ kind: "failed", reason: expect.stringMatching(/doesn't match its hash/) as string });
  });

  it("refuses unsigned or wrongly signed data", async () => {
    const unsigned = download({ [SCANNER_DATA_URL]: signedDataFile({ rename: "X", sign: false }) });
    expect(await unsigned.result).toMatchObject({ kind: "failed", reason: expect.stringMatching(/isn't signed/) as string });
  });

  it("asks for an app update when the format is newer than this build reads", async () => {
    const { result } = download({ [SCANNER_DATA_URL]: { ...signedDataFile(), version: 2 } });
    expect(await result).toMatchObject({ kind: "appUpdateNeeded" });
  });

  it("fails without throwing when offline, or the file is junk", async () => {
    expect(await download({}).result).toMatchObject({ kind: "failed", reason: expect.stringMatching(/network/) as string });
    expect(await download({ [SCANNER_DATA_URL]: "<html>" }).result).toMatchObject({ kind: "failed" });
  });

  it("only fetches pictures from next to scanner-data.json", async () => {
    const file = signedDataFile({ assets: assetsFile(true) });
    const { result, calls } = download({ [SCANNER_DATA_URL]: { ...file, assets: { ...file.assets, file: "../evil.json" } } });
    expect((await result).kind).toBe("failed"); // the signature no longer matches either
    expect(calls).toEqual([SCANNER_DATA_URL]);
  });
});

describe("saved game data", () => {
  it("round-trips data and pictures", async () => {
    const storage = memoryStorage();
    const assets = assetsFile(true);
    saveGameData(storage, signedDataFile({ assets }), assets);
    const saved = await loadSavedGameData(storage, verify);
    expect(saved?.data.hash).toBe(signedDataFile({ assets }).hash);
    expect(saved?.assets?.file.hash).toBe(assets.hash);
  });

  it("ignores damaged copies and ones no trusted key signed", async () => {
    const storage = memoryStorage();
    storage.setItem(SAVED_DATA_KEY, "{not json");
    expect(await loadSavedGameData(storage, verify)).toBeNull();
    saveGameData(storage, signedDataFile(), null);
    expect(await loadSavedGameData(storage, (file) => checkSignature(file, {}))).toBeNull();
  });

  it("drops saved pictures that don't belong to the saved data", async () => {
    const storage = memoryStorage();
    saveGameData(storage, signedDataFile(), assetsFile(true)); // data names the bundled pictures
    expect((await loadSavedGameData(storage, verify))?.assets).toBeNull();
  });

  it("survives storage that throws", () => {
    const full = { ...memoryStorage(), setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(() => saveGameData(full, signedDataFile(), assetsFile())).not.toThrow();
  });
});

describe("startGameData and refreshGameData", () => {
  function deps(files: Record<string, unknown>, storage = memoryStorage()) {
    const pending: (() => void)[] = [];
    const value: GameDataDeps = {
      storage,
      fetchText: fakeFetch(files).fetchText,
      checkSignature: verify,
      now: () => new Date("2030-01-02T00:00:00.000Z"),
      whenIdle: (apply) => pending.push(apply),
    };
    return { value, pending, storage };
  }

  it("starts with the bundled data when nothing is saved", async () => {
    const info = await startGameData({ storage: memoryStorage(), checkSignature: verify });
    expect(info).toMatchObject({ hash: bundledData.hash, source: "built-in", checkedAt: null, problem: null });
  });

  it("starts with saved data when it's newer than the bundled copy", async () => {
    const storage = memoryStorage();
    saveGameData(storage, signedDataFile({ rename: "Saved Sabercat" }), null);
    const info = await startGameData({ storage, checkSignature: verify });
    expect(info.source).toBe("saved");
    expect(matchEchoName("Saved Sabercat")?.key).toBe("SabercatProwler");
  });

  it("prefers the bundled copy over older saved data (after an app update)", () => {
    const bundled = signedDataFile({ publishedAt: "2030-06-01T00:00:00.000Z" });
    const older = signedDataFile({ rename: "Old", publishedAt: "2030-01-01T00:00:00.000Z" });
    const newer = signedDataFile({ rename: "New", publishedAt: "2030-09-01T00:00:00.000Z" });
    expect(isNewer(older, bundled)).toBe(false);
    expect(isNewer(newer, bundled)).toBe(true);
    expect(isNewer(bundled, bundled)).toBe(false); // same data: keep calling it built-in
    expect(isNewer(older, { ...bundled, publishedAt: undefined })).toBe(true); // undated = oldest
  });

  it("switches to newer data and pictures once the scan is idle, and saves them", async () => {
    const assets = assetsFile(true);
    const d = deps({ [SCANNER_DATA_URL]: signedDataFile({ rename: "Fresh Sabercat", assets }), [ASSETS_URL]: assets });
    const info = await startGameData(d.value);
    await refreshGameData(info, d.value);
    // Not applied until whenIdle runs it (a scan may be in progress).
    expect(info.source).toBe("built-in");
    expect(scannerGameData().echoes.SabercatProwler?.name).not.toBe("Fresh Sabercat");
    expect(d.storage.map.has(SAVED_DATA_KEY)).toBe(true);
    expect(d.storage.map.has(SAVED_ASSETS_KEY)).toBe(true);
    d.pending.forEach((apply) => apply());
    expect(info).toMatchObject({ source: "downloaded", checkedAt: "2030-01-02T00:00:00.000Z", problem: null });
    expect(scannerGameData().echoes.SabercatProwler?.name).toBe("Fresh Sabercat");
    expect(echoIconUrl("AbyssalGladius")).toBe("data:image/webp;base64,AAAA");
  });

  it("marks the data checked when it's already current", async () => {
    const d = deps({ [SCANNER_DATA_URL]: signedDataFile() });
    const info = await startGameData(d.value);
    await refreshGameData(info, d.value);
    expect(info).toMatchObject({ source: "built-in", checkedAt: "2030-01-02T00:00:00.000Z", problem: null });
    expect(gameDataStatus(info)).toMatch(/Up to date/);
  });

  it("keeps working with what it has when the download fails, and says why", async () => {
    const d = deps({});
    const info = await startGameData(d.value);
    await refreshGameData(info, d.value);
    expect(info).toMatchObject({ source: "built-in", checkedAt: null, problem: expect.stringMatching(/network/) as string });
    expect(gameDataStatus(info)).toMatch(/Couldn't get the newest game data/);
    expect(describeGameData(info)).toMatch(/built-in.*last check: couldn't download/);
  });

  it("flags an app update when the format is newer", async () => {
    const d = deps({ [SCANNER_DATA_URL]: { ...signedDataFile(), version: 2 } });
    const info = await startGameData(d.value);
    await refreshGameData(info, d.value);
    expect(info.appUpdateNeeded).toBe(true);
    expect(gameDataStatus(info)).toMatch(/Update Wavescan/);
  });
});

describe("whenNotScanning", () => {
  it("applies straight away when no scan is running", () => {
    let applied = false;
    whenNotScanning(() => (applied = true));
    expect(applied).toBe(true);
  });

  it("waits for a running scan to end", async () => {
    navigation.busy = true;
    let applied = false;
    whenNotScanning(() => (applied = true));
    await Promise.resolve();
    expect(applied).toBe(false);
    navigation.busy = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applied).toBe(true);
  });
});
