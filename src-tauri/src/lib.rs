//! Wavescan: reads Wuthering Waves echoes from the game window and exports them as a
//! `WutheringToolsScan` JSON file for Wuthering Tools.
//!
//! Start with `docs/architecture.md` and `docs/rust-primer.md`. In short: this crate is a
//! thin layer of OS adapters (window, capture, OCR, input) behind traits; the logic that
//! understands the game lives in TypeScript.
//!
//! | Module | Role |
//! |---|---|
//! | [`traits`] | The four OS seams: window, capture, OCR, input |
//! | [`safety`] | Gatekeeper for input (auto mode) and User ID privacy |
//! | [`frame`] | In-memory captured images: crop, fill |
//! | [`regions`] | Batched region sampling (change detection) and OCR for the scanner |
//! | [`geometry`] | Pixel and fractional rectangles/points |
//! | [`hotkey`] | The F8 stop key for auto mode (held only while armed) |
//! | [`platform`] | Windows/macOS implementations of the traits |
//! | [`stats`] | Frame-rate measurement |
//! | [`commands`] | IPC commands the UI calls, and the shared app state |
//! | [`error`] | The error type sent to the UI |

pub mod commands;
pub mod error;
pub mod frame;
pub mod geometry;
pub mod hotkey;
pub mod platform;
pub mod regions;
pub mod safety;
pub mod stats;
pub mod traits;

#[cfg(test)]
pub(crate) mod testing;

pub use error::Error;

/// Builds and runs the Tauri application. Blocks until the app exits.
///
/// # Errors
///
/// Returns [`Error::Startup`] if Tauri fails to create the window or webview
/// (for example, `WebView2` missing on Windows).
pub fn run() -> Result<(), Error> {
    tauri::Builder::default()
        .manage(commands::AppState::new(platform::create()))
        .plugin(hotkey::plugin())
        // Opens GitHub pages (report a problem, source, releases) in the user's browser. The
        // webview may only open the URLs allowed in capabilities/default.json (ADR 0028).
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::find_game_window,
            commands::window_candidates,
            commands::start_capture,
            commands::stop_capture,
            commands::capture_status,
            commands::capture_preview,
            commands::ocr_region,
            commands::auto_mode_status,
            commands::arm_auto_mode,
            commands::disarm_auto_mode,
            commands::auto_focus_game,
            commands::auto_click,
            commands::auto_scroll,
            commands::sample_regions,
            commands::read_regions,
            commands::crop_regions,
        ])
        .run(tauri::generate_context!())
        .map_err(|source| Error::Startup(source.to_string()))
}
