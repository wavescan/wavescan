---
status: accepted
date: 2026-10-05
tags: [privacy, network]
superseded_by: [20]
---

# 10. No telemetry, explicit network allow-list

## Context

"I don't want your data, and you shouldn't have to worry about it" is a core product promise. A desktop app that reads your game screen gets more suspicion than a website, so we need the promise to be *checkable*, not just stated.

## Decision

- **No telemetry, analytics, crash-reporting services or remote logging.** Logs stay local (rotating file in the app data dir), and the user can open them from Help.
- **Allowed outbound hosts** (also enforced via CSP `connect-src` for the webview):
  1. GitHub Releases: updater manifest + signed bundles ([ADR 0011](./0011-signing-provenance-and-updater.md)).
  2. `ryanbenson.github.io`: signed `scanner-data.json` + icon templates.
     **Superseded 2026-10-06:** the game-data host is `www.wutheringtools.com`; see [ADR 0020](./0020-game-data-snapshot-and-source.md).
- Each is **toggleable** in Settings → Network. With both off, the app is fully offline.
- The README and `architecture.md#network` list these hosts and show users how to verify with a firewall.

## Consequences

- Pros: users and reviewers can verify the promise, and there's no privacy policy surface.
- Cons: we get no usage data. Accuracy feedback depends on users filing issues, so we provide an easy, masked bug-report export ([ADR 0013](./0013-user-id-masking.md)).

## Guidance

- **Do** treat any new `fetch`, `reqwest` or HTTP dependency as an ADR-worthy change.
- **Don't** embed analytics, even "anonymous", even opt-in, without superseding this ADR.

## Related

- [architecture.md](../architecture.md) §7 Network
