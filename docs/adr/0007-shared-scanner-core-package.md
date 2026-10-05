---
status: accepted
date: 2026-10-05
tags: [architecture, reuse]
---

# 7. Share scanning logic with the web app via `@wuthering-tools/scanner-core`

## Context

The optimizer already contains a tuned, tested echo scanner (its ADR 0032, `docs/scanner.md`), including:

- ROI fractions measured at three 16:10 resolutions (`layout.ts`)
- content-rect detection, stability gating, label/value column pairing, substat snapping
- Levenshtein name matching, set-icon template matching, dedupe signatures
- game data tables

Copying it would fork it. The API proof-of-concept repo already shows that drift: it copied data tables and components.

## Decision

Extract the DOM-free parts into a package, `@wuthering-tools/scanner-core`, built from the optimizer repo (a workspace package, `packages/scanner-core`). Both the web app and this desktop app consume it.

- **Contents:**
  - `scanner/` pure modules: `parse`, `layout`, `contentRect`, `layoutCheck`, `fingerprint`, `stability`, `queue`, `dedupe`, `review`, `levenshtein`, `types`
  - set-icon matching from `echoParser.worker.ts`, made worker-agnostic
  - data: `echoes/stats`, `echoes/index`, `characters/characters`, `weapons/weapons`, resonance-chain key lists
  - `parsedEchoMapping`
- **Data loading:** image references stay as URLs, and the desktop app pre-bundles the templates.
- The optimizer re-exports from the package, so its behaviour and tests are unchanged (Phase 1 exit criterion: optimizer Vitest suite green, no UI diff).
- **Distribution to this repo:** published to npm under the `@wuthering-tools` scope, with a pinned version and an upgrade PR per release. Until the first publish, a `file:` / git dependency is acceptable.

## Consequences

- Pros:
  - One fix (e.g. a new echo name, a substat snap bug) helps both scanners.
  - The web import can trust scanner keys.
  - It's already TS, so the maintainer owns it fully.
- Cons:
  - Release coordination between two repos.
  - The extraction is a refactor of a live feature and must be done carefully, in small PRs.

## Guidance

- **Do** put game knowledge in the core, not in this repo.
- **Do** keep the core free of Vue, DOM, Pinia and `window`. It must run in a webview, a worker and Node (for tests).
- **Don't** edit vendored copies. There shouldn't be any.

## Related

- Optimizer: `src/scanner/`, `src/workers/echoParser.worker.ts`, `src/echoes/parsedEchoMapping.ts`, ADR 0032
- [ADR 0014](./0014-gpl-3-license.md): the core is GPL-3.0-or-later, which drives this repo's licence
