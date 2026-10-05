//! Compiles the real source files via `#[path]`; see Cargo.toml for why this exists.
#![allow(dead_code, unused_imports, missing_docs, reason = "probe crate: only type-checks the included files")]

#[path = "../../../src-tauri/src/error.rs"]
pub mod error;
#[path = "../../../src-tauri/src/frame.rs"]
pub mod frame;
#[path = "../../../src-tauri/src/geometry.rs"]
pub mod geometry;
#[path = "../../../src-tauri/src/safety.rs"]
pub mod safety;
#[path = "../../../src-tauri/src/stats.rs"]
pub mod stats;
#[path = "../../../src-tauri/src/traits.rs"]
pub mod traits;

pub mod platform;
