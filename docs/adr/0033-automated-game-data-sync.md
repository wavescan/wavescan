---
status: accepted
date: 2026-10-15
tags: [data, ci, network]
---

# 33. Sync the game-data snapshot with a scheduled PR, not at build time

## Context

Builds bundle the committed snapshot `src/data/scanner-data.json` ([ADR 0020](./0020-game-data-snapshot-and-source.md)). Refreshing it was a manual step (`npm run data:update`), and it was easy to forget. Set fixes made in Wuthering Tools on two echoes (Questless Knight, Vitreum Dancer) didn't reach tester builds because the snapshot was five days old.

We considered three options:

- **Fetch the data during every build.** Rejected for these reasons:
  - The build would no longer match the commit it came from. The data hash on the home screen and in Diagnostics reports would name data that isn't in git.
  - Data changes would ship without anyone reviewing them.
  - Builds would fail when the network or the site is down.
  - Accuracy is priority 2: one wrong set in the data misreads every echo of that type, silently.
- **Auto-merge the update.** Rejected for the same reason: no one looks at the data before it ships.
- **Open a PR automatically, and flag builds made with stale data.** This is the option we chose.

## Decision

- **`game-data-sync.yml`** runs daily, by hand, or when another repo sends it a `scanner-data-published` repository dispatch:
  1. It fetches `scanner-data.json` (format, version and hash checks as before).
  2. If the data changed, it refreshes the set and echo icons too.
  3. It force-pushes `chore/sync-game-data` and opens a PR, or updates the open one. The PR body lists the changed entries in each section, so the change can be reviewed by eye.
  4. It doesn't push again when the branch already holds the same data.
- Pushes made with the workflow token don't trigger other workflows, so the sync workflow starts `ci.yml` itself through `workflow_dispatch`. CI accepts that trigger for this reason.
- **`npm run data:check`** compares the bundled snapshot with the published one without writing anything. It exits with 0 when they match, 2 when the snapshot is stale, and 1 when the check itself failed.
- **Tester builds** run that check. Stale data adds a warning to the run and a line to the pre-release notes. It doesn't fail the build: a sync PR is already on its way, and blocking testing on it doesn't help anyone.
- CI now fetches from `www.wutheringtools.com` (and the icon hosts, when the data changed), alongside the developer's machine. The app itself still makes no game-data requests.

## Consequences

- Pros:
  - No one has to remember to refresh the data. A data fix in Wuthering Tools turns into a PR within a day, or right away once WT sends the dispatch.
  - Every data change is still reviewed and committed, so every build names data that's in git.
  - A build made with stale data says so.
- Cons:
  - Someone still has to merge the PR.
  - The repo setting "Allow GitHub Actions to create and approve pull requests" has to be on.
  - The workflow token can push branches and open PRs. Branch protection on `main` still requires review and green CI.

## Guidance

- **Do** review the sync PR's change list against what you changed in Wuthering Tools before merging.
- **Don't** push your own commits to `chore/sync-game-data`. The workflow force-pushes it.
- **Do** make the official `release.yml`, when it's built, fail on `data:check` exit code 2. A signed release shouldn't ship stale data.
- For an instant sync, WT's deploy can send `repository_dispatch` (`event_type: scanner-data-published`) with a token scoped to this repo.

## Related

- `.github/workflows/game-data-sync.yml`, `.github/workflows/tester-build.yml`, `.github/workflows/ci.yml`, `scripts/update-scanner-data.mjs`, [ADR 0020](./0020-game-data-snapshot-and-source.md)
