---
status: accepted
date: 2026-10-15
tags: [data, network, security, privacy]
---

# 34. Download signed game data and pictures on every launch, with no off switch

## Context

Echoes, their sets and their pictures change often: there are data fixes in Wuthering Tools (WT) most weeks, and a patch every six weeks. Until now they reached users only through a new Wavescan release ([ADR 0020](./0020-game-data-snapshot-and-source.md)), and there's no auto-updater yet. Users on an old build scan with old data, so some echoes come out wrong or without a set. The maintainer then gets bug reports that are really just an old build.

ADR 0020 planned an *opt-in* refresh. Most users never open settings, so opt-in would leave most of them on stale data, which is the problem to solve. [ADR 0010](./0010-no-telemetry-network-allowlist.md) promised that every connection can be switched off.

Two more things had to move to WT for a runtime download to be useful:

- **The set-icon references** ([ADR 0022](./0022-set-icon-matching-with-bundled-references.md)). A new set without one can't be recognised.
- **The echo pictures** ([ADR 0029](./0029-bundled-echo-pictures.md)).

Both were made at Wavescan's build time from icon URLs.

## Decision

- **WT publishes and signs** (WT ADR 0041):
  - `scanner-data.json` gains `publishedAt`, `assets: { file, hash }`, `keyId` and an ECDSA P-256 `signature` over its format, version, publish time, data hash and pictures hash.
  - `scanner-assets.json` holds the set-icon references and echo pictures. WT makes them with the script and settings Wavescan used before, so the output is byte-identical.
- **On every launch** (`src/data/gameData.ts`):
  1. Start with the bundled snapshot, or the copy saved by an earlier launch when it's newer (`publishedAt`). Scanning works straight away, offline too.
  2. In the background, download `https://www.wutheringtools.com/scanner-data.json`. Download `scanner-assets.json` (~1 MB) only when it names a different pictures hash.
  3. Use the download only if every check passes (`src/data/gameDataDownload.ts`): the format and version are ones this build understands, each hash matches its content, and the signature is valid for a key in `src/data/trusted-keys.json`, checked with the WebView's WebCrypto. Otherwise keep what's in use and record why.
  4. Save it (localStorage) for offline launches, and switch to it. A scan in progress keeps its data, and the switch waits until it ends (`whenNotScanning`).
- **No off switch.** It's a plain `GET` with no cookies, no referrer, no query string and no ID, for a public file that is the same for everyone. Like any download, the host sees an IP address. This replaces "each connection is toggleable" (ADR 0010) and "opt-in" (ADR 0020) for this one host.
- **Visible.** The Help screen says whether the data is current, saved or built in, and why a download wasn't used. Bug reports and Diagnostics name the data's hash, source and publish date. "What Wavescan did this session" counts the downloads. The home screen asks for an app update when WT publishes a data format this build can't read.
- **Signature details.** The key ids and public keys are built into the app, which allows key rotation: add the new key, release, switch WT, remove the old one. The private key is only in WT's Vercel production environment and the maintainer's password manager. Unsigned files (WT preview and dev builds) are always ignored.
- **The bundled pictures** are now one file, `src/data/scanner-assets.json`, in WT's format, loaded at startup with the data. This replaces `set-icons.json`, `echo-icons.json`, their scripts, and ADR 0029's lazily loaded chunk: pictures can change at runtime, so they're all in memory. `npm run data:update` fetches both files and checks the signature too.
- The CSP adds `https://www.wutheringtools.com` to `connect-src`. That's the only new host. WT already serves the files with `Access-Control-Allow-Origin: *`.

## Consequences

- Pros:
  - A data or picture fix in WT reaches every user on their next launch, without a Wavescan release.
  - A compromised host or a man-in-the-middle can't change what Wavescan reads without WT's private key. The worst it can do is stop downloads, and then the app keeps the data it has.
  - Bug reports say exactly which data the user had.
- Cons:
  - Every launch makes one ~80 KB request, plus ~1 MB when pictures change.
  - Users who block it in a firewall keep the data their build shipped with. Scans still work.
  - The private key is a new secret to protect. Losing it means a Wavescan release to trust a new key.
  - Startup parses ~1 MB of bundled pictures instead of loading them later.

## Guidance

- **Don't** add anything to this request that identifies the user or the machine: no headers, no query string, no version pings.
- **Don't** accept unsigned files at runtime, even as a fallback.
- **Do** bump `SUPPORTED_DATA_VERSION` / `SUPPORTED_ASSETS_VERSION` together with WT. Older builds then show the "update Wavescan" warning instead of silently staying on old data.
- **Do** keep `src/data/trusted-keys.json` in sync with the key WT signs with. `tests/gameData.spec.ts` checks that every built-in key is well formed.

## Related

- `src/data/gameData.ts`, `src/data/gameDataDownload.ts`, `src/data/savedGameData.ts`, `src/data/signature.ts`, `src/data/trusted-keys.json`, `src/data/scannerAssets.ts`, `tests/gameData.spec.ts`
- WT: ADR 0041, `src/scanner/scannerSignature.ts`, `src/scanner/scannerAssets.ts`
- Replaces parts of ADR 0010, ADR 0020, ADR 0022, ADR 0029 and ADR 0033 (see the notes there)
