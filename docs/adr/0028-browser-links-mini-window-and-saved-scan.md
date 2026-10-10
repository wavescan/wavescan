---
status: accepted
date: 2026-10-10
tags: [ui, security, dependencies, privacy]
---

# 28. Open GitHub pages in the browser, a mini window, and a saved copy of the scan

## Context

The UI redesign (sidebar layout, Review & export, Help & feedback, Report a problem) needs three things the app couldn't do before:

1. **Open a web page in the user's browser.** "Report a problem" fills in a GitHub "new issue" page, "Read the source" opens the commit the build came from, and the auto-mode risk step links to Kuro's Fair Play Policy. Until now users had to find these pages by hand, and bug reports arrived without the version, build or what was read.
2. **A small always-on-top window.** People playing on one screen can't see Wavescan's counter while the game is in front. Resizing the window and keeping it on top needs `core:window` permissions the webview doesn't have.
3. **Keep the scan if the app is closed before exporting.** The list lived only in memory, so closing the window or a crash lost a long watch-mode session.

Options for opening pages:

- **`tauri-plugin-opener`** (Tauri team, MIT/Apache-2.0). Its `open_url` command has a URL scope in the capability file, so the webview can only open the URLs we list. It hands the URL to the OS (`ShellExecute` / `NSWorkspace`), which opens the default browser.
- **Our own command calling `ShellExecuteW` / `NSWorkspace openURL`.** Same OS calls, plus `unsafe` FFI and a URL check we'd write and test ourselves, in Rust the maintainer doesn't read day to day.
- **Show the URL and let the user copy it.** Works, but a report link carrying the filled-in text is long and unpleasant to copy.

## Decision

- **Add `tauri-plugin-opener` 2**, registered in `lib.rs`, and grant only `opener:allow-open-url` with this scope:
  - `https://github.com/wavescan/wavescan/*` (issues, the source tree at a commit, releases, licence, security policy)
  - `https://wutheringwaves.kurogames.com/en/main/news/detail/742` (the Fair Play Policy, from the auto-mode risk step)

  Not `opener:default`, so `open_path`, `reveal_item_in_dir` and any other URL are refused. `src/feedback/links.ts` holds the same list and `openUrl` checks it first; `tests/feedback.spec.ts` fails if the two lists drift apart.
- **Opening a page is not a Wavescan network connection.** The browser fetches the page; Wavescan sends nothing and the CSP is unchanged. The README connections table and `docs/architecture.md#network` say so explicitly, and Help & feedback counts pages opened in its session list.
- **Bug reports are text the user sees in full before anything leaves the app** (`src/feedback/issue.ts`). They go in the GitHub link's `title` and `body`, and GitHub only posts them when the user presses Submit. Reports contain: the user's note, what was read for the chosen echo (raw name/level/main-stat text and the parsed substats), app version, build, platform, game size, text reader, mode and game-data hash. They never contain pictures, the User ID (never read), account names, other windows' titles or file paths. Bodies over 6,000 characters are cut in the link and the full text is put on the clipboard.
- **Grant `core:window:allow-set-always-on-top`, `allow-set-size` and `allow-set-min-size`** for the mini window (`setMiniWindow` in `src/ipc/commands.ts`). It's only entered and left by the user's button press, and stopping a scan leaves it.
- **Keep the scan in the webview's `localStorage`** (`src/review/scanStore.ts`, key `wavescan.scan.v1`). It holds the scanned echoes (what the export holds, the user's fixes, and the raw OCR text of the echo panel's name, level and stat lines), the game size and the scan mode. Never pictures, never the User ID. Home offers to continue or discard it, starting a new scan replaces it, and **Clear this scan** deletes it. Damaged or blocked storage is ignored (the scan still works, only the safety copy is lost).

## Consequences

- Pros:
  - Reporting a misread takes a couple of clicks, and every report says which build and what was read.
  - The page a user lands on is limited to our repository and one policy page, enforced in Rust, not just in TypeScript.
  - A long watch session survives closing the app.
- Cons:
  - New crate `tauri-plugin-opener` (and its dependency `open`). It passes `cargo deny`.
  - The saved scan sits in the webview's storage folder on disk until it's exported and cleared, or replaced. It's game data the user would export anyway, but it is now on disk; README "Is it safe?" says so.
  - Window permissions let the webview resize the window and keep it on top. A compromised webview could make the window annoying, not reach anything else.

## Guidance

- **Do** add a URL to both `links.ts` and the capability scope in the same change, with a reason. A host the app itself connects to still needs ADR 0010's process.
- **Don't** grant `opener:default`, `allow-open-path` or `allow-reveal-item-in-dir`.
- **Don't** put pictures, the User ID region or anything outside the echo panel in a report or in the saved scan.
- When Wuthering Tools ships its `/import/scan` page (ADR 0009), add that URL to the scope for "Open in Wuthering Tools".

## Related

- `src/feedback/links.ts`, `src/feedback/issue.ts`, `src/ipc/commands.ts` (`openUrl`, `setMiniWindow`), `src/review/scanStore.ts`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`
- [ADR 0009](./0009-handoff-via-file-and-clipboard-no-server.md), [ADR 0010](./0010-no-telemetry-network-allowlist.md), [ADR 0013](./0013-user-id-masking.md)
