//! The F8 stop key for auto mode ([ADR 0024](../../docs/adr/0024-f8-stop-key-and-auto-scroll.md)).
//!
//! Pressing F8 anywhere (the game is in front during a scan) stops auto mode, the same way
//! moving the mouse does. The key is claimed from the OS only while auto mode is armed, and
//! given back as soon as it isn't, so Wavescan never takes F8 away from other apps (or the
//! game) the rest of the time.
//!
//! The OS side is Tauri's global-shortcut plugin: `RegisterHotKey` on Windows and Carbon's
//! `RegisterEventHotKey` on macOS. Neither installs a keyboard hook or sees any other key,
//! and neither needs a macOS permission. The webview is granted no global-shortcut
//! permission: only this module can register keys.
//!
//! Registering and unregistering wait for the main thread, so [`sync`] must not run on it.
//! Async commands (worker threads) call it directly; everything else uses [`sync_later`].

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{
    Builder, Code, GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState,
};

use crate::commands::AppState;

/// The key that stops auto mode. Shown in the UI and the README as "F8".
pub const STOP_KEY: Code = Code::F8;

/// F8 with no modifiers.
#[must_use]
pub fn stop_shortcut() -> Shortcut {
    Shortcut::new(None, STOP_KEY)
}

/// Whether a global-shortcut event is the stop key going down (not up, and not some other key).
#[must_use]
pub fn is_stop_press(shortcut: &Shortcut, event: &ShortcutEvent) -> bool {
    *shortcut == stop_shortcut() && event.state == ShortcutState::Pressed
}

/// The global-shortcut plugin, with a handler that stops auto mode when F8 is pressed.
/// Registers no key by itself: [`sync`] does that when auto mode is armed.
#[must_use]
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    Builder::new()
        .with_handler(|app, shortcut, event| {
            if is_stop_press(shortcut, &event) {
                app.state::<AppState>().stop_from_hotkey();
                // The handler runs on the main thread, so give the key back from another one.
                sync_later(app.clone());
            }
        })
        .build()
}

/// Claims F8 if auto mode is armed and gives it back if it isn't, and records whether it's
/// held (`AutoModeStatus::stop_key_active`). If another app already holds F8, auto mode
/// still works; the UI says that only moving the mouse stops it. Blocking: never call on
/// the main thread (see the module docs).
pub fn sync(app: &AppHandle) {
    let state = app.state::<AppState>();
    let shortcuts = app.global_shortcut();
    let held = shortcuts.is_registered(stop_shortcut());
    if state.is_armed() {
        if !held {
            let claimed = shortcuts.register(stop_shortcut()).is_ok();
            state.set_stop_key_active(claimed);
        }
    } else {
        if held {
            // If this fails the key stays claimed until Wavescan exits; nothing else to do.
            let _ = shortcuts.unregister(stop_shortcut());
        }
        state.set_stop_key_active(false);
    }
}

/// [`sync`] on a background thread, for callers on the main thread.
pub fn sync_later(app: AppHandle) {
    tauri::async_runtime::spawn_blocking(move || sync(&app));
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_global_shortcut::Modifiers;

    fn event(shortcut: &Shortcut, state: ShortcutState) -> ShortcutEvent {
        ShortcutEvent {
            id: shortcut.id(),
            state,
        }
    }

    #[test]
    fn only_pressing_f8_without_modifiers_is_the_stop_key() {
        let f8 = stop_shortcut();
        assert!(is_stop_press(&f8, &event(&f8, ShortcutState::Pressed)));
        assert!(!is_stop_press(&f8, &event(&f8, ShortcutState::Released)));

        let other = Shortcut::new(None, Code::F9);
        assert!(!is_stop_press(
            &other,
            &event(&other, ShortcutState::Pressed)
        ));
        let shifted = Shortcut::new(Some(Modifiers::SHIFT), Code::F8);
        assert!(!is_stop_press(
            &shifted,
            &event(&shifted, ShortcutState::Pressed)
        ));
    }
}
