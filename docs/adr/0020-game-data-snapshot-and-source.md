---
status: accepted
date: 2026-10-06
tags: [data, network, privacy]
supersedes: [10]
---

# 20. Bundle a game-data snapshot; refresh it from wutheringtools.com

## Context

Wavescan supplies scanner-core with game data ([ADR 0019](./0019-consume-scanner-core-with-injected-data.md)). Wuthering Tools now publishes that data on every deploy as `https://wutheringtools.com/scanner-data.json` ([WT ADR 0035](https://github.com/ryanbenson/wuthering-waves-optimizer/blob/master/docs/adr/0035-publish-scanner-data-json.md)). [ADR 0010](./0010-no-telemetry-network-allowlist.md) had planned to fetch game data from `ryanbenson.github.io`.

## Decision

- A snapshot is committed at `src/data/scanner-data.json`, pretty-printed so data updates are readable diffs.
  - `npm run data:update` refreshes it. Before writing, it checks the format, the version, and that the hash matches the content.
  - Every build bundles the snapshot, so scanning works offline and on first launch with no network at all.
- `src/data/scannerData.ts` validates the file (`validateScannerData`) and hands it to scanner-core at startup, before any scanning code runs. The data hash is shown on the home screen and included in Diagnostics reports, so every report names its data version.
- **The game-data host is `wutheringtools.com`**, replacing `ryanbenson.github.io` from ADR 0010. Today the app makes **no** game-data requests; only the dev-time script fetches.
- The future runtime refresh will be:
  - opt-in under Settings → Network
  - signed (a detached signature checked against a public key built into the app)
  - fail-safe: keep the bundled data if anything is off

  It gets its own ADR when built.

## Consequences

- Pros:
  - Scanning never depends on the network.
  - Reports name their exact data version.
  - New echoes can be picked up by running `data:update` and making a release, until the runtime refresh exists.
- Cons:
  - Until the runtime refresh ships, users need an app update for new echoes.
  - The snapshot (~50 KB) lives in git.

## Guidance

- **Do** run `npm run data:update` before a release, and commit the snapshot.
- **Don't** edit `scanner-data.json` by hand. Fix the data in Wuthering Tools.

## Related

- `src/data/`, `scripts/update-scanner-data.mjs`, `tests/scannerData.spec.ts`, README "internet connections"
