//! Build script: generates Tauri's context and the permission set for our own commands.

fn main() {
    // Listing our commands here makes Tauri generate an `allow-<command>` permission for
    // each one, so a command is only callable if `capabilities/default.json` grants it.
    // Add new commands to this list *and* to the capability file.
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "app_info",
            "find_game_window",
            "window_candidates",
            "start_capture",
            "stop_capture",
            "capture_status",
            "capture_preview",
            "ocr_region",
            "auto_mode_status",
            "arm_auto_mode",
            "disarm_auto_mode",
            "auto_focus_game",
            "auto_click",
            "sample_regions",
            "read_regions",
        ]));
    if let Err(error) = tauri_build::try_build(attributes) {
        eprintln!("tauri build step failed: {error:#}");
        std::process::exit(1);
    }
}
