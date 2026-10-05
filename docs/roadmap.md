# Roadmap

The plan of record. Each phase has exit criteria. Don't start the next phase until they're met. Release strategy: [ADR 0012](adr/0012-echoes-first-release-strategy.md).

## Phase 0: Foundations & spike (de-risk)

- [x] Docs scaffold: README, CLAUDE.md, architecture.md, rust-primer.md, ADRs 0001–0015, schema v1
- [x] Toolchain: Docker check image (Rust 1.99, Node 24, `cargo-nextest`, `cargo-deny`); native setup guide in `docs/development.md`
- [x] Tauri 2 + Vue 3 + TS + Tailwind/DaisyUI skeleton, `Cargo.toml [lints]` per ADR 0015, `deny.toml`
- [x] CI (`ci.yml`): fmt, clippy, nextest, deny, vitest, vue-tsc on `windows-latest` + `macos-14` (actions pinned by SHA, Dependabot)
- [x] Trait seams + fakes (`traits.rs`, `testing.rs`) and the `safety` module with tests
- [ ] **Spike, Windows:** find the window, WGC capture of the live game (borderless + fullscreen) at ≥30 fps, WinRT OCR on an echo panel crop, `SendInput` click lands in the game (with and without elevation)
  - [x] Window finder, WGC capture, WinRT OCR, and the Diagnostics screen are implemented (milestone 3)
  - [ ] Verified against the live game on Boot Camp (paste the Diagnostics report into the PR)
  - [ ] `SendInput` spike (milestone 4)
- [ ] **Spike, macOS (Apple Silicon):** SCK window capture, Vision OCR, `CGEventPost` click lands in the game. No Apple Silicon Mac in-house, so this is validated by **Discord community testers**:
  - CI builds an arm64 `.dmg` (ad-hoc signed until the Developer ID is set up; testers right-click → Open)
  - the app's **Diagnostics** screen runs a self-test (window found? capture fps? OCR on a sample crop? test click registered?) and exports a masked report the tester posts back
- [ ] Record ms per stage in `docs/screens/echoes.md`

**Exit:** capture + OCR work on both OSes. Either input works on both, or ADR 0006 is revisited with the findings.

## Phase 1: `scanner-core` extraction (optimizer repo)

- [ ] `packages/scanner-core` workspace package, made of the modules listed in ADR 0007
- [ ] The optimizer imports from the package, with no behaviour change
- [ ] Publish `@wuthering-tools/scanner-core` (or a git dependency until then)

**Exit:** the optimizer's Vitest + Cypress suites are green, and the scanner repo imports the package.

## Phase 2: Echoes (watch + auto)

- [ ] `ScanSession`, `classifyScreen` (`bag.echoes`), echo extractor
- [ ] Watch mode UI: live counter, candidate list, low-confidence highlighting, preview with ROI overlay
- [ ] Auto mode: arming flow + warning, grid navigator, early stop by level, abort paths, elevation/Accessibility prompts
- [ ] Fixture tests ≥ 99% field accuracy at every captured resolution, on both OCR engines

**Exit:** a full auto scan + a watch scan on real accounts on Windows and Mac, spot-checking 50 echoes.

## Phase 4: Handoff + web import (optimizer repo)

- [ ] Export (save file + clipboard → open `https://wutheringtools.com/import/scan`)
- [ ] `ImportScan.vue` + `src/import/scanImport.ts`: validate, review (reuse `useEchoDuplicateReview`), "+25 only" filter, apply to inventory + equip map. **Additive only:** never route through the full-backup restore (see ADR 0009)
- [ ] Mapper unit tests + a Cypress drop-file test

## Phase 6: Release pipeline & trust

- [ ] `release.yml`: Azure Trusted Signing, Developer ID + notarization, checksums, provenance attestation, updater manifest
- [ ] Settings → Network toggles, the "What this app does" page, masked bug-report export
- [ ] Network audit (Little Snitch / Wireshark) recorded in the release notes

## Phase 7: Closed beta → **v0.1 public**

- [ ] Discord beta across resolutions (16:9 and 16:10), GPUs, Windows 10/11, macOS 13–15
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
