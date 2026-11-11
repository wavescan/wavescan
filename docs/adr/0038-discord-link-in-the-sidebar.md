---
status: accepted
date: 2026-11-11
tags: [ui, security, community]
---

# 38. A link to Wavescan's Discord in the sidebar

## Context

Wavescan now has a Discord server, with an invite that doesn't expire: `https://discord.gg/2dP2SnsZXM`. It's an easier place than GitHub to ask questions, share findings and follow testing, and the README already points people without a GitHub account to "the testers on Discord". The app had no way to get there.

The app can only open pages in the opener scope ([ADR 0028](0028-browser-links-mini-window-and-saved-scan.md)), so a link needs that exact URL added. Options:

- **Only mention the server in the README.** No app change, but most people never read it.
- **A link in Help & feedback.** Findable, but only by people already looking for help.
- **A link at the bottom of the sidebar**, above the version. Always visible, out of the way of the screens.

## Decision

- **Add "Discord" at the bottom left of the sidebar** (`src/components/AppNav.vue`), with Discord's logo (`DiscordIcon.vue`, path from Simple Icons, CC0 1.0). It opens the invite in the user's browser. If the browser can't be opened, the sidebar shows the address to type in.
- **Add the one exact invite URL to the opener scope.** Not `https://discord.gg/*` or `discord.com`: any other invite or Discord page stays blocked.
- The URL lives in `src/feedback/links.ts` (`DISCORD_URL`), and the drift test (`tests/feedback.spec.ts`) keeps it in step with the capability.

Opening a page is still the browser's connection, not Wavescan's ([ADR 0028](0028-browser-links-mini-window-and-saved-scan.md)): no new host for the app, and the CSP is unchanged. The logo is drawn inline, so nothing is loaded from Discord.

## Consequences

- Everyone using the app can find the community in one click.
- The opener scope grows by one exact URL.
- If the invite is ever revoked or replaced, the link opens a dead invite until an app update. Changing it is one constant and one scope line, with a note here.

## Guidance

- **Do** keep the scope entry the exact invite URL, never a whole host.
- **Do** use a permanent invite (no expiry, no use limit), since the URL ships in every copy of the app.
- **Don't** add Discord login, widgets, embeds or anything that loads from Discord inside the app. That would be a new outbound host ([ADR 0010](0010-no-telemetry-network-allowlist.md)).

## Related

- `src/feedback/links.ts` (`DISCORD_URL`), `src/components/AppNav.vue`, `src/components/DiscordIcon.vue`, `src-tauri/capabilities/default.json`, `tests/feedback.spec.ts`
- [ADR 0028](0028-browser-links-mini-window-and-saved-scan.md) (opener scope), [ADR 0037](0037-other-sites-can-import-the-scan.md) (the last scope addition)
