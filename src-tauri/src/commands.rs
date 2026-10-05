//! IPC commands the UI can call. Keep these thin: validate input, call into a module,
//! map errors. Each command must also be listed in `build.rs` and granted in
//! `capabilities/default.json`, or the UI can't call it.

use serde::Serialize;

/// Basic facts about the running app. Mirrored in `src/ipc/types.ts` as `AppInfo`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppInfo {
    /// Product name.
    pub name: &'static str,
    /// App version from `Cargo.toml`.
    pub version: &'static str,
    /// Operating system this build targets: `windows`, `macos` or `linux`.
    pub platform: &'static str,
}

/// Returns the app's name, version and platform. Used by the home and diagnostics screens.
#[tauri::command]
#[must_use]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: "Wavescan",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_cargo_version_and_os() {
        let info = app_info();
        assert_eq!(info.name, "Wavescan");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(info.platform, std::env::consts::OS);
    }

    #[test]
    fn app_info_serializes_with_ts_field_names() {
        let json = serde_json::to_value(app_info()).unwrap();
        assert!(json.get("name").is_some());
        assert!(json.get("version").is_some());
        assert!(json.get("platform").is_some());
    }
}
