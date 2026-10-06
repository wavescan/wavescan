---
status: accepted
date: 2026-10-06
tags: [architecture, reuse, data]
supersedes: [7]
---

# 19. Consume `@wutheringtools/scanner-core` from npm, with game data supplied by Wavescan

## Context

[ADR 0007](./0007-shared-scanner-core-package.md) decided to share the optimizer's scanner logic as a package. Doing the extraction (Wuthering Tools [ADR 0034](https://github.com/ryanbenson/wuthering-waves-optimizer/blob/master/docs/adr/0034-scanner-core-package.md)) refined that decision in three ways:

- The npm scope is the maintainer's account, **`@wutheringtools`**, not `@wuthering-tools`.
- WT's CLI generators write to the game tables, and the calculator imports them everywhere, so the package holds **logic only** and the tables stay in WT.
- WT resolves the package from source via a path alias, and publishes it to npm with Trusted Publishing and staged releases.

## Decision

- Wavescan depends on **`@wutheringtools/scanner-core`** from npm, **pinned to an exact version** (`--save-exact`). Dependabot proposes bumps; each one is reviewed like any other dependency.
- **Wavescan supplies the game data** with `setScannerGameData(...)` at startup. The data will come from a generated `scanner-data.json` snapshot: bundled with each release, and refreshable at runtime from a signed copy ([ADR 0010](./0010-no-telemetry-network-allowlist.md), architecture §8). Until that snapshot exists, only tests use small inline fixtures.
- Fixes to parsing and matching are made in WT's `packages/scanner-core/` and reach Wavescan through a version bump. Wavescan never patches or vendors the package.
- `tests/scannerCore.spec.ts` is a smoke test that the published package resolves and runs in Wavescan's toolchain. It caught 0.1.0's bundler-only imports, which were fixed in 0.1.1.

## Consequences

- Pros:
  - One scanner implementation.
  - New echoes need only new data, not a package release.
  - Published versions are approved by a human with 2FA.
- Cons:
  - A scanner fix needs a WT merge, an approved npm release and a Wavescan bump.
  - The package's data is module-level state; Wavescan must set it before parsing. The package throws a clear error if it hasn't.

## Guidance

- **Do** set game data once at startup, before any parsing, and again after a data refresh.
- **Don't** import WT source files or copy scanner logic into this repo.

## Related

- [ADR 0007](./0007-shared-scanner-core-package.md) (superseded in part) · [architecture.md](../architecture.md) §1, §8
