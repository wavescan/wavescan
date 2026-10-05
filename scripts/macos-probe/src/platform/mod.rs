//! The macOS adapters that can be type-checked without Apple's SDK.

#[path = "../../../../src-tauri/src/platform/helpers.rs"]
mod helpers;
pub(crate) use helpers::*;

#[path = "../../../../src-tauri/src/platform/macos/app.rs"]
pub mod app;
#[path = "../../../../src-tauri/src/platform/macos/input.rs"]
pub mod input;
#[path = "../../../../src-tauri/src/platform/macos/ocr.rs"]
pub mod ocr;
