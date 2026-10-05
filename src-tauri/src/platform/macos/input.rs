//! Synthetic mouse and keyboard input with Core Graphics events (ADR 0006).
//!
//! SECURITY-SENSITIVE. Only `safety::AutoMode` may drive this (see `traits::InputDriver`).
//! macOS silently ignores posted events unless the user has allowed Wavescan under
//! **Accessibility**, so every action checks that first.

use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
use objc2_application_services::{AXIsProcessTrusted, AXIsProcessTrustedWithOptions};
use objc2_core_foundation::{CFBoolean, CFDictionary, CFString, CGPoint};
use objc2_core_graphics::{
    CGEvent, CGEventTapLocation, CGEventType, CGKeyCode, CGMouseButton, CGScrollEventUnit,
};

use crate::error::Error;
use crate::geometry::ScreenPoint;
use crate::traits::{GameWindow, InputDriver, Key};

/// Core Graphics event driver.
pub(super) struct CgInput;

impl InputDriver for CgInput {
    fn focus(&self, window: &GameWindow) -> Result<(), Error> {
        require_accessibility()?;
        let pid = window
            .process_id
            .and_then(|pid| i32::try_from(pid).ok())
            .ok_or_else(|| Error::InputBlocked("the game's app couldn't be identified".into()))?;
        let app = NSRunningApplication::runningApplicationWithProcessIdentifier(pid)
            .ok_or(Error::WindowNotFound)?;
        if app.activateWithOptions(NSApplicationActivationOptions::empty()) {
            Ok(())
        } else {
            Err(Error::InputBlocked(
                "macOS didn't let Wavescan bring the game to the front".into(),
            ))
        }
    }

    fn click(&self, point: ScreenPoint) -> Result<(), Error> {
        require_accessibility()?;
        let at = cg_point(point);
        post_mouse(CGEventType::MouseMoved, at)?;
        post_mouse(CGEventType::LeftMouseDown, at)?;
        post_mouse(CGEventType::LeftMouseUp, at)
    }

    fn scroll(&self, point: ScreenPoint, ticks: i32) -> Result<(), Error> {
        require_accessibility()?;
        post_mouse(CGEventType::MouseMoved, cg_point(point))?;
        let event = CGEvent::new_scroll_wheel_event2(None, CGScrollEventUnit::Line, 1, ticks, 0, 0)
            .ok_or_else(event_failed)?;
        post(&event);
        Ok(())
    }

    fn press(&self, key: Key) -> Result<(), Error> {
        require_accessibility()?;
        let code = key_code(key);
        for down in [true, false] {
            let event = CGEvent::new_keyboard_event(None, code, down).ok_or_else(event_failed)?;
            post(&event);
        }
        Ok(())
    }

    fn cursor_position(&self) -> Result<ScreenPoint, Error> {
        let event = CGEvent::new(None).ok_or_else(event_failed)?;
        let at = CGEvent::location(Some(&event));
        Ok(ScreenPoint::new(round_to_i32(at.x), round_to_i32(at.y)))
    }
}

/// macOS virtual key codes (US layout positions) for the allowed keys.
fn key_code(key: Key) -> CGKeyCode {
    match key {
        Key::Escape => 53,
        Key::B => 11,
        Key::C => 8,
    }
}

/// Fails with a clear message (and shows the macOS permission prompt once) if Wavescan
/// isn't allowed to control the computer.
fn require_accessibility() -> Result<(), Error> {
    // SAFETY: takes no arguments; just queries this process's permission.
    if unsafe { AXIsProcessTrusted() } {
        return Ok(());
    }
    let prompt_key = CFString::from_static_str("AXTrustedCheckOptionPrompt");
    let options = CFDictionary::from_slices(&[&*prompt_key], &[CFBoolean::new(true)]);
    // SAFETY: `options` is a valid dictionary with the documented key and a boolean value.
    let _ = unsafe { AXIsProcessTrustedWithOptions(Some(options.as_opaque())) };
    Err(Error::PermissionDenied(
        "Accessibility. Open System Settings → Privacy & Security → Accessibility, turn on \
         Wavescan, then try again."
            .into(),
    ))
}

/// Creates and posts one left-button mouse event at `at`.
fn post_mouse(kind: CGEventType, at: CGPoint) -> Result<(), Error> {
    let event =
        CGEvent::new_mouse_event(None, kind, at, CGMouseButton::Left).ok_or_else(event_failed)?;
    post(&event);
    Ok(())
}

fn post(event: &CGEvent) {
    CGEvent::post(CGEventTapLocation::HIDEventTap, Some(event));
}

fn cg_point(point: ScreenPoint) -> CGPoint {
    CGPoint::new(f64::from(point.x), f64::from(point.y))
}

fn event_failed() -> Error {
    Error::InputBlocked("macOS couldn't create the input event".into())
}

#[allow(
    clippy::cast_possible_truncation,
    reason = "screen coordinates in points are far inside i32"
)]
fn round_to_i32(value: f64) -> i32 {
    value.round() as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_keys_map_to_mac_key_codes() {
        assert_eq!(key_code(Key::Escape), 53);
        assert_eq!(key_code(Key::B), 11);
        assert_eq!(key_code(Key::C), 8);
    }
}
