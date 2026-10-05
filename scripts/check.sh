#!/usr/bin/env bash
# Runs the same checks as CI. Used by `docker compose run --rm check`.
# Windows/macOS-only code (cfg(target_os = ...)) is checked by CI on real runners.
set -euo pipefail

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }

step "npm install"
if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

step "lint (eslint + vue-tsc)"
npm run lint

step "unit tests (vitest)"
npm test

step "frontend build"
npx vite build

cd src-tauri

step "cargo fmt"
cargo fmt --check

step "cargo clippy"
cargo clippy --all-targets --locked -- -D warnings

step "cargo nextest"
cargo nextest run --locked

step "cargo deny"
cargo deny check

printf '\n\033[1;32mAll checks passed.\033[0m\n'
