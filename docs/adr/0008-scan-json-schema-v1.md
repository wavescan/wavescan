---
status: accepted
date: 2026-10-05
tags: [schema, interop]
---

# 8. `WutheringToolsScan` JSON schema v1

## Context

The scanner's output is the contract with the web app. It has to:

- be inspectable by users (transparency)
- validate strictly, so a bad file can't corrupt localStorage
- carry confidence, so the web app can flag doubtful fields
- leave room for characters and weapons without a breaking change ([ADR 0012](./0012-echoes-first-release-strategy.md))

Inventory Kamera's GOOD format shows the value of a stable, versioned, documented format that several sites can consume.

The optimizer's internal `EchoObject` (`echoSubStatsType1..5` and so on) is a storage shape, not an interchange shape, and it has no `level`. That matters because echoes below +25 reveal fewer substats and show lower main-stat values, which the fixtures confirm.

## Decision

- Use the format defined in [`schema/scan.v1.json`](../../schema/scan.v1.json) (JSON Schema 2020-12). Its top level is `{ format: "WutheringToolsScan", version: 1, meta, echoes, characters?, weapons? }`.
- **Keys are the web app's PascalCase keys** (`echo: "AbyssalGladius"`, `echoSet: "MidnightVeil"`, stat keys like `CritDMG` / `ATK_FLAT`). The scanner resolves names via `scanner-core`, so the web app never fuzzy-matches.
- **Echoes:**
  - `scanId` (stable within the file), `echo`, `echoSet`, `cost`, `rank`, `level`, `stat`, plus `substats[]` holding **only the revealed** substats (0–5).
  - `equippedBy` is a character key or `null`, and `locked` is optional.
  - **Amended 2026-10-06 (before any release):** `echoSet`, `stat` and `level` may also be `null` when the scanner couldn't read them, and they're then listed in `lowConfidence`. That beats dropping the echo or guessing. The web importer asks the user to fill these in.
  - `lowConfidence[]` lists JSON-pointer-ish field paths, e.g. `"substats.2.value"`.
- **`characters` and `weapons`** are defined now as optional arrays, and v0.1 omits them. Adding them later is non-breaking.
- **`meta`** has `scannerVersion`, `scannedAt` (ISO), `platform`, `resolution`, `language`, `mode` (`watch` | `auto`), and an optional `gameVersion`. It contains **no User ID or any account identifier**.
- **Versioning:** additive optional fields don't bump the version. Renames, removals and semantic changes bump `version`, and the web app keeps importers for each supported version.

## Consequences

- Pros: a strict, documented contract. Other sites can adopt it, and level-aware echoes allow "+25 only" filtering on import.
- Cons: the web app needs a mapper from this format to `EchoObject` + equip state. That lives in the optimizer (`src/import/scanImport.ts`).

## Guidance

- **Do** validate every export against the schema in tests (`ajv`).
- **Do** update the optimizer importer in the same release when the schema changes.
- **Don't** put display names, images or anything account-identifying in the file.

## Related

- [`schema/scan.v1.json`](../../schema/scan.v1.json), [ADR 0009](./0009-handoff-via-file-and-clipboard-no-server.md)
