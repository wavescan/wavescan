---
status: accepted
date: 2026-10-31
tags: [ui, security, interop]
---

# 37. Other sites can import the scan: Tacet Lab next to Wuthering Tools

## Context

Wavescan was built to feed Wuthering Tools: the Review screen's one export button copies the scan and opens WT's Settings page, where its Wavescan import lives ([ADR 0028](0028-browser-links-mini-window-and-saved-scan.md)). The scan itself is a plain, documented JSON file ([ADR 0008](0008-scan-json-schema-v1.md)), so nothing ties it to WT.

The developer of **Tacet Lab** (`https://dj12421.github.io/Tacet-Lab/`), another community build planner for Wuthering Waves, is building an import for Wavescan scans and asked for a way in. Players use more than one planner, and a scanner that only works with one of them is less useful and looks like a funnel. `?import=1` opens Tacet Lab's import screen directly.

Options:

- **"Copy scan only" and let people find the page.** Works today, but every other site starts at a disadvantage against WT's one-click button.
- **A second button for Tacet Lab** under WT's. One more URL in the opener scope.
- **A free-form "open this site" field.** Any URL, which means dropping the opener scope. Rejected: the scope is what stops a compromised page from opening arbitrary links.

## Decision

- **Add "Copy and open Tacet Lab"** under "Copy and open Wuthering Tools" on the Review screen. WT stays the main action; Tacet Lab's button is outlined. Both copy the same scan, unchanged.
- **Add one exact URL to the opener scope:** `https://dj12421.github.io/Tacet-Lab/?import=1`. The scope is a glob, so the `?` is written `[?]` (a bare `?` matches any one character). Not the rest of `dj12421.github.io`, and not the rest of Tacet Lab.
- **Sites live in one list,** `IMPORT_SITES` in `src/feedback/links.ts` (name, URL, where to paste). The buttons and the "opened in your browser" line come from it, so another site is one entry plus the scope line, with an ADR note.
- **Wording says "Wuthering Tools or Tacet Lab"** where the app and README used to say only WT. Claims about what happens after the paste (stored only in the browser, asks about unchecked values) stay attached to WT, the site we can vouch for.

Opening a page is still the browser's connection, not Wavescan's ([ADR 0028](0028-browser-links-mini-window-and-saved-scan.md)): no new host for the app, and the CSP is unchanged.

## Consequences

- People can use Wavescan with either planner in one click.
- **The scan format now has two readers.** A change to `schema/scan.v1.json` must be passed on to Tacet Lab's developer as well as WT's import mapper (CLAUDE.md "When changing X").
- Wavescan links to a site it doesn't control. If Tacet Lab moves or stops importing, the button opens a dead page until a Wavescan update. Removing it is one entry and one scope line.
- The opener scope grows by one exact URL. The drift test (`tests/feedback.spec.ts`) keeps `links.ts` and the capability in step.

## Guidance

- **Do** add a new import site only when its developer asks and its import reads scan v1, with a note here or a new ADR.
- **Do** keep each scope entry an exact import URL, never a whole host (`github.io` hosts many unrelated sites).
- **Don't** describe another site's storage or privacy in Wavescan's UI. Point to the site instead.

## Related

- `src/feedback/links.ts` (`IMPORT_SITES`, `TACET_LAB_IMPORT_URL`), `src/views/ReviewView.vue`, `src-tauri/capabilities/default.json`, `tests/feedback.spec.ts`
- [ADR 0008](0008-scan-json-schema-v1.md) (the scan format), [ADR 0028](0028-browser-links-mini-window-and-saved-scan.md) (opener scope)
