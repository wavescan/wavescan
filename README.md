<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/wavescan-mark-white.svg">
  <img src="docs/brand/wavescan-mark-ink.svg" width="72" alt="">
</picture>

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
- [Change how it looks](#change-how-it-looks)
- [Troubleshooting](#troubleshooting)
- [Check your setup (Diagnostics)](#check-your-setup-diagnostics)
- [Reporting a bug](#reporting-a-bug)
- [What's coming](#whats-coming)

---

## Download

| System | File |
|---|---|
| Windows 10/11 (64-bit) | `Wavescan_x64-setup.exe` *(coming soon)* |
| macOS 13+ (Apple Silicon) | `Wavescan_aarch64.dmg` *(coming soon)* |

You only download it once. **Wavescan updates itself:** when there's a new version, it downloads it in the background and shows **Restart to update**. If you don't restart, it installs the next time you open it. It never updates in the middle of a scan.

On Windows 10, Windows draws a yellow border around the game while Wavescan is reading it. That's normal and doesn't affect the scan. Windows 11 lets Wavescan hide it.

Get Wavescan from **[wavescan.app](https://wavescan.app)** or this repository's **[Releases](https://github.com/wavescan/wavescan/releases)** page. The website links to the same Releases files. Every file is:

- **built automatically** from the public source code by GitHub, with a checksum you can verify ([how](#verify-your-download)), and
- **signed for updates:** the app only installs an update signed with our key, so nobody else can push one to you.

The installers aren't signed with a Microsoft or Apple certificate yet, so Windows or macOS warns you once, when you first install. That's planned.

Don't download the scanner from anywhere else.

Want to help test early builds? See the [testing guide](docs/testing-guide.md).

## Will it work on my PC/Mac?

You need:

- **Wuthering Waves set to English.** Other languages come later.
- **A 16:9 or 16:10 game window**, e.g. 1920×1080, 2560×1440, 3840×2160, 1920×1200, 2880×1800. Fullscreen and windowed both work. Ultrawide (21:9) isn't supported yet.
- **HDR off** in the game while scanning. HDR shifts colours enough to confuse the reader.

The scanner checks your setup before it starts and tells you exactly what to change if something doesn't fit.

## Your first scan

The scanner has two modes. **Watch mode is the default, and it's what we recommend.** Either way, it only reads echoes at **+5 and up**. Lower ones have no substats yet, so they're skipped.

### Watch mode: you click, the scanner reads

1. Open Wuthering Waves and go to **Bag → Echoes**.
2. Open the scanner. The **Game setup** list on the home screen shows whether it can see the game. On **Scan**, type **your in-game name** once (see below), then press **Start watching**.
   - *Mac only, first time:* macOS asks for **Screen Recording** permission. Allow it, then reopen the scanner.
3. Click through your echoes in the game at your own pace. Each time the echo details on the right change, the scanner reads them. You'll see the echo it just read, a counter, and how many need a look.
   - Playing on one screen? Press **Mini window** for a small counter that stays on top of the game.
   - If you go to another screen in the game, or a popup covers the bag, the scanner stops reading and says so. Go back to **Bag → Echoes** (or close the popup) and it carries on.
4. When you're done, press **Stop and review**. Each echo shows its picture from the game, so you can spot it quickly. Anything the scanner wasn't sure about is marked **check**. Press **Check them now** to go through them one by one. For a stat, the scanner only offers values the game can actually roll.
5. Press **Copy and open Wuthering Tools** (see [Importing into Wuthering Tools](#importing-into-wuthering-tools)). **Save file** is coming.

If you close the scanner before exporting, it offers to carry on with that scan next time.

**Who has each echo equipped.** The scanner reads the "Equipped by" line too. For your main character (Rover), the game shows the name *you* chose instead of "Rover", so the scanner asks for it: **Your in-game name** on the Scan screen (it's in **Settings** too). Without it, echoes on your main character are marked **check**. Your name stays on your computer: the scan says "Rover", and bug reports and Diagnostics reports hide it. Sometimes the game shows the "Equipped by" line a moment after the rest of the echo (more often on a PC that's short of memory). Watch mode notices, reads the line then, and marks it **check** so you can confirm it's the right character.

### Auto mode: the scanner clicks for you (optional)

Auto mode clicks through your echo list for you. A "+25 only" scan (the default) takes a few minutes, and reading everything from +5 up in a full 3,000-echo bag takes up to about 8 minutes.

> ⚠️ **Read this before turning on Auto mode.** Kuro Games' [Fair Play Policy](https://wutheringwaves.kurogames.com/en/main/news/detail/742) prohibits third-party tools and macros. Auto mode sends mouse clicks to the game, which some people consider a macro. We don't know of anyone being banned for scanning, and the scanner never touches the game's memory or files. **But Kuro hasn't said tools like this are allowed, so there is some risk to your account.** Watch mode doesn't send any input to the game, so that risk doesn't apply to it.

To use it:

1. In the scanner, open **Scan → Auto mode**. It walks you through four steps: the warning above, permissions, getting the game ready, then typing `I understand`. You type it again for every auto scan.
   - *Windows:* auto mode needs the scanner to run as administrator, because Windows blocks clicks from normal apps into the game. Close the scanner, right-click it and choose **Run as administrator**. Watch mode never needs this.
   - *Mac:* macOS asks for **Accessibility** permission (needed to click). Watch mode never asks for this.
2. Go to **Bag → Echoes** in the game, sorted by **Level** (highest first). Choose which echoes to read: **+25 only** (the default), or from a lower level up, down to **+5 and up**. The scan stops at the first echo below that level. Echoes below +5 are never read.
3. Press **Start auto scan** and **don't touch the mouse or keyboard**. Before it clicks anything, the scanner checks that the game is on **Bag → Echoes** with an echo selected and no menu open. If not, it doesn't start, and tells you what to fix. The scanner scrolls back to the top of the list first, then reads every echo and scrolls down by itself. A big "Hands off the mouse" banner shows how far it's got.
4. To stop at any time, **move the mouse** or press **F8**. The scanner stops immediately and keeps everything it read so far.

At the end of the list the scanner clicks the empty spaces in the last row and tries to scroll once more. That's how it makes sure it really is the end.

**Known gap:** if two echoes next to each other look exactly the same on the details panel (same echo, same main stat, same substats, so only on low-level echoes with a single substat), the scanner can't tell it moved and reads only the first. That's true even when their sonata sets differ.

## Is it safe?

We built the scanner so you don't have to trust us. You can check everything yourself.

**What it does**

- It takes pictures of **only the Wuthering Waves window**. Never your whole screen or other apps.
- It reads text from those pictures **on your computer**. On Windows it uses Tesseract, a free text reader that comes inside the app, because it reads echoes far more accurately than the one built into Windows. On macOS it uses the reader built into macOS. Nothing is downloaded or uploaded for this.
- It works out each echo's set by comparing the small set icon with reference copies of the set icons. The copies come with the app, and newer ones arrive with the game-data download below. Your pictures are never uploaded for this.
- Each time it opens, it downloads the newest list of echoes, sets and their pictures from Wuthering Tools, so new echoes and fixes are recognised without updating the app. See the table below.
- Each time it opens, it checks GitHub for a new version of the scanner, and installs one only if it's signed with our key. See the table below.
- It opens a web page only when you click a link in **Help & feedback**, **Report a problem**, the auto mode warning or **Copy and open Wuthering Tools**, and only pages on this GitHub repository, Kuro's Fair Play Policy or Wuthering Tools' Settings page. Your browser opens them; the scanner itself doesn't connect to anything.
- It keeps a copy of your current scan on your computer (echo stats only, no pictures) so you don't lose it if you close the app. **Clear this scan** on the Review screen deletes it.
- It keeps your in-game name on your computer, if you enter it, to recognise echoes on your main character. It's never put in the scan or in a report.
- In auto mode only, it sends mouse clicks and wheel scrolls to the game window. While auto mode is on, it also listens for **F8** so you can stop it; F8 goes back to normal as soon as auto mode stops.

**What it never does**

- ❌ It never reads or changes the game's memory, and it doesn't inject anything into the game.
- ❌ It never opens, reads or changes game files.
- ❌ It never collects your data. There are no accounts, no analytics and no tracking.
- ❌ It never uploads your scan. Your scan stays on your computer until *you* paste or open it in Wuthering Tools, which also stores it only in your browser.
- ❌ It never reads your **User ID**. The game prints it in the bottom-right corner. The scanner skips that area and blacks it out of any picture it saves for bug reports.
- ❌ It never saves screenshots, unless you turn on "Save debug frames" yourself.

**The only internet connections it makes:**

| Connection | Why | Sends |
|---|---|---|
| `github.com` (Releases) | Each time the app opens, checks for a new version of the scanner, and downloads it (about 6 MB) when there is one. It only installs a version signed with our key. | Nothing about you: a request for the latest version file, which says your version and system, like any download |
| `www.wutheringtools.com` | Each time the app opens, downloads the newest list of echoes, sets and characters, and their pictures, so new echoes and fixes are recognised without updating the app. The list is signed by Wuthering Tools, and the app ignores anything that isn't. Without internet, it uses the list it already has. | Nothing about you. It's the same public file for everyone: no account, no ID, no cookies |

Neither has an off switch, because an old list or an old version means misread echoes. If you block them in a firewall, the scanner keeps working with what it has. **Help & feedback** shows whether your list and your version are up to date.

You can confirm this with a firewall app like Little Snitch (Mac) or Windows Defender Firewall. **Help & feedback → What Wavescan did this session** also lists what it captured, how many clicks it sent and which pages it opened.

**Open source.** All the code is public in this repository under the GPL-3.0 license.

### Verify your download

Each release lists a SHA-256 checksum and a GitHub build attestation.

- **Windows (PowerShell):** `Get-FileHash .\Wavescan_*.exe`
- **Mac (Terminal):** `shasum -a 256 ~/Downloads/Wavescan_*.dmg`

The result should match the checksum on the Releases page. With the [GitHub CLI](https://cli.github.com) you can also run `gh attestation verify <file> --repo wavescan/wavescan`. That proves GitHub built the file from this repository's code.

## Importing into Wuthering Tools

1. On the **Review** screen, press **Copy and open Wuthering Tools**. The scanner copies your scan and opens Wuthering Tools' Settings in your browser.
2. Open **Wavescan**, paste the scan and choose whether to add to your echoes or replace them.

Wuthering Tools checks every echo first and lists any it skipped, with the reason. Echoes you already have aren't added twice, and locked echoes are never removed. **Copy scan only** copies without opening the browser.

## Change how it looks

The scanner has three colour schemes, each taken from Wuthering Waves itself: **Echo Glass** (like the game's echo screen, the default), **Solaris Gold** (like the official website) and **Jade & Blossom** (like Jinzhou). Pick one in **Settings → Appearance**, and choose dark, light, or match your computer. The choice stays on your PC.

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

**"Can't see Bag → Echoes in the game"**
The scanner reads the word **Echoes** at the top left of the bag to know it's on the right screen. Open the bag and pick the Echoes tab. A popup (an item's details, a tutorial) blurs the whole bag, so close it. If you're already there, run **Diagnostics**: its "Read the selected echo" line shows what the scanner read there. A game that isn't in English always shows this message for now.

**Mac: the scanner shows a black window**
Go to **System Settings → Privacy & Security → Screen Recording**, turn on *Wavescan*, then quit and reopen the scanner.

**Windows: "Windows protected your PC"**
This shouldn't appear for signed releases. If it does, check that you downloaded from this repository's Releases page, then click **More info → Run anyway**.

**Mac: auto mode or the click test says "permission needed: Accessibility"**
Go to **System Settings → Privacy & Security → Accessibility**, turn on *Wavescan*, then try again.

**F8 doesn't stop auto mode**
Another app is probably using F8 already (the auto mode screen says so). Move the mouse instead: that always stops it.

**Auto mode doesn't click anything (Windows)**
Auto mode needs the scanner to run as administrator. Without it, Windows blocks the scanner's clicks, sometimes without any error. Close the scanner, right-click it, choose **Run as administrator** and try again.

**Some values are wrong**
Fix them on the Review screen before exporting. Values the scanner wasn't sure about have an amber **check** label: click one, then pick what the game shows (only values the game can roll are offered) or press **Looks right**. Then press **Report this misread**, so we can improve the reader. The report already includes what the scanner read.

## Check your setup (Diagnostics)

The home screen's **Game setup** list checks the basics (game running, not minimised, screen shape, administrator for auto mode) every few seconds. For the full check, open **Diagnostics** in the sidebar. With the game open on **Bag → Echoes** and an echo selected, Wavescan checks that it can:

- find the game window
- capture it smoothly
- read the echo text
- read the selected echo the same way a scan does (it shows what it found, such as "WhiffWhaff +0, 2★, main stat HP")
- on Windows, tell whether Wavescan is running as administrator, which auto mode needs

It shows a preview with your User ID blacked out and gives you a report you can copy. The report contains no pictures. The basic checks never click anything in the game.

The preview has boxes drawn on it showing exactly where Wavescan reads. Each box should sit on its text: the echo's name, level, stats and so on. If the boxes are shifted, Wavescan will misread, and a picture of that is the most useful thing you can send with a bug report. **Copy picture** copies the preview as shown (User ID still blacked out). Untick **Show what Wavescan reads** to hide the boxes.

There's also an optional **click test** for auto mode. After the same Fair Play warning and typed confirmation as auto mode, it brings the game to the front and clicks the second and then the first echo in your grid, so you should see the selection move twice. Clicking only selects them; nothing is changed. Moving the mouse stops it instantly.

## Reporting a bug

In the scanner, open **Help & feedback → Report a problem**, or press **Report** on an echo. Choose what went wrong and add a note. The scanner writes the report for you (version, build, screen size and what it read) and shows you every word. **Open on GitHub** opens a new issue in your browser with it filled in. Nothing is posted until you press **Submit** on GitHub. No GitHub account? Press **Copy text** and share it with the testers on Discord.

The report never includes pictures or your User ID. To add a picture, use **Copy picture** on the Diagnostics screen (User ID blacked out) and paste it into the issue yourself. (**Export bug report**, which saves the pictures a scan used with your User ID blacked out, is coming.)

**Help & feedback** also has a troubleshooting guide that works offline, and **Read the source** opens the exact code your copy was built from.

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
