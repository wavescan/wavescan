# Roadmap

The plan of record. Each phase has exit criteria. Don't start the next phase until they're met. Release strategy: [ADR 0012](adr/0012-echoes-first-release-strategy.md).

## Phase 0: Foundations & spike (de-risk)

- [x] Docs scaffold: README, CLAUDE.md, architecture.md, rust-primer.md, ADRs 0001–0015, schema v1
- [x] Toolchain: Docker check image (Rust 1.99, Node 24, `cargo-nextest`, `cargo-deny`); native setup guide in `docs/development.md`
- [x] Tauri 2 + Vue 3 + TS + Tailwind/DaisyUI skeleton, `Cargo.toml [lints]` per ADR 0015, `deny.toml`
- [x] CI (`ci.yml`): fmt, clippy, nextest, deny, vitest, vue-tsc on `windows-latest` + `macos-14` (actions pinned by SHA, Dependabot)
- [x] Trait seams + fakes (`traits.rs`, `testing.rs`) and the `safety` module with tests
- [ ] **Spike, Windows:** find the window, WGC capture of the live game (borderless + fullscreen) at ≥30 fps, WinRT OCR on an echo panel crop, `SendInput` click lands in the game (as administrator, [ADR 0023](adr/0023-auto-mode-requires-administrator-on-windows.md))
  - [x] Window finder, WGC capture, WinRT OCR, and the Diagnostics screen are implemented (milestone 3)
  - [x] Verified against the live game on native Windows 10 (2026-10-09 report, build 02d28f2, in the PR): window found, 42 fps at 1920×1080 with 200% display scaling, captured area matches the window. WinRT read the echo panel, but its thin echo-name test region (519×38) came back empty. Only Diagnostics uses that region; scans read with Tesseract
  - [x] `SendInput` driver + Diagnostics click test implemented (ADR 0017)
  - [x] Click test verified against the live game on Boot Camp as administrator (2026-10-07 report, build 5cecaaf). Without administrator isn't supported for auto mode (ADR 0023)
- [ ] **Spike, macOS (Apple Silicon):** SCK window capture, Vision OCR, `CGEventPost` click lands in the game.
  - [x] Adapters implemented (ADR 0018); compiled on CI's macOS runner
  - [ ] Verified by a community tester (Diagnostics report + click test) No Apple Silicon Mac in-house, so this is validated by **Discord community testers**:
  - CI builds an arm64 `.dmg` (ad-hoc signed until the Developer ID is set up; testers right-click → Open)
  - [x] `tester-build.yml` publishes unsigned macOS (ad-hoc signed) + Windows builds to the rolling `tester-build` pre-release on every merge; tester guide in `docs/testing-guide.md`
  - the app's **Diagnostics** screen runs a self-test (window found? capture fps? OCR on a sample crop? test click registered?) and exports a masked report the tester posts back
- [ ] Record ms per stage in `docs/screens/echoes.md`

**Exit:** capture + OCR work on both OSes. Either input works on both, or ADR 0006 is revisited with the findings.

## Phase 1: `scanner-core` extraction (optimizer repo)

- [x] `packages/scanner-core` package in WT (WT ADR 0034, PR #595)
- [x] WT imports from the package via re-export shims, with no behaviour change (1342 tests unchanged, all 50 Cypress specs)
- [x] Published `@wutheringtools/scanner-core` (0.1.0 by hand; Trusted Publishing + staged releases from then on)
- [x] 0.1.1 (Node-compatible ESM) released with provenance via staged Trusted Publishing; Wavescan pinned to it (ADR 0019)
- [x] WT: `scanner-data.json` published on every deploy (WT ADR 0035)
- [x] Wavescan: bundled snapshot + loader + `data:update` (ADR 0020)
- [ ] Signed runtime refresh (opt-in): moved to [Later](#later) ("Keeping game data current"), not needed for v0.1

**Exit:** the optimizer's Vitest + Cypress suites are green, and the scanner repo imports the package.

## Phase 2: Echoes (watch + auto)

- [x] Watch-mode echo session: sample → scanner-core fingerprints/stability → read pinned frame → extract (scanner-core parsing + level) → dedupe → export (`src/session/`)
- [x] Rarity from the main and secondary stat values at the read level
- [x] Set-icon matching for multi-set echoes (ADR 0022)
- [ ] "Equipped by"
- [ ] `classifyScreen` (detect Bag → Echoes vs other screens)
- [x] Watch mode UI: live counter, candidate list, low-confidence highlighting, remove misreads, copy scan JSON
- [ ] Preview with ROI overlay; save to file
  - [x] Diagnostics preview draws every read region, the pixel checks, the change checks and the User ID mask (`src/diagnostics/overlay.ts`), with "Copy picture". Saving to a file would need a new Tauri permission (ADR), so it's not done
- [ ] Auto mode: arming flow + warning, grid navigator, early stop by level, abort paths, "run as administrator" notice (Windows, ADR 0023) / Accessibility prompt (macOS)
  - [x] Grid reader: visible rows, click targets, scroll matching (`src/auto/grid.ts`, 16:10 and 16:9)
  - [x] Navigator state machine (click → read → next, scroll, end of list, stop level): `src/auto/navigator.ts`, against a fake grid
  - [x] Overlap reads with clicks ([ADR 0025](adr/0025-keep-recent-frames-pinned-so-reads-overlap-clicks.md))
  - [x] `auto_scroll` command + F8 stop hotkey ([ADR 0024](adr/0024-f8-stop-key-and-auto-scroll.md))
  - [x] Auto mode UI: Scan echoes → Auto mode tab (`src/views/AutoModePanel.vue`, run by `src/auto/autoScan.ts`)
  - [x] 16:9 grid measurements (1920×1080)
- [ ] Fixture tests ≥ 99% field accuracy at every captured resolution, on both OCR engines
  - [x] Masked fixtures + goldens committed, replayed through the real OCR on CI's Windows and macOS runners (`npm run test:fixtures`, docs/fixtures.md)
  - [x] Windows reads echoes with Tesseract (ADR 0027): 100% of 278 fixture fields (28 fixtures). Live check on Windows, 2026-10-09: every echo right in the scans below

**Exit:** a full auto scan + a watch scan on real accounts on Windows and Mac, spot-checking 50 echoes.

- [x] Windows, 2026-10-09: auto scan of a whole bag (30 echoes) and a watch scan of 37 echoes (all +25, 5 substats), every field correct. The one false flag found (an untuned substat slot on a +5 echo marked "please check") is fixed, with the `spearback-plus5` fixture
- [ ] macOS: waiting for a community tester

## Phase 4: Handoff + web import (optimizer repo)

- [ ] Export (save file + clipboard → open `https://wutheringtools.com/import/scan`)
- [ ] `ImportScan.vue` + `src/import/scanImport.ts`: validate, review (reuse `useEchoDuplicateReview`), "+25 only" filter, apply to inventory + equip map. **Additive only:** never route through the full-backup restore (see ADR 0009)
- [ ] Mapper unit tests + a Cypress drop-file test

## Phase 6: Release pipeline & trust

- [ ] `release.yml`: Azure Trusted Signing, Developer ID + notarization, checksums, provenance attestation, updater manifest
- [ ] Settings → Network toggles, the "What this app does" page, masked bug-report export
  - [x] Help & feedback: what the app did this session, offline troubleshooting, source at the build's commit, and Report a problem (prefilled GitHub issue, text only) ([ADR 0028](adr/0028-browser-links-mini-window-and-saved-scan.md)). Network toggles and the masked picture export are still to do
- [ ] Network audit (Little Snitch / Wireshark) recorded in the release notes

## Phase 7: Closed beta → **v0.1 public**

- [ ] Discord beta across resolutions (16:9 and 16:10), GPUs, Windows 10/11, macOS 13–15
  - Cover what the Phase 2 check on Windows didn't: a bag big enough to scroll many times in auto mode (end of list and scroll recovery, #43 and #44), low-level echoes with some substats tuned, and echoes with more than one possible set
- [ ] Fix the top misreads (each one gets a fixture), then release

## Later

- **v0.2 Characters (Phase 3):** resonator list, stats, weapon, forte, chain, equipped echoes. Needs fixtures for each character screen:
  - resonator list (top and bottom)
  - Stats tab
  - Weapon tab
  - Forte tab (maxed and partial)
  - Resonance Chain tab (at 0, partial, and 6)
  - Echo tab with a slot detail
  - Rover variants
  - a character with a skin
- **v0.3 Weapons (Phase 5):** weapon grid + detail.
- More languages (native OCR already supports them, but name tables need localisation), ultrawide.
- **Keeping game data current between releases** (not a top priority). New echoes and sets arrive about every 6 weeks. Today they reach users only through a new Wavescan release: update WT, run `npm run data:update`, merge, release (ADR 0020, ADR 0022). An old build still scans safely: an unknown echo is left out of the export and counted, and a set with no reference icon is exported as `null` and flagged, never guessed. Options, not decided:
  - **Scheduled CI job** that runs `data:update` and opens a PR when the data changed. No app change and no new network call; it only shortens the maintainer's routine.
  - **Tell the user the build is stale.** Show it when the scan hits echoes the data doesn't know, or when the data snapshot is older than the current game patch. Point to the Releases page.
  - **Check on load.** Fetch `scanner-data.json` (and the set icons) from wutheringtools.com at startup, opt-in.
  - **Fetch on request.** A "Check for new game data" button, so nothing goes out unless the user asks.
  - Any runtime fetch adds an outbound connection, so it needs an ADR (ADR 0010). It also needs a signature check against a key built into the app, a fallback to the bundled data if anything is off, a Settings → Network toggle, and the README connections table. The set icons are images from the assets site, so they need the same treatment.

## Ideas (unscheduled)

Not planned into a phase yet. Pick from here when a phase has room, and move an item into the phase when it's scheduled.

**Look and feel**

- **App icon.** `src-tauri/icons/source.svg` is the placeholder from the scaffold (gold scan brackets on navy). Design a real one, then regenerate every size with `npm run tauri icon` (Windows `.ico`, macOS `.icns`, PNGs).
- **Installer look.** Research what Tauri allows: NSIS installer images and language (Windows), the DMG background and icon layout (macOS). Keep it honest and plain: no bundled extras, and no "run as administrator" by default (only auto mode needs it, ADR 0023).
- **App UI research.** The screens are functional DaisyUI cards today. Ideas to explore:
  - a home screen that walks a first-time user through Diagnostics → scan → import
  - a richer echo list: set icons, rarity colours, sorting, a filter to show only flagged echoes
  - a live preview with the read regions drawn on it (Phase 2 lists this too)
  - light/dark theme following the OS
  - visual consistency with Wuthering Tools
- **Accessibility.** Keyboard navigation and screen-reader labels, plus contrast that doesn't rely on yellow alone for "please check".

**Scanning**

- **Fix misreads before export.** Let the user correct a flagged field in the list instead of only removing the echo. Wuthering Tools' import review already covers this; decide which side should own it.
- **Resume or partial auto scans.** Start from a chosen row, or continue after a stop, instead of always starting from the top.
- **Detect problems up front.** Detect a non-English game, HDR, an unsupported window shape, or the wrong screen, and say so before scanning (`classifyScreen` in Phase 2 covers part of this).
- **When a game patch moves the layout.** A quick routine for re-measuring regions and adding fixtures, and a clear "this game version isn't supported yet" message instead of misreads.
- **Measure real-game timing.** Record the time per echo in auto mode on real machines (Phase 0's "ms per stage"), and tune `UNCHANGED_AFTER_MS` and the read limit from it.

**Trust and support**

- **In-app update prompt.** The signed updater is decided (ADR 0011, Phase 6), but not how it's shown: an "update available" banner, what's in it, and never updating without asking.
- **About screen.** Version, data version, licence (GPL-3.0), third-party licences, and links to the source and the README's "Is it safe?" section.
- **Keep an eye on Kuro's Fair Play guidance.** ADR 0006 says to revisit auto mode if Kuro publishes anything. Decide who checks, and where the decision gets recorded.

**Project**

- **GitHub issue templates** for bug reports (asking for the Diagnostics report and a masked screenshot) and wrong reads.
- **A short landing page** (or the README's top section) with screenshots, for sharing on Discord and Reddit.
- **Linux / Steam Deck:** out of scope for now (window capture under Proton is different). Write that down so it isn't re-asked.
