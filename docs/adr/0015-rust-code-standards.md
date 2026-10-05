---
status: accepted
date: 2026-10-05
tags: [rust, process, testing]
---

# 15. Rust code standards for a non-Rust maintainer

## Context

The maintainer is a TypeScript developer. The Rust layer is small, but it's the security-critical part: capture, input, and the safety gate. Much of it will be written with AI assistance. The code must therefore be reviewable by someone reading Rust as a second language, and machine-checked as much as possible.

## Decision

These are enforced in CI on Windows and macOS runners:

- **Format/lint:**
  - `cargo fmt --check`.
  - `cargo clippy --all-targets -- -D warnings`, with `[lints.clippy] pedantic = "warn"` plus `unwrap_used`, `expect_used`, `panic`, `todo`, `dbg_macro`, `print_stdout` and `undocumented_unsafe_blocks` set to deny.
  - `[lints.rust] missing_docs = "warn"` (made an error by `-D warnings`) and `unsafe_op_in_unsafe_fn = "deny"`.
- **Errors:** `thiserror` enums per module, an IPC-serialisable `{ kind, message }`, and no panics in app code.
- **Unsafe:** only in `platform/`, each block with `// SAFETY:` and wrapped in a safe, tested function.
- **Structure:** trait seams (`WindowFinder`, `FrameSource`, `OcrEngine`, `InputDriver`). OS-independent logic is unit-tested with fakes, and platform modules are kept thin.
- **Docs:** a `///` on every public item, saying what it does, why, and its errors, in plain English. [rust-primer.md](../rust-primer.md) is kept current.
- **Tests:**
  - unit tests per module
  - integration tests against `fixtures/`
  - `cargo nextest` in CI
  - safety-critical paths (arming, clamp, abort, click cap, User ID mask) **must** have tests, and PRs touching them without tests are rejected
- **Supply chain:** `cargo deny check` (licences per [ADR 0014](./0014-gpl-3-license.md), RustSec advisories, duplicate/banned crates), committed `Cargo.lock`, and minimal dependency features.
- **Style:** no custom macros, minimal generics/lifetimes, sync code unless an API forces async.

## Consequences

- Pros:
  - The compiler and CI catch most of what a Rust expert reviewer would.
  - The security-critical code is small, documented and tested.
  - AI-written code is held to explicit rules (CLAUDE.md).
- Cons:
  - Pedantic clippy is noisy, so allows must be justified locally with `reason = "..."`.
  - Slower CI (two OS runners).

## Guidance

- **Do** start any Rust change by reading [rust-primer.md](../rust-primer.md) and the Rust rules in CLAUDE.md.
- **Don't** weaken lint settings globally; allow per item with a reason.

## Related

- [CLAUDE.md](../../CLAUDE.md) · [rust-primer.md](../rust-primer.md)
