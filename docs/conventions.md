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

- **Phase 0 (bootstrap): milestone PRs, no size limit.** While the app shell, build and CI are being stood up, nearly every change touches everything, so we use a few larger PRs that each leave `main` working:
  1. `build: scaffold tauri app, docker checks, and ci` (Tauri 2 + Vue 3 + TS shell, Tailwind/DaisyUI, lint configs, Cargo `[lints]`, `deny.toml`, `docker compose run check`, the Windows + macOS CI workflow)
  2. `feat: add platform trait seams, fakes, and safety module`
  3. `feat: add windows capture and ocr adapters with diagnostics screen`
  4. `feat: add macos adapters and input spike`
- **Exception, even in Phase 0:** safety and input code (`safety.rs`, `platform/*/input.rs`, `capabilities/`) stays in a clearly separated commit or PR with its own tests and a description of why it is safe. That is the code that protects users' accounts.
- **From Phase 1 on: one concern per PR.** Aim for a reviewable diff (roughly under 400 changed lines, excluding lockfiles and fixtures), e.g. one adapter, extractor or screen per PR.
- Each PR includes its tests and its docs: an ADR, an `architecture.md` change, or a README change when relevant (CLAUDE.md "Docs").
- **Security-sensitive PRs** say so in the description and explain why. These are changes to `src-tauri/capabilities/`, `safety.rs`, `platform/*/input.rs`, network code, or dependencies.
