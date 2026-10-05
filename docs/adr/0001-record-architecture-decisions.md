---
status: accepted
date: 2026-10-05
tags: [process, documentation]
---

# 1. Record architecture decisions as ADRs

## Context

The scanner has many non-obvious choices that matter for user trust: what it may capture, whether it may click, where data goes. Most of its code is Rust, which the maintainer doesn't write day to day. Humans and coding agents need one place that explains *why* things are the way they are, so later changes don't quietly erode those guarantees.

## Decision

We record significant decisions as Markdown ADRs in `docs/adr/`. They use the same format as the optimizer repo: YAML frontmatter plus Context / Decision / Consequences / Guidance / Related. Accepted ADRs are immutable in substance; a change of mind becomes a new ADR that supersedes the old one.

## Consequences

- Pros: the safety guarantees are written down and can be cited in reviews, and agents can be pointed at them before proposing changes.
- Cons: docs drift if code changes without an ADR update. CLAUDE.md makes ADR + architecture.md updates part of "done" to counter this.

## Guidance

- **Do** write an ADR for any new permission, outbound host, OS/network-touching dependency, schema change or auto-mode capability.
- **Don't** rewrite accepted ADRs; supersede them.

## Related

- [README](./README.md), [architecture.md](../architecture.md), [CLAUDE.md](../../CLAUDE.md)
