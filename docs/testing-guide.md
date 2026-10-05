# Testing Wavescan (early tester builds)

Thanks for helping test! This takes about **10 minutes**. You'll install an early build, let it look at your game, and send back a short text report. **Nothing is uploaded automatically.** You choose what to paste.

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

1. Start Wuthering Waves and go to **Bag → Echoes**. Click any echo so its details show on the right.
2. In Wavescan, click **Run diagnostics**, then **Run**. Don't minimise the game.
3. **Mac, first time:** macOS asks for **Screen Recording** permission.
   - Click **Open System Settings** and turn on **Wavescan**.
   - **Quit Wavescan and open it again** (macOS requires this), then repeat step 2.
   - Each new tester build may ask again. That's normal for unsigned builds.

You'll see a preview of the game (your **User ID is blacked out**), a list of checks, and a **Report**.

## 4. Optional: click test

This checks whether Wavescan's clicks reach the game, which the future *auto mode* needs.

- It brings the game to the front and **clicks two echoes in your Bag grid**. Clicking only selects them; nothing is upgraded, locked or discarded.
- Read the Fair Play note on screen. If you're comfortable, type `I understand` and press **Run click test**. **Don't touch the mouse** until it finishes; moving it stops the test immediately.
- **Mac:** the first time, macOS asks for **Accessibility** permission. Turn on Wavescan in System Settings → Privacy & Security → Accessibility, then run the test again.
- **Windows:** if it says the panel didn't change, close Wavescan, right-click it → **Run as administrator**, and try again. Note in your message that you did this.

Skipping this test is completely fine.

## 5. Send the report

Click **Copy report** and paste it in the Discord testing thread. Also mention:

- your computer: Mac model, or Windows PC with its GPU
- your game resolution and display mode (fullscreen/windowed)
- anything that looked wrong in the preview

**What's in the report:** the app version, your window size and scale, capture speed, the text Wavescan read from the echo panel (echo name and stats), and the click test result. **What's not in it:** pictures, your User ID, or the names of any other apps you have open.

## Removing Wavescan

- **Mac:** drag Wavescan from Applications to the Trash. To also remove its permissions, turn it off in System Settings → Privacy & Security → Screen Recording / Accessibility.
- **Windows:** Settings → Apps → Wavescan → Uninstall.

Questions or something broke? Post in the thread. Even "it didn't open" is useful information.
