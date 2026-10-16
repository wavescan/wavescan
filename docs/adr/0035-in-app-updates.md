---
status: accepted
date: 2026-10-16
tags: [distribution, network, security, supply-chain, ui]
supersedes: [10, 11]
---

# 35. In-app updates: two channels, installed at the next launch at the latest

## Context

Every Wavescan fix (an OCR bug, a speed-up, a new screen) only reached people who went back to GitHub, downloaded a new installer and ran it. Most don't, so bug reports keep coming from old versions. [ADR 0034](./0034-download-signed-game-data-on-launch.md) solved this for game data, but the app itself still needs a new installer.

[ADR 0011](./0011-signing-provenance-and-updater.md) chose the Tauri updater plugin with a minisign key, and said update checks could be turned off ([ADR 0010](./0010-no-telemetry-network-allowlist.md)). It didn't say how updates are shown, how tester builds fit in, or how releases are made.

One option was to ship only the web part (UI, OCR settings) and swap it at runtime. It was rejected: running downloaded code in the webview breaks the "no remote scripts" rule, and Rust changes (capture, input, the safety guard) would still need an installer, so there would be two update systems. A full update is about 6 MB and takes seconds.

## Decision

- **Tauri updater** (`tauri-plugin-updater`, `tauri-plugin-process` for the restart on macOS). Rust downloads the update file and the installer from GitHub Releases, and refuses an installer that isn't signed with the minisign key whose public half is in `tauri.conf.json` (`plugins.updater.pubkey`). The private key and its password are the GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, plus the maintainer's password manager. It's a different key from the game-data key (ADR 0034).
- **Two channels**, built into each copy:
  - **Stable:** `releases/latest/download/latest.json`. Only releases made with Actions → **Release** (`release.yml`): a version typed in, tagged `vX.Y.Z` on main.
  - **Tester:** `releases/download/tester-build/latest.json` (`tauri.tester.conf.json`). Every merge to main (`tester-build.yml`) is `<patch after the latest release>-tester.<run number>`, so each one is newer than the last.
  - The channel follows the version: tester builds stay on tester builds, releases on releases.
- **How it's shown** (`src/update/updater.ts`):
  1. On launch: check once. A newer version downloads in the background and **"Restart to update"** appears.
  2. Not installed by the next launch: it **installs at launch**, on a "Updating Wavescan" screen with **Not now** (for that session only).
  3. If `latest.json`'s `minimumVersion` is above this version, it installs at once with no "Not now". If that fails, the user can carry on with a warning. `release.yml` takes the minimum as an optional input, for a known bad version.
  4. Never while a scan runs: a restart waits for the scan to end.
- **No off switch.** Old versions misread echoes and send reports about bugs already fixed, which is what this solves. The check sends what any download sends (an IP address, plus a user agent with the version and OS); no ID. Help shows the channel and update status, and "What Wavescan did this session" counts the connections. This replaces "toggleable" (ADR 0010) and "update checks can be turned off" (ADR 0011) for updates.
- **Local builds never update themselves** (no `WAVESCAN_BUILD`), so `npm run tauri dev` and hand-built installers are left alone.
- **Windows installs only with NSIS** (the MSI target is dropped): the updater runs it in passive mode and it reopens the app. One installer, with a fixed name on each release (`Wavescan_x64-setup.exe`), so `releases/latest/download/Wavescan_x64-setup.exe` is the link to share.
- **Versions** are set by CI only (`scripts/set-version.mjs`), never committed. `package.json` stays the version local builds report.
- **Release builds are signed for updates, not yet for the OS.** Authenticode and notarization (ADR 0011) stay planned; they only remove the SmartScreen / Gatekeeper warning on the one-time install.

## Consequences

- Pros:
  - A fix reaches everyone on their next launch or two, with no installer to find.
  - A tampered or unsigned installer is refused. Tested by serving one to an installed copy: it downloaded it and didn't install it.
  - Testers get each merge without reinstalling.
- Cons:
  - Losing the updater key strands every installed copy: they'd need one manual install of a build with a new key. Back it up.
  - New connections to `github.com` and GitHub's download host, about one small request per launch, plus ~6 MB per update.
  - Copies installed before this have no updater: everyone installs once more.
  - `latest.json` itself isn't signed (only the installers are). Someone who could change it could only block scanning with a fake `minimumVersion`, or offer an update that then fails its signature check.
  - macOS updates are untested until a Mac tester tries one.

## Guidance

- **Do** release from Actions → Release, never by hand-uploading files: `latest.json` must name exactly the signed files.
- **Do** keep the version rules: releases `X.Y.Z`, tester builds `X.Y.Z-tester.N`. The updater installs only higher versions, and `src/update/version.ts` orders them.
- **Don't** add headers, IDs or query strings to the update check.
- **Don't** install while `navigation.busy`.
- **Don't** set `minimumVersion` lightly: it interrupts everyone below it.

## Related

- `src/update/` (`updater.ts`, `version.ts`, `tauriUpdater.ts`), `src/components/UpdateBanner.vue`, `src/components/UpdateLaunchScreen.vue`, `tests/update.spec.ts`
- `.github/workflows/build-app.yml`, `tester-build.yml`, `release.yml`, `scripts/set-version.mjs`, `scripts/updater-manifest.mjs`
- `src-tauri/tauri.conf.json` (`plugins.updater`), `tauri.updates.conf.json`, `tauri.tester.conf.json`, `capabilities/default.json`
