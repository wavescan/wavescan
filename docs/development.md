# Development setup

There are two ways to work on Wavescan:

| Where | What you can do | What you need |
|---|---|---|
| **Any machine with Docker** | Lint, type-check, unit tests, Rust lint/tests for the OS-independent code, supply-chain checks | Docker Desktop |
| **Windows or an Apple Silicon Mac** | Run the actual app (`npm run tauri dev`) against the real game | Node 24, Rust, Tauri prerequisites |

The app can't run inside Docker. It needs the real OS to find the game window, capture it, and use the built-in OCR. The container is Linux, and the game doesn't run there.

## 1. Checks with Docker (no Rust install needed)

```bash
docker compose run --rm check   # or: npm run check
```

This runs `scripts/check.sh`, the same steps as CI:

- npm install
- eslint + vue-tsc
- vitest
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

## 4. Release builds

`npm run tauri build` makes an installer for the current OS in `src-tauri/target/release/bundle/`. Official, signed releases are only built by CI ([ADR 0011](adr/0011-signing-provenance-and-updater.md)).
