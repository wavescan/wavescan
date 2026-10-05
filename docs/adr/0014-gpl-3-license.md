---
status: accepted
date: 2026-10-05
tags: [legal]
---

# 14. License under GPL-3.0-or-later

## Context

The initial plan said MIT. However, the scanning logic this app reuses ([ADR 0007](./0007-shared-scanner-core-package.md)) comes from the optimizer repo, which is **GPL-3.0-or-later** and has outside contributors. Combining it into an MIT app would need relicensing consent from every contributor. Open source matters here for trust, not for permissive reuse.

## Decision

License this repository under **GPL-3.0-or-later**, the same as the optimizer. `scanner-core` is published under the same licence.

## Consequences

- Pros:
  - No licence conflict.
  - Forks must stay open source, which suits a trust-sensitive tool.
  - Matches prior art (Tacet-Lab and WuWa_Inventory_Kamera are GPL-3).
- Cons:
  - Third parties can't embed the scanner in closed-source products.
  - `cargo deny` must allow GPL-compatible licences only.

## Guidance

- **Do** keep `deny.toml`'s licence allow-list GPL-3-compatible (MIT, Apache-2.0, BSD, ISC, Zlib, MPL-2.0, Unicode, ...).

## Related

- [LICENSE](../../LICENSE)
