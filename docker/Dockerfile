# Linux image for local checks (lint, type-check, OS-independent tests).
# The real app only runs on Windows/macOS; see docs/development.md.
FROM rust:1-bookworm

# Tauri's Linux build prerequisites (needed for `cargo clippy`/`cargo test` to compile the tauri crate).
# `llvm` provides llvm-rc, needed to type-check the Windows target from Linux.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
      build-essential file \
      llvm \
    && rm -rf /var/lib/apt/lists/*

# Node 24 (matches .nvmrc)
COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:24-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Rust toolchain components + test/supply-chain tools (prebuilt binaries, no compile)
RUN rustup component add rustfmt clippy \
 && rustup target add x86_64-pc-windows-msvc aarch64-apple-darwin \
 && curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash \
 && cargo binstall -y --locked cargo-nextest cargo-deny

WORKDIR /app
