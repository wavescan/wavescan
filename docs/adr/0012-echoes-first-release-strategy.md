---
status: accepted
date: 2026-10-05
tags: [product, roadmap]
---

# 12. Ship echoes first, then characters and weapons

## Context

The full vision covers characters (level, weapon, forte, chains, equipped echoes), weapons and echoes. Echoes are by far the biggest manual burden: a reviewed account had 2,969 of 3,000, each with up to 5 substats. Characters number roughly 20–40 and are quick to enter by hand. Echo scanning also reuses the most existing code. The genuinely new risks are the same for every screen: native capture on both OSes, whether synthetic input reaches the game, signing, and the updater.

## Decision

- **v0.1:** echoes only, on Windows + macOS, watch + auto modes, signed installers, web import page.
- **v0.2:** characters. **v0.3:** weapon inventory.
- Build the framework generically from day one, so later releases only add extractors and navigator routes:
  - `ScanSession` → `classifyScreen` → screen-keyed extractor plugins
  - a navigator with per-screen routes
  - a schema that already reserves `characters` / `weapons`

## Consequences

- Pros:
  - Most of the user value ships soonest.
  - Real-world feedback on capture, input and resolution problems arrives before more screens depend on them.
  - Trust builds with a small surface.
- Cons: users asking for full automation wait another release for characters.

## Guidance

- **Do** resist special-casing echoes in `ScanSession`/navigator code.
- **Do** collect character-screen fixtures early (see [roadmap](../roadmap.md)).

## Related

- [roadmap.md](../roadmap.md)
