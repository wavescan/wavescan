# Wavescan

> 🌐 [wavescan.app](https://wavescan.app) · **Status: in development, not released yet.** This page describes how the scanner will work at v0.1. Download links appear here once the first signed build ships.

Wavescan is a small, free desktop app for Windows and Mac. It reads your **echoes** from the Wuthering Waves game window and turns them into a file you can import into [Wuthering Tools](https://wutheringtools.com) in one click. No typing in substats one by one.

Characters (level, weapon, forte, resonance chain) and weapons come in later updates. See [What's coming](#whats-coming).

---

## Contents

- [Download](#download)
- [Will it work on my PC/Mac?](#will-it-work-on-my-pcmac)
- [Your first scan](#your-first-scan)
- [Is it safe?](#is-it-safe)
- [Importing into Wuthering Tools](#importing-into-wuthering-tools)
- [Troubleshooting](#troubleshooting)
- [Check your setup (Diagnostics)](#check-your-setup-diagnostics)
- [Reporting a bug](#reporting-a-bug)
- [What's coming](#whats-coming)

---

## Download

| System | File |
|---|---|
| Windows 10/11 (64-bit) | `Wavescan_x.y.z_x64-setup.exe` *(coming soon)* |
| macOS 13+ (Apple Silicon) | `Wavescan_x.y.z_aarch64.dmg` *(coming soon)* |

On Windows 10, Windows draws a yellow border around the game while Wavescan is reading it. That's normal and doesn't affect the scan. Windows 11 lets Wavescan hide it.

Get Wavescan from **[wavescan.app](https://wavescan.app)** or this repository's **[Releases](https://github.com/wavescan/wavescan/releases)** page. The website links to the same Releases files. Every file is:

- **signed** with a Microsoft/Apple-verified certificate, so Windows and macOS know who made it, and
- **built automatically** from the public source code by GitHub, with a checksum you can verify ([how](#verify-your-download)).

Don't download the scanner from anywhere else.

Want to help test early builds? See the [testing guide](docs/testing-guide.md).

## Will it work on my PC/Mac?

You need:

- **Wuthering Waves set to English.** Other languages come later.
- **A 16:9 or 16:10 game window**, e.g. 1920×1080, 2560×1440, 3840×2160, 1920×1200, 2880×1800. Fullscreen and windowed both work. Ultrawide (21:9) isn't supported yet.
- **HDR off** in the game while scanning. HDR shifts colours enough to confuse the reader.

The scanner checks your setup before it starts and tells you exactly what to change if something doesn't fit.

## Your first scan

The scanner has two modes. **Watch mode is the default, and it's what we recommend.**

### Watch mode: you click, the scanner reads

1. Open Wuthering Waves and go to **Bag → Echoes**.
2. Open the scanner and press **Start watching**.
   - *Mac only, first time:* macOS asks for **Screen Recording** permission. Allow it, then reopen the scanner.
3. Click through your echoes in the game at your own pace. Each time the echo details on the right change, the scanner reads them. You'll see a counter go up and a ✓ for each one.
4. When you're done, press **Stop** and review the list. Anything the scanner wasn't sure about is highlighted for you to check.
5. Press **Open in Wuthering Tools** (or **Save file**).

### Auto mode: the scanner clicks for you (optional)

Auto mode clicks through your whole echo list for you. A full 3,000-echo bag takes about 8 minutes, and a "+25 only" scan takes a few minutes.

> ⚠️ **Read this before turning on Auto mode.** Kuro Games' [Fair Play Policy](https://wutheringwaves.kurogames.com/en/main/news/detail/742) prohibits third-party tools and macros. Auto mode sends mouse clicks to the game, which some people consider a macro. We don't know of anyone being banned for scanning, and the scanner never touches the game's memory or files. **But Kuro hasn't said tools like this are allowed, so there is some risk to your account.** Watch mode doesn't send any input to the game, so that risk doesn't apply to it.

To use it:

1. In the scanner, open **Settings → Auto mode**, read the warning and type `I understand` to turn it on.
   - *Windows:* the game usually runs as administrator, and Windows then blocks clicks from normal apps. Close the scanner, right-click it and choose **Run as administrator**. This is only needed for auto mode.
   - *Mac:* macOS asks for **Accessibility** permission (needed to click). Watch mode never asks for this.
2. Go to **Bag → Echoes** in the game, sorted by **Level**.
3. Press **Start auto scan** and **don't touch the mouse or keyboard**.
4. To stop at any time, **move the mouse** or press **F8**. The scanner stops immediately and keeps everything it read so far.

## Is it safe?

We built the scanner so you don't have to trust us. You can check everything yourself.

**What it does**

- It takes pictures of **only the Wuthering Waves window**. Never your whole screen or other apps.
- It reads text from those pictures **on your computer**, using the reader built into Windows or macOS.
- It works out each echo's set by comparing the small set icon with copies of the set icons that come with the app. Nothing is downloaded for this.
- In auto mode only, it sends mouse clicks and key presses to the game window.

**What it never does**

- ❌ It never reads or changes the game's memory, and it doesn't inject anything into the game.
- ❌ It never opens, reads or changes game files.
- ❌ It never collects your data. There are no accounts, no analytics and no tracking.
- ❌ It never uploads your scan. Your scan stays on your computer until *you* paste or open it in Wuthering Tools, which also stores it only in your browser.
- ❌ It never reads your **User ID**. The game prints it in the bottom-right corner. The scanner skips that area and blacks it out of any picture it saves for bug reports.
- ❌ It never saves screenshots, unless you turn on "Save debug frames" yourself.

**The only internet connections it makes** (each one can be switched off in **Settings → Network**):

| Connection | Why | Sends |
|---|---|---|
| `github.com` (Releases) | Checks for a new version of the scanner | Nothing about you, just a request for the latest version number |
| `www.wutheringtools.com` | Downloads the newest list of echoes/characters so new releases are recognised without updating the app *(coming later; scans always work offline with the list built into the app)* | Nothing about you |

You can confirm this with a firewall app like Little Snitch (Mac) or Windows Defender Firewall.

**Open source.** All the code is public in this repository under the GPL-3.0 license.

### Verify your download

Each release lists a SHA-256 checksum and a GitHub build attestation.

- **Windows (PowerShell):** `Get-FileHash .\Wavescan_*.exe`
- **Mac (Terminal):** `shasum -a 256 ~/Downloads/Wavescan_*.dmg`

The result should match the checksum on the Releases page. With the [GitHub CLI](https://cli.github.com) you can also run `gh attestation verify <file> --repo wavescan/wavescan`. That proves GitHub built the file from this repository's code.

## Importing into Wuthering Tools

- **One click:** press **Open in Wuthering Tools**. The scanner copies your scan and opens the import page. Click **Paste from scanner**.
- **File:** press **Save file**, then drag the `.json` file onto the Wuthering Tools import page.

Before anything is saved, Wuthering Tools shows you what's new and flags possible duplicates. By default, echoes below +25 are skipped, and you can include them if you want.

## Troubleshooting

**"Game window not found"**
Make sure Wuthering Waves is running and isn't minimised.

**"Layout not recognised"**
This usually means one of these:

- The game isn't in English.
- The window isn't 16:9 or 16:10.
- HDR is on.
- You're not on the **Bag → Echoes** screen.

The message tells you which one it is.

**Mac: the scanner shows a black window**
Go to **System Settings → Privacy & Security → Screen Recording**, turn on *Wavescan*, then quit and reopen the scanner.

**Windows: "Windows protected your PC"**
This shouldn't appear for signed releases. If it does, check that you downloaded from this repository's Releases page, then click **More info → Run anyway**.

**Mac: auto mode or the click test says "permission needed: Accessibility"**
Go to **System Settings → Privacy & Security → Accessibility**, turn on *Wavescan*, then try again.

**Auto mode doesn't click anything (Windows)**
The game is probably running as administrator, so Windows blocks the scanner's clicks. If you see "Windows didn't let Wavescan move the mouse", that's the cause. Close the scanner, right-click it, choose **Run as administrator** and try again.

**Some values are wrong**
Fix them in the review screen before exporting, and please [report it](#reporting-a-bug) so we can improve the reader. Uncertain fields are shown in yellow with a grey "Read as: …" line underneath. Copying that line into your report helps a lot.

## Check your setup (Diagnostics)

On the home screen, press **Run diagnostics**. With the game open on **Bag → Echoes** and an echo selected, Wavescan checks that it can:

- find the game window
- capture it smoothly
- read the echo text
- read the selected echo the same way a scan does (it shows what it found, such as "WhiffWhaff +0, 2★, main stat HP")
- on Windows, tell whether Wavescan is running as administrator, which auto mode usually needs

It shows a preview with your User ID blacked out and gives you a report you can copy. The report contains no pictures. The basic checks never click anything in the game.

There's also an optional **click test** for auto mode. After the same Fair Play warning and typed confirmation as auto mode, it brings the game to the front and clicks two echoes in your grid. Clicking only selects them; nothing is changed. Moving the mouse stops it instantly.

## Reporting a bug

Open an issue on this repository. If the scanner misread something, use **Help → Export bug report**. It saves the pictures it used, **with your User ID blacked out**, and nothing else. Have a look at them before attaching them.

Found a security problem? Please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## What's coming

| Version | What it adds |
|---|---|
| **v0.1** | Echoes. Watch + auto mode, Windows + Mac |
| v0.2 | Characters: level, ascension, weapon, forte levels, resonance chain, equipped echoes |
| v0.3 | Weapon inventory |
| Later | More languages, ultrawide screens |

---

*Wavescan is a fan project. It isn't affiliated with or endorsed by Kuro Games. Wuthering Waves and related names and images are trademarks of Kuro Games.*

Developers: see [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/architecture.md](docs/architecture.md).
