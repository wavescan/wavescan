# Testing Wavescan (early tester builds)

Thanks for helping test! This takes about **15 minutes**. You'll install an early build, let it look at your game, and send back a short text report. **Nothing is uploaded automatically.** You choose what to paste.

> These are **unsigned test builds**, not official releases. Your computer will warn you that it can't verify the developer; the steps below show how to open it anyway. Official releases will be signed.

## What you need

- **Mac:** an Apple Silicon Mac (M1 or newer) with Wuthering Waves installed, macOS 13 or newer.
- **Windows:** Windows 10 or 11 with Wuthering Waves installed.
- Wuthering Waves set to **English**, with **HDR off**.

## 1. Download

Open the **[Tester build](https://github.com/wavescan/wavescan/releases/tag/tester-build)** page and download:

- **Mac:** the file ending in `aarch64.dmg`
- **Windows:** the file ending in `x64-setup.exe`

*(Optional)* `SHA256SUMS.txt` lists the checksum of each file if you want to verify it.

## 2. Install and open

### Mac

1. Open the `.dmg` and drag **Wavescan** into **Applications**.
2. Open Wavescan from Applications. macOS will say it **can't verify** the app. Click **Done** (not "Move to Trash").
3. Go to **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to the Wavescan message. Confirm with your password. (On macOS 13–14 you can instead right-click Wavescan in Applications → **Open**.)

### Windows

1. Run the `setup.exe`. If **"Windows protected your PC"** appears, click **More info → Run anyway**.
2. Finish the installer and open **Wavescan** from the Start menu.

## 3. Run Diagnostics

1. Start Wuthering Waves and go to **Bag → Echoes**. Click any echo so its details show on the right. If you have one, pick an echo that's **levelled part-way** (for example +5 or +12, not +0 and not fully levelled). That helps us check the rarity detection.
2. In Wavescan, click **Run diagnostics**, then **Run**. Don't minimise the game.
3. **Mac, first time:** macOS asks for **Screen Recording** permission.
   - Click **Open System Settings** and turn on **Wavescan**.
   - **Quit Wavescan and open it again** (macOS requires this), then repeat step 2.
   - Each new tester build may ask again. That's normal for unsigned builds.

You'll see a preview of the game (your **User ID is blacked out**), a list of checks, and a **Report**. The **Read the selected echo** check shows what Wavescan thinks the echo is. Tell us if anything in it is wrong (name, level, rarity ★, or main stat).

## 4. Watch mode

This is the scan itself. Wavescan only watches; it never clicks anything.

1. On the Wavescan home screen, open **Scan echoes** and press **Start watching**.
2. In the game, click through **3–5 different echoes**, pausing about a second on each. Different rarities and levels are the most useful.
3. Check each row in Wavescan against the game: name, `+level`, rarity (★) and main stat. Yellow means Wavescan wasn't sure. The grey **Read as: …** line under a row shows the text it actually read.
4. Press **Copy scan for Wuthering Tools**, and also copy the list of rows (select it and copy, including the **Read as** lines).

## 5. Optional: click test

This checks whether Wavescan's clicks reach the game, which the future *auto mode* needs.

- It brings the game to the front and **clicks two echoes in your Bag grid**. Clicking only selects them; nothing is upgraded, locked or discarded.
- Read the Fair Play note on screen. If you're comfortable, type `I understand` and press **Run click test**. **Don't touch the mouse** until it finishes; moving it stops the test immediately.
- **Mac:** the first time, macOS asks for **Accessibility** permission. Turn on Wavescan in System Settings → Privacy & Security → Accessibility, then run the test again.
- **Windows:** Wuthering Waves usually runs as administrator, and Windows then blocks clicks from normal apps. **Before** the test, close Wavescan, right-click it → **Run as administrator**, and run Diagnostics again. The **Find game window** check says whether Wavescan is running as administrator. If the test still fails, mention that in your message.

Skipping this test is completely fine.

## 6. Send the report

Click **Copy report** and paste it in the Discord testing thread, along with the watch-mode scan and rows from step 4. Also mention:

- your computer: Mac model, or Windows PC with its GPU
- your game resolution and display mode (fullscreen/windowed)
- anything that looked wrong in the preview

**What's in the report:** the app version, your window size and scale, whether Wavescan runs as administrator (Windows), capture speed, the text Wavescan read from the echo panel (echo name and stats) and what it made of it, and the click test result. **What's not in it:** pictures, your User ID, or the names of any other apps you have open.

## Removing Wavescan

- **Mac:** drag Wavescan from Applications to the Trash. To also remove its permissions, turn it off in System Settings → Privacy & Security → Screen Recording / Accessibility.
- **Windows:** Settings → Apps → Wavescan → Uninstall.

Questions or something broke? Post in the thread. Even "it didn't open" is useful information.
