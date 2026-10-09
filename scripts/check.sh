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

step "fixture replay through Tesseract"
npm run test:fixtures:tesseract

step "frontend build"
npx vite build

cd src-tauri

step "cargo fmt"
cargo fmt --check

step "cargo clippy"
cargo clippy --all-targets --locked -- -D warnings

step "cargo clippy (Windows target, type-check only)"
# Catches Windows compile errors and lints locally; Windows tests still run on CI.
cargo clippy --target x86_64-pc-windows-msvc --all-targets --locked -- -D warnings

step "cargo clippy (macOS adapters via scripts/macos-probe, type-check only)"
# Covers all of platform/macos (pure-Rust objc2 bindings); tests run on CI's macOS runner.
(cd ../scripts/macos-probe && CARGO_TARGET_DIR=../../src-tauri/target/macos-probe \
  cargo clippy --target aarch64-apple-darwin -- -D warnings)

step "cargo nextest"
cargo nextest run --locked

step "cargo deny"
cargo deny check

printf '\n\033[1;32mAll checks passed.\033[0m\n'
