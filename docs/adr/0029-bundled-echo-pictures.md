---
status: accepted
date: 2026-10-10
tags: [data, ui]
---

# 29. Bundled echo pictures

## Context

The Review screen named each echo and showed its set icon. Players know echoes by their picture far more than by name, so a list of names is slow to scan by eye. Wuthering Tools has a picture URL for every echo. Its `scanner-data.json` now publishes it as `echoes[key].icon` (WT ADR 0035, additive, still version 1).

Those URLs point at the `wuthering-waves-assets` site, and for newer echoes at other image hosts. The app must not make network calls (ADR 0010), and the strict CSP only allows `'self'` and `data:` images.

## Decision

- **Snapshot, like set icons ([ADR 0022](./0022-set-icon-matching-with-bundled-references.md)).** `npm run data:update` also runs `scripts/update-echo-icons.mjs`. It downloads each echo's picture from the URL in the bundled `scanner-data.json`, whichever host that is, shrinks it to 80×80 (keeping transparency) and writes WebP `data:` URLs to `src/data/echo-icons.json` (about 1 MB, committed), with each source URL and SHA-256. The download happens on the developer's machine only. Every picture is decoded and re-encoded by `sharp` (dev-only), so the app never loads a file as it was served.
- **Loaded on demand.** `src/data/echoIcons.ts` imports the JSON as a separate chunk the first time a picture is needed, so startup isn't slower. `EchoAvatar.vue` shows the picture, or the name's initials (or "?" for an unrecognised echo) when there's none.
- **Where:** echo cards (instead of the set icon, which moves into the set chip), the Review table and the Scan screen's session list.
- **Display only.** Pictures aren't used for recognition.

## Consequences

- Pros:
  - Echoes are recognisable at a glance.
  - No runtime network access, no CSP change, no new app dependency.
  - `tests/echoIcons.spec.ts` fails if the pictures are older than the game data or one is missing.
- Cons:
  - About 1 MB more in the app bundle.
  - A new echo shows initials until `npm run data:update` and an app release.
  - A picture that can't be fetched is skipped with a warning (and the test then fails), so a broken link upstream blocks the refresh until it's fixed or accepted.

## Guidance

- Never hand-edit `echo-icons.json`. Rerun `npm run data:update`.
- Don't load pictures from their URLs at runtime. That would be a new outbound host (ADR 0010).

## Related

- `scripts/update-echo-icons.mjs`, `src/data/echoIcons.ts`, `src/components/EchoAvatar.vue`, `tests/echoIcons.spec.ts`
- [ADR 0010](./0010-no-telemetry-network-allowlist.md), [ADR 0020](./0020-game-data-snapshot-and-source.md), [ADR 0022](./0022-set-icon-matching-with-bundled-references.md)
