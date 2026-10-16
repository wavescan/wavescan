import trusted from "./trusted-keys.json";

// Checks that a downloaded scanner-data.json really came from a Wuthering Tools deploy
// (ADR 0034, WT ADR 0041). WT signs a short text naming the data's hash, the pictures'
// hash and the publish time, with a private key only its production deploy holds. Here the
// signature is checked against the public keys in trusted-keys.json, using the WebView's
// built-in WebCrypto (ECDSA P-256, SHA-256), so no crypto library is needed.
//
// The hashes are checked separately (gameDataDownload.ts): the signature proves the hashes
// are WT's, the hashes prove the content is what WT hashed.

/** The fields of scanner-data.json that the signature covers or identifies. */
export interface SignedFields {
  format: string;
  version: number;
  publishedAt?: string;
  hash: string;
  assets?: { hash: string };
  keyId?: string | null;
  signature?: string | null;
}

/** The exact text WT signs. Must match WT's `signingPayload` (src/scanner/scannerSignature.ts). */
export function signingPayload(file: SignedFields): string {
  return [file.format, file.version, file.publishedAt ?? "", file.hash, file.assets?.hash ?? ""].join("\n");
}

function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function subtle(): SubtleCrypto {
  // WebCrypto exists in every WebView Wavescan runs in, and in Node (tests). If it's ever
  // missing, nothing downloaded can be trusted, so the caller keeps the data it has.
  const api = globalThis.crypto?.subtle as SubtleCrypto | undefined;
  if (!api) throw new Error("this system can't check signatures (no WebCrypto)");
  return api;
}

/** SHA-256 of a text (UTF-8), as lowercase hex: how WT hashes its files. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await subtle().digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Checks the file's signature. Returns null when it's valid, or why it isn't (unsigned, an
 * unknown key, or a signature that doesn't match). Never throws for a bad file.
 *
 * `keys` maps key id → SPKI public key (base64); it defaults to the keys built into this
 * build. Tests pass their own.
 */
export async function checkSignature(
  file: SignedFields,
  keys: Record<string, string> = trusted.keys,
): Promise<string | null> {
  if (!file.signature || !file.keyId || !file.publishedAt || !file.assets) return "the file isn't signed";
  const publicKey = keys[file.keyId];
  if (!publicKey) return `the file is signed with a key this version doesn't know (${file.keyId})`;
  try {
    const key = await subtle().importKey(
      "spki",
      decodeBase64(publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const valid = await subtle().verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      decodeBase64(file.signature),
      new TextEncoder().encode(signingPayload(file)),
    );
    return valid ? null : "the signature doesn't match";
  } catch (error) {
    return `the signature couldn't be checked (${error instanceof Error ? error.message : String(error)})`;
  }
}
