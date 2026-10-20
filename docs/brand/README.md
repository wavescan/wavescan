# The Wavescan mark

A cube whose top-right corner breaks into pixels: something solid in the game becomes data.

| File | Use |
|---|---|
| `wavescan-mark-white.svg` | The mark on dark backgrounds (transparent, centred on its outline) |
| `wavescan-mark-ink.svg` | The same mark for light backgrounds |
| `wavescan-mark-white-1024.png` | A large PNG for places that don't take SVG |
| `../../src-tauri/icons/source.svg` | The app icon: the white mark on a dark tile |
| `../../src-tauri/icons/source-small.svg` | The app icon at 16-32 px (see below) |
| `../../src/components/WavescanMark.vue` | The mark inside the app (sidebar) |

The shapes were traced from the original artwork (`T_Logo_12_UI.png`, 360 px) into six
straight-edged pieces. Each edge is within half a pixel of the original. All the files above
share the same path data: if the mark changes, change it everywhere.

## Placement

- **On its own** (these SVGs): centred on its outline.
- **In the app icon:** nudged up by half the gap between its outline centre and its visual
  weight. The solid faces sit bottom-left, so a mark centred on its outline looks low in a tile.
- **At 16-32 px:** the smallest pixel turns into a smudge, so `source-small.svg` leaves it out and
  draws the mark larger. `npm run icons:update` builds every size (`scripts/update-app-icon.mjs`).

## What the UI borrows from it

The look of the app (`src/style.css`) follows the mark:

- **Flat pieces, sharp corners.** Boxes round by 4 px, chips by 2 px. The mark has no curves.
- **Two slants.** The floating pieces lean 24°, which is the slant on badges, the main action
  button, the sidebar's current-page marker and the progress blocks (`PixelProgress.vue`). The
  faces lean 30°, which is the angle in the Home and Scan icons.
- **Gaps instead of lines.** The cube's edges are gaps between pieces, so panels sit apart on the
  page background with no outline. Outlines are kept for what needs attention (a value to check)
  and for showing which option is selected.
- **Pixels for progress.** Progress bars are rows of slanted blocks, and the mark's pieces drift
  out and back with each echo read during a scan. Both stay still when the system asks for reduced
  motion.
- **One colour.** The mark is drawn in a single colour (white, or the text colour in the app).
  Colour in the app is kept for meaning: cyan for the main action, amber for "please check",
  violet for "checked by you".
