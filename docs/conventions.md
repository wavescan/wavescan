# Branch, commit, and PR conventions

Same conventions as the optimizer repo (`../wuthering-waves-optimizer/docs/conventions.md`), adapted for a public repo that ships signed binaries.

## Flow

- **`main` is always releasable.** All work lands through a **pull request** from a short-lived branch, and is **squash-merged**.
- The only direct commit to `main` was the initial docs bootstrap (an empty repo has no base branch to open a PR against).
- **CI must be green** (both the Windows and macOS jobs) before merging.
- Releases are tags (`v0.1.0`) on `main`. The release workflow builds, signs and publishes from the tag ([ADR 0011](adr/0011-signing-provenance-and-updater.md)).

### Recommended branch protection for `main` (GitHub → Settings → Rules)

- Require a pull request before merging, and require status checks (the CI jobs) to pass
- Require linear history (squash only), and block force pushes and deletions
- The release environment requires a manual approval, because it holds the signing secrets

## Commit / PR title format

```
<type>: <description>[ (#issue)]
```

- `type`: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `ci`, `build`
- `description`: lowercase, imperative, no trailing period
- Examples: `feat: add windows window capture adapter`, `ci: run clippy and nextest on windows and macos`, `fix: mask user id on 16:9 frames (#42)`

PRs are squash-merged, so the PR title becomes the commit title.

## Branch naming

```
<type>/[issue-]<kebab-slug>
```

e.g. `feat/tauri-skeleton`, `feat/12-echo-grid-navigator`, `fix/user-id-mask-16x9`.

## PR size and contents

- **One concern per PR.** Aim for a reviewable diff (roughly under 400 changed lines, excluding lockfiles and fixtures).
- Each PR includes its tests and its docs: an ADR, an `architecture.md` change, or a README change when relevant (CLAUDE.md "Docs").
- **Security-sensitive PRs** say so in the description and explain why. These are changes to `src-tauri/capabilities/`, `safety.rs`, `platform/*/input.rs`, network code, or dependencies.

## Phase → PR plan (Phase 0)

Phase 0 ([roadmap](roadmap.md)) is split into these PRs, in order:

1. `build: scaffold tauri 2 + vue 3 + typescript app` (app shell, Tailwind/DaisyUI, lint configs, Cargo `[lints]`, `deny.toml`)
2. `build: add docker compose for local checks` (Linux container running TS + OS-independent Rust checks)
3. `ci: run lint and tests on windows and macos`
4. `feat: add platform trait seams and test fakes`
5. `feat: add safety module (arming, clamp, abort, user id mask)`
6. `feat: add windows window finder and capture adapter`, then `feat: add windows native ocr adapter`
7. `feat: add macos window finder and capture adapter`, then `feat: add macos native ocr adapter`
8. `feat: add diagnostics screen and masked report export` (for the Discord Mac testers)
9. `feat: add input adapters behind safety gate` (spike: does a click reach the game?)

Later phases follow the same pattern: one adapter, extractor or screen per PR.
