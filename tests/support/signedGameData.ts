import { createHash, generateKeyPairSync, sign } from "node:crypto";
import bundledAssets from "@/data/scanner-assets.json";
import bundledData from "@/data/scanner-data.json";
import { signingPayload } from "@/data/signature";
import type { ScannerDataFile } from "@/data/scannerData";
import type { ScannerAssetsFile } from "@/data/scannerAssets";

// Signs game data the way Wuthering Tools' deploy does (WT src/scanner/scannerSignature.ts
// and scripts/scannerDataKey.ts), with a key made for the test run.

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicDer = publicKey.export({ format: "der", type: "spki" });

/** The test key's id: first 16 hex chars of SHA-256(SPKI DER), as WT computes it. */
export const KEY_ID = createHash("sha256").update(publicDer).digest("hex").slice(0, 16);
/** Key id → public key, as trusted-keys.json holds them. */
export const TEST_KEYS: Record<string, string> = { [KEY_ID]: publicDer.toString("base64") };

/** The bundled pictures, optionally with one echo picture swapped (a "newer" file). */
export function assetsFile(changed = false): ScannerAssetsFile {
  const file = structuredClone(bundledAssets) as unknown as ScannerAssetsFile;
  if (changed) file.data.echoIcons.icons.AbyssalGladius = "data:image/webp;base64,AAAA";
  file.hash = sha256(JSON.stringify(file.data));
  return file;
}

/**
 * The bundled data as WT would publish it, signed. `rename` changes one echo's name so the
 * data counts as newer.
 */
export function signedDataFile(
  options: { rename?: string; assets?: ScannerAssetsFile; publishedAt?: string; sign?: boolean } = {},
): ScannerDataFile {
  const file = structuredClone(bundledData) as unknown as ScannerDataFile;
  if (options.rename) file.data.echoes.SabercatProwler!.name = options.rename;
  file.hash = sha256(JSON.stringify(file.data));
  file.publishedAt = options.publishedAt ?? "2030-01-01T00:00:00.000Z";
  file.assets = { file: "scanner-assets.json", hash: (options.assets ?? assetsFile()).hash };
  if (options.sign === false) {
    file.keyId = null;
    file.signature = null;
  } else {
    file.keyId = KEY_ID;
    file.signature = sign("sha256", Buffer.from(signingPayload(file)), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64");
  }
  return file;
}

/** A fetch fake serving these files by URL; anything else is a network error. */
export function fakeFetch(files: Record<string, unknown>): { fetchText: (url: string) => Promise<string>; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetchText: (url) => {
      calls.push(url);
      if (!(url in files)) return Promise.reject(new Error("network unreachable"));
      const body = files[url];
      return Promise.resolve(typeof body === "string" ? body : JSON.stringify(body));
    },
  };
}
