//! All macOS adapter files, compiled from Linux without Apple's SDK (pure-Rust objc2
//! bindings). Mirrors `src-tauri/src/platform/macos/mod.rs`.

#[path = "../../../../src-tauri/src/platform/helpers.rs"]
mod helpers;
pub(crate) use helpers::*;

#[path = "../../../../src-tauri/src/platform/macos/mod.rs"]
pub mod macos;

/// Mirror of `src-tauri/src/platform/mod.rs`'s `Platform` (needed by `macos::create`).
pub struct Platform {
    pub finder: Box<dyn crate::traits::WindowFinder + Send + Sync>,
    pub capture: Box<dyn crate::traits::FrameSource + Send>,
    pub ocr: Box<dyn crate::traits::OcrEngine + Send + Sync>,
    pub input: Box<dyn crate::traits::InputDriver + Send + Sync>,
}
