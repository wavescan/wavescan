//! Wavescan: reads Wuthering Waves echoes from the game window and exports them as a
//! `WutheringToolsScan` JSON file for Wuthering Tools.
//!
//! Start with `docs/architecture.md` and `docs/rust-primer.md`. In short: this crate is a
//! thin layer of OS adapters (window, capture, OCR, input) behind traits; the logic that
//! understands the game lives in TypeScript.

pub mod commands;
pub mod error;

pub use error::Error;

/// Builds and runs the Tauri application. Blocks until the app exits.
///
/// # Errors
///
/// Returns [`Error::Startup`] if Tauri fails to create the window or webview
/// (for example, `WebView2` missing on Windows).
pub fn run() -> Result<(), Error> {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::app_info])
        .run(tauri::generate_context!())
        .map_err(|source| Error::Startup(source.to_string()))
}
