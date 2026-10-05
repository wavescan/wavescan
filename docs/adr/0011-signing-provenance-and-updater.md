---
status: accepted
date: 2026-10-05
tags: [distribution, supply-chain]
---

# 11. Signed builds, provenance attestations, signed updater

## Context

Unsigned apps trigger Windows SmartScreen ("Windows protected your PC") and macOS Gatekeeper blocks. That scares users and trains them to click through warnings. Users also need a way to verify that the binary matches the public source.

## Decision

- **Build only in GitHub Actions** from tagged commits (`release.yml`). No locally built releases.
- **Windows:** Authenticode via **Azure Trusted Signing**. It's a low-cost cloud HSM, and the signing key never leaves Azure.
- **macOS:** **Developer ID Application** certificate, hardened runtime, notarization + stapling. Signing secrets are GitHub encrypted secrets, scoped to the release environment with required reviewers.
- **Provenance:** `actions/attest-build-provenance` for every artifact, plus SHA-256 checksums in the release notes. The README explains `gh attestation verify`.
- **Updates:** Tauri updater plugin with a minisign key pair. The public key is compiled into the app and the private key is a GitHub secret. Update checks can be turned off ([ADR 0010](./0010-no-telemetry-network-allowlist.md)).

## Consequences

- Pros: no scary OS warnings for real releases, verifiable builds, and tamper-evident updates.
- Cons:
  - Running costs: Apple Developer Program at $99/yr and Azure Trusted Signing at about $10/mo.
  - Losing the updater key strands existing installs, so it's backed up offline.

## Guidance

- **Do** keep the release environment protected (manual approval).
- **Don't** commit any key material (`.gitignore` blocks `*.key`, `*.p12`, `*.pfx`).

## Related

- [architecture.md](../architecture.md) §10, README "Verify your download"
