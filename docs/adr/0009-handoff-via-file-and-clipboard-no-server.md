---
status: accepted
date: 2026-10-05
tags: [interop, privacy]
---

# 9. Hand off via file or clipboard, never a server

## Context

The web app keeps all user data in localStorage and has no backend. Users want a one-click "send to Wuthering Tools". Options considered:

- **URL payload** (`/import#data=...`): breaks for big inventories (3,000 echoes is hundreds of KB, and Windows limits a launched URL to about 32K characters). URLs also show up in history, and analytics may log them.
- **Localhost bridge** (the app runs an HTTP server and the site fetches from it): smooth, but opening a local port looks alarming to users, needs CORS and auth care, and adds attack surface.
- **Upload to a server:** violates "we don't want your data".
- **File + clipboard:** simple, transparent, works offline, and the user is in control.

## Decision

- **Save file:** a native save dialog writes `wuthering-scan-YYYY-MM-DD.json`.
- **Open in Wuthering Tools:** writes the JSON to the clipboard (Tauri clipboard-manager, write-only), then opens `https://<site>/import/scan` in the default browser. That page has **Paste from scanner** (`navigator.clipboard.readText()` on click) and drag-and-drop.
- The import page validates ([ADR 0008](./0008-scan-json-schema-v1.md)), shows a review/diff (reusing `useEchoDuplicateReview`), and saves only on confirmation.

## Consequences

- Pros: no server, no port, no URL leakage, and users can open the file and read it.
- Cons:
  - It takes one extra click (Paste).
  - The clipboard briefly holds the scan. We offer to clear it after a successful import, and the scan contains no account identifiers anyway.

## Guidance

- **Don't** add a localhost server or upload endpoint without superseding this ADR.
- **Do** keep the web import page working with drag-and-drop for users who prefer files.

## Related

- Optimizer: `src/composables/useEchoDuplicateReview.ts`, `src/utils/settingsBackup.ts`
