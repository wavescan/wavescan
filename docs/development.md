# Development setup

There are two ways to work on Wavescan:

| Where | What you can do | What you need |
|---|---|---|
| **Any machine with Docker** | Lint, type-check, unit tests, Rust lint/tests for the OS-independent code, supply-chain checks | Docker Desktop |
| **Windows or an Apple Silicon Mac** | Run the actual app (`npm run tauri dev`) against the real game | Node 24, Rust, Tauri prerequisites |

The app can't run inside Docker. It needs the real OS to find the game window, capture it, and use the OS text reader. The container is Linux, and the game doesn't run there.

## 1. Checks with Docker (no Rust install needed)

```bash
docker compose run --rm check   # or: npm run check
```

This runs `scripts/check.sh`, the same steps as CI:

- npm install
- eslint + vue-tsc
- vitest
- the fixture replay through Tesseract (`npm run test:fixtures:tesseract`, the engine Windows uses)
- vite build
- `cargo fmt`
- `cargo clippy -D warnings`
- `cargo nextest`
- `cargo deny`

The first run downloads and compiles dependencies (several minutes). Later runs are cached in Docker volumes.

For a shell with `node`, `npm`, `cargo`, `cargo nextest` and `cargo deny`:

```bash
docker compose run --rm shell
```

Notes:

- `node_modules` and the Rust `target/` dir live in Docker volumes, not your checkout, so the Linux builds never clash with anything on the host. To reset them: `docker compose down -v`.
- Windows-only code is **type-checked and linted** in the container (`cargo clippy --target x86_64-pc-windows-msvc`), but its tests only run on CI's Windows runner.
- Most macOS-only code (Vision OCR, input) is type-checked through `scripts/macos-probe/` for `aarch64-apple-darwin`. The `ScreenCaptureKit` files need Apple's SDK and are compiled on CI's macOS runner only.

## 2. Running the app on Windows (including Boot Camp)

One-time setup:

1. **Git for Windows:** <https://git-scm.com/download/win>
2. **Node 24 LTS:** <https://nodejs.org> (or `winget install OpenJS.NodeJS.LTS`)
3. **Microsoft C++ Build Tools:** <https://visualstudio.microsoft.com/visual-cpp-build-tools/>. In the installer, tick **"Desktop development with C++"**.
4. **Rust:** <https://rustup.rs>. Run `rustup-init.exe` and accept the defaults (MSVC toolchain). The repo's `rust-toolchain.toml` installs the pinned version automatically on first build.
5. **WebView2:** already installed on Windows 11 and up-to-date Windows 10.

Then:

```powershell
git clone https://github.com/wavescan/wavescan.git
cd wavescan
npm ci
npm run tauri dev
```

The first `tauri dev` compiles everything (5–10 minutes). After that it's quick, and both the Vue UI and the Rust code hot-reload.

**Checking it works with the game:** open Wuthering Waves, go to **Bag → Echoes**, and click an echo. Then in Wavescan press **Run diagnostics → Run**. You should see:

- a masked preview of the game
- pass/warn badges for window, capture, screen shape and text reading
- a report you can copy

Paste the report into the PR or issue you're testing.

**Click test (auto mode):** after a run, the optional **click test** brings the game to the front and clicks two echoes in the grid. Clicking only selects them; nothing is changed. Type the phrase, press **Run click test**, and don't touch the mouse. If it reports "no change", start your terminal **as administrator** and run `npm run tauri dev` again: Windows silently blocks clicks from a normal app into a game running as admin.

**Boot Camp workflow:** the Mac and Windows sides can't share a live folder, so use GitHub as the bridge. Push a branch from the Mac, then `git pull` on Windows to test against the game. You can also run Claude Code on the Windows side directly.

**Testing auto mode later:** if Wuthering Waves runs as administrator, start your terminal as administrator too. Otherwise Windows blocks the scanner's clicks ([ADR 0006](adr/0006-watch-and-auto-modes-and-fair-play-risk.md)).

## 3. Running the app on macOS (Apple Silicon)

1. Xcode Command Line Tools: `xcode-select --install`
2. Node 24 and Rust (<https://rustup.rs>)
3. `npm ci && npm run tauri dev`

macOS asks for **Screen Recording** permission the first time Wavescan looks for the game. Grant it to your terminal app in dev, or to Wavescan.app in a built bundle, then restart it. The click test (auto mode) also needs **Accessibility**. macOS shows the prompt the first time; turn Wavescan (or your terminal) on under System Settings → Privacy & Security → Accessibility.

Intel Macs can build and run the app, but can't run Wuthering Waves, so real-game testing needs Apple Silicon. Until we have one, macOS testing relies on community testers and the Diagnostics screen ([roadmap](roadmap.md)).

## 4. Tester builds

Every merge to `main` runs `.github/workflows/tester-build.yml`. It builds an Apple Silicon `.dmg` (ad-hoc signed so macOS will open it) and a Windows installer at version `<patch after the latest release>-tester.<run number>`, then replaces the **[tester-build](https://github.com/wavescan/wavescan/releases/tag/tester-build)** pre-release with them, plus `latest.json` and SHA-256 checksums. Installed tester builds update themselves to it ([ADR 0035](adr/0035-in-app-updates.md)). You can also run it by hand from the Actions tab. The commit id is baked in (`WAVESCAN_BUILD`) and shown on the home screen and in Diagnostics reports. Share [testing-guide.md](testing-guide.md) with testers.

Installed apps download the newest game data from wutheringtools.com every time they open ([ADR 0034](adr/0034-download-signed-game-data-on-launch.md)), so a data fix in Wuthering Tools reaches users without a release. The bundled copy is their fallback offline. It's kept current by `.github/workflows/game-data-sync.yml`. Every day it checks wutheringtools.com, and when the published `scanner-data.json` differs from `src/data/`, it opens a **chore: sync game data** PR listing the changed entries. Review that list, then merge it. `npm run data:check` tells you locally whether the snapshot is current ([ADR 0033](adr/0033-automated-game-data-sync.md)).

## 5. Release builds

`npm run tauri build` makes an installer for the current OS in `src-tauri/target/release/bundle/`. A local build never updates itself (it has no `WAVESCAN_BUILD`).

Releases are only built by CI ([ADR 0035](adr/0035-in-app-updates.md)): **Actions → Release → Run workflow** on `main`, with the version (`0.2.0`). It checks that the version is newer than the last release, builds both platforms, tags `v0.2.0`, and publishes a release with `latest.json`. Every installed release then offers the update on its next launch, and installs it on the launch after at the latest. Optional inputs:

- **minimum-version:** versions older than this must update before scanning. Use it only for a version with a known bad bug.
- **notes:** one line shown with the update. The release page also lists the merged PRs.

**The updater key.** Update files are signed with a minisign key: the public half is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, the private half and its password are the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Keep a copy in a password manager: without it, installed copies can't be updated, and everyone would have to reinstall a build with a new key. A tester build without the secrets still builds, but isn't offered as an update; a release fails.

To build a signed update locally (to test updates): set both variables and run `npm run tauri build -- -c src-tauri/tauri.updates.conf.json`. Point a test build at your own update file with another `-c` that sets `plugins.updater.endpoints`.
