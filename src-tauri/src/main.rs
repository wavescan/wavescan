//! Wavescan desktop entry point. All logic lives in the library crate (`lib.rs`).

// Hide the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(error) = wavescan_lib::run() {
        eprintln!("Wavescan failed to start: {error}");
        std::process::exit(1);
    }
}
