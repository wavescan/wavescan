---
status: accepted
date: 2026-10-20
tags: [ui, dependencies, privacy]
---

# 36. Three colour schemes from Wuthering Waves, a theme picker, and bundled title fonts

## Context

Wavescan's teal-and-violet theme read like a generic app, and it didn't match the new cube mark ([docs/brand](../brand/README.md)). People use Wavescan side by side with the game, so the obvious source for colours is Wuthering Waves itself. Three sources were measured:

- **The game's echo screen** (from a 1920×1080 fixture): slate-blue panels, gold for the echo's name and rarity, and a plain white main button.
- **The official website** (`wutheringwaves.kurogames.com`, News page): warm near-black, gold serif titles, hairline rules, and an underline on the current tab.
- **The Jinzhou artwork**: deep jade and blossom pink.

People like different looks, so instead of choosing only one, Wavescan ships all three with a picker.

Each scheme pairs with a title typeface. The app's CSP (`default-src 'self'`) allows no web fonts, and Wavescan makes no outbound connections beyond its allow-list ([ADR 0010](./0010-no-telemetry-network-allowlist.md)), so a font must ship inside the app.

## Decision

- **Six daisyUI themes** in `src/style.css`, named `wavescan-<scheme>-<dark|light>`, for three schemes:
  - **Echo Glass** (default): slate panels, white main action, gold names. Title face Chakra Petch.
  - **Solaris Gold**: warm black, gold main action. Title face Cormorant Garamond.
  - **Jade & Blossom**: deep jade, jade main action, blossom pink for "checked by you". Title face Saira Semi Condensed.
- **What each colour means is the same in every theme:** `primary` is the one main action and what's selected; `accent` is gold (echo names, levels, roll meters, like the game's rarity gold); `warning` is "please check"; `secondary` is "checked by you". Each status also has a text label, as before.
- **The picker** is under Help & feedback → Appearance (`src/components/ThemePicker.vue`): a scheme, plus Dark / Light / Match my computer. **Echo Glass, dark** is the default, because the game is dark-only. `src/settings/theme.ts` keeps the choice in `localStorage` (`wavescan.theme`) on this PC only, and sets `data-theme` on the page before the app mounts, so the window never flashes the wrong theme. An unknown or damaged saved value falls back to the default per part.
- **Title fonts are bundled** from `@fontsource/chakra-petch`, `@fontsource/cormorant-garamond` and `@fontsource/saira-semi-condensed` (OFL-1.1, pinned exact). Only the Latin subset at the one weight each scheme uses is imported. Vite bundles them as files (about 50 KB WOFF2 in total), served from the app itself. Body text stays the system font.

## Consequences

- No new permission, network host or runtime code. Three font packages are added as dependencies; they contain only font files and CSS.
- Every new screen or component must use theme colours (`bg-base-100`, `text-accent`, `text-warning` …), never fixed hex values, or it breaks in five of the six themes.
- Six themes to check instead of two. The visual check for a UI change covers at least Echo Glass dark and one light theme.
- The theme isn't included in exports, diagnostics or bug reports: it says nothing about the scan.

## Guidance

- Add a colour to all six theme blocks at once, and keep its meaning the same in each.
- Light themes keep `warning` and `accent` text at a contrast of at least 4.5:1 on `base-100`.
- Titles use the `font-title` utility (it reads the scheme's face, weight and letter-height adjustment); don't name a font family in a component.
- A fourth scheme is a new theme pair, a `SCHEMES` entry in `theme.ts`, and its font. No component changes.

## Related

- [ADR 0010](./0010-no-telemetry-network-allowlist.md): why fonts are bundled, not loaded
- [docs/brand/README.md](../brand/README.md): the mark and the shapes the UI borrows from it
