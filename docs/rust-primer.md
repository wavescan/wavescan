# Rust primer for this codebase

A short guide to reading (and reviewing) the Rust in `src-tauri/`, written for a TypeScript developer. You don't need to learn Rust to own this project. You need to be able to **read a function, follow an error, and tell whether a change is safe.**

## Where to look

```
src-tauri/
  Cargo.toml          ← like package.json (dependencies + lint config)
  Cargo.lock          ← like package-lock.json (committed)
  deny.toml           ← supply-chain policy (allowed licences, banned crates)
  capabilities/       ← what the UI is allowed to call (Tauri permission allow-list)
  src/
    main.rs           ← entry point; registers IPC commands
    commands.rs       ← the IPC functions the UI calls (think: API routes)
    traits.rs         ← interfaces: WindowFinder, FrameSource, OcrEngine, InputDriver
    safety.rs         ← gatekeeper for input + User ID masking
    error.rs          ← the error types
    platform/
      windows/        ← Windows-only implementations of the traits
      macos/          ← macOS-only implementations
  tests/              ← integration tests that run against fixtures/
```

**Reviewing a PR?** Check these in order:

1. Did anything change under `capabilities/`, `safety.rs` or `platform/*/input.rs`? Those are the security-sensitive files.
2. Is there new `unsafe`? It's only allowed in `platform/`, and needs a `// SAFETY:` comment.
3. Are there new dependencies in `Cargo.toml`?
4. Are there tests?

## TypeScript → Rust cheat sheet

| TypeScript | Rust | Notes |
|---|---|---|
| `interface Foo { a: number }` | `struct Foo { a: u32 }` | |
| `type Kind = "a" \| "b"` | `enum Kind { A, B }` | Rust enums can also carry data: `enum E { NotFound, Io(String) }` |
| `interface Shape { area(): number }` | `trait Shape { fn area(&self) -> f64; }` | Our four OS seams are traits |
| `class X implements Shape` | `impl Shape for X { ... }` | |
| `T \| null` | `Option<T>` (`Some(x)` / `None`) | No null in Rust |
| `throw` / `try/catch` | `Result<T, E>` (`Ok(x)` / `Err(e)`) | Errors are return values |
| `await f()` inside try | `f()?` | `?` means "if this is an error, return it now" |
| `const x = 1` | `let x = 1;` | Immutable by default |
| `let x = 1` | `let mut x = 1;` | `mut` = can change |
| `export` | `pub` | |
| `import { a } from './b'` | `use crate::b::a;` | |
| JSDoc `/** ... */` | `/// ...` | We require these on every `pub` item |
| `if (process.platform === 'win32')` | `#[cfg(target_os = "windows")]` | Decided at compile time; the other OS's code isn't even built |
| `JSON.stringify` / zod | `serde` (`#[derive(Serialize, Deserialize)]`) | How data crosses IPC |

## The three ideas that look strange at first

**1. Ownership & borrowing (`&`, `&mut`).** Every value has one owner. `&thing` lends read-only access, and `&mut thing` lends write access (only one writer at a time). The compiler enforces this, which is why Rust has no data races. For reviewing purposes you can mostly read `&` as "passes a reference".

**2. Errors are values.** A function that can fail returns `Result<Value, Error>`. `?` passes the error up to the caller. Our rule is **no `unwrap()`/`expect()` in app code**: those crash the app on error, like an uncaught exception. If you see one outside a test, that's a review comment.

```rust
/// Finds the Wuthering Waves window.
///
/// Returns `Error::WindowNotFound` if the game isn't running or is minimised.
pub fn find_game(finder: &dyn WindowFinder) -> Result<GameWindow, Error> {
    let window = finder.find("Client-Win64-Shipping.exe")?; // error? return it
    Ok(window)
}
```

**3. `unsafe`.** It means "the compiler can't check this, a human promises it's fine". We only need it to call Windows/macOS C APIs, and only inside `platform/`. Each block carries a `// SAFETY:` comment that explains the promise. Treat new `unsafe` like a change to auth code: read it carefully.

## How testing works

- Unit tests sit at the bottom of the same file, in `#[cfg(test)] mod tests { ... }`, like a co-located `*.spec.ts`.
- Integration tests in `src-tauri/tests/` use *fake* trait implementations that replay screenshots from `fixtures/`, so most tests run without the game.
- Run them with `cargo nextest run` (or `cargo test`). A green CI on both Windows and macOS is the bar.

## Tools that keep the code honest

| Tool | What it does | TS equivalent |
|---|---|---|
| `cargo fmt` | Auto-format | Prettier |
| `cargo clippy` | Linter (we run it in strict "pedantic" mode, warnings = errors) | ESLint |
| `cargo nextest` | Test runner | Vitest |
| `cargo deny` | Licence/advisory/banned-crate check | `npm audit` + licence checker |
| `rust-analyzer` (VS Code extension) | Hover types, go-to-definition, inline errors | TS language server |

## Asking an AI to change Rust here

Point it at [CLAUDE.md](../CLAUDE.md). Its Rust rules are written so that generated code stays reviewable: doc comments in plain English, typed errors, no panics, `unsafe` quarantined, tests required.
