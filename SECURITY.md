# Security policy

Wavescan reads your game window and, in auto mode, sends input to it. We take reports seriously.

## Reporting a vulnerability

Please **don't open a public issue.** Use GitHub's **private vulnerability reporting** instead: the *Security* tab → *Report a vulnerability* on this repository. Include steps to reproduce and the affected version.

You'll get an acknowledgement within 7 days. Fixes ship as a signed release, credited to you unless you prefer otherwise.

## In scope

- Anything that lets the scanner capture outside the game window, send input when auto mode isn't armed, or click outside the game window
- Data leaving the machine other than via the documented connections ([architecture.md#network](docs/architecture.md#network))
- The User ID or other identifiers appearing in exports, logs or debug frames
- Tampering with updates or game-data downloads (signature bypass)
- Tauri capability or CSP weaknesses that let web content reach native APIs

## Out of scope

- Game-side anti-cheat decisions (see the Fair Play note in the README)
- Issues that need an already-compromised machine

## Supported versions

Only the latest release gets security fixes. The app's updater (on by default) keeps you current.
