---
status: accepted
date: 2026-10-07
tags: [data, ocr, accuracy]
---

# 22. Set-icon matching against bundled reference icons

## Context

Most echoes can belong to 2 or 3 sonata sets, and the echo panel shows the set only as an icon next to the level. There's no set name to OCR. Until now Wavescan exported every such echo with `echoSet: null`, so the user had to pick the set for nearly every echo after importing.

Wuthering Tools' browser scanner matches the icon in a web worker. It downloads the reference icons (WebP, from the `wuthering-waves-assets` GitHub Pages site) at runtime and decodes them with the browser. Wavescan can't copy that as is:
- The app must not make new network calls (ADR 0010).
- The fixture replay and unit tests run in Node, which can't decode WebP.

Measured on the 12 fixtures: once the icon is lined up, each echo's own 2–3 candidate sets are easy to tell apart. The right set scored 0.84–0.94 and the best wrong one at most 0.63 (two shield icons). Matching against all 37 sets at once is much less reliable, and isn't needed because the name already identifies the echo.

## Decision

- **Reference snapshot.** `npm run data:update` also runs `scripts/update-set-icons.mjs`. It downloads each set's icon from the URL in the bundled `scanner-data.json`, flattens it onto a dark background, shrinks it to 32×32 and writes base64 RGB to `src/data/set-icons.json` (about 160 KB, committed). The app and the tests read those numbers directly, so nothing decodes images at runtime and the app never downloads icons.
- **`sharp`** is a **dev-only** dependency, used only by that script to decode WebP. It isn't in the app bundle.
- **Same frame.** The scan samples the icon area (`setIconSearchRegion`: `SET_ICON_BOX` padded by 25% on every side) in the same `sample_regions` call as the fingerprints, so it comes from the exact frame that's read (ADR 0021).
- **Narrowed match only.** `src/session/setIcon.ts` compares the sample with the echo's own candidate sets. Each reference is tried at a range of sizes and positions (layouts differ a little: 16:9 vs 16:10, PC vs mobile). The score is shape (correlation of brightness inside the circle) minus colour difference (brightness-independent).
- **Flag, don't guess.** The set is used only when the best score is ≥ 0.7 **and** beats the runner-up by ≥ 0.15. Otherwise `echoSet` stays `null` with `lowConfidence: ["echoSet"]`. The same happens when a candidate set has no reference icon, for example a set added by a newer scanner-data than the icon snapshot.

## Consequences

- Pros:
  - Most multi-set echoes now export their set.
  - No runtime network access and no new app dependency.
  - The fixture replay checks set accuracy on both OSes, because the Rust tool returns the same `regions::sample` pixels the app uses.
- Cons:
  - A new set needs `npm run data:update` and an app release before it can be matched. Until then it's flagged, never guessed.
  - About 20–60 ms of matching per echo that has more than one possible set. This runs once per echo, not on every check.
  - Thresholds come from 12 fixtures at two resolutions. More fixtures, especially 16:9 and macOS, should confirm them.

## Guidance

- Never hand-edit `set-icons.json`. Rerun `npm run data:update`.
- Before changing a threshold or the scoring, run `npm run test:fixtures` and check `tests/setIcon.spec.ts`, which shows every set among each multi-set echo's candidates.
- Don't add full-pool matching (all sets at once) without fixtures showing it's reliable. An unknown echo isn't exported anyway.

## Related

- `src/session/setIcon.ts`, `src/data/setIcons.ts`, `scripts/update-set-icons.mjs`
- [ADR 0010](./0010-no-telemetry-network-allowlist.md), [ADR 0020](./0020-game-data-snapshot-and-source.md), [ADR 0021](./0021-batched-region-reads-with-pinned-frames.md)
- `docs/screens/echoes.md` (set row), `docs/fixtures.md`
