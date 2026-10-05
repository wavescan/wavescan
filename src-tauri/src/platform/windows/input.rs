//! Synthetic mouse and keyboard input with `SendInput` (ADR 0006).
//!
//! SECURITY-SENSITIVE. Only `safety::AutoMode` may drive this (see `traits::InputDriver`).
//! Keys are sent as hardware scancodes because games usually read raw input.

use std::mem::size_of;

use windows::Win32::Foundation::POINT;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP,
    KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC, MOUSE_EVENT_FLAGS, MOUSEEVENTF_LEFTDOWN,
    MOUSEEVENTF_LEFTUP, MOUSEEVENTF_WHEEL, MOUSEINPUT, MapVirtualKeyW, SendInput, VIRTUAL_KEY,
    VK_B, VK_C, VK_ESCAPE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, SetCursorPos, SetForegroundWindow, WHEEL_DELTA,
};

use super::hwnd_from_id;
use crate::error::Error;
use crate::geometry::ScreenPoint;
use crate::traits::{GameWindow, InputDriver, Key};

/// `SendInput`-based driver.
pub(super) struct SendInputDriver;

impl InputDriver for SendInputDriver {
    fn focus(&self, window: &GameWindow) -> Result<(), Error> {
        // SAFETY: SetForegroundWindow only takes a handle; an invalid handle returns false.
        let ok = unsafe { SetForegroundWindow(hwnd_from_id(window.id)) }.as_bool();
        if ok {
            Ok(())
        } else {
            Err(Error::InputBlocked(
                "Windows didn't let Wavescan bring the game to the front. Click the game once, \
                 then try again."
                    .into(),
            ))
        }
    }

    fn click(&self, point: ScreenPoint) -> Result<(), Error> {
        move_cursor(point)?;
        send(&[mouse(MOUSEEVENTF_LEFTDOWN, 0), mouse(MOUSEEVENTF_LEFTUP, 0)])
    }

    fn scroll(&self, point: ScreenPoint, ticks: i32) -> Result<(), Error> {
        move_cursor(point)?;
        let delta = ticks.saturating_mul(i32::try_from(WHEEL_DELTA).unwrap_or(120));
        // The API stores the signed wheel delta in an unsigned field.
        send(&[mouse(MOUSEEVENTF_WHEEL, delta.cast_unsigned())])
    }

    fn press(&self, key: Key) -> Result<(), Error> {
        // SAFETY: MapVirtualKeyW is a pure lookup with no pointer arguments.
        let scan = unsafe { MapVirtualKeyW(u32::from(virtual_key(key).0), MAPVK_VK_TO_VSC) };
        let scan = u16::try_from(scan).map_err(|_| Error::InputBlocked("no scancode".into()))?;
        send(&[
            keyboard(scan, KEYEVENTF_SCANCODE),
            keyboard(scan, KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP),
        ])
    }

    fn cursor_position(&self) -> Result<ScreenPoint, Error> {
        let mut point = POINT::default();
        // SAFETY: `point` is a valid, writable POINT.
        unsafe { GetCursorPos(&raw mut point) }
            .map_err(|e| Error::InputBlocked(format!("couldn't read the cursor: {e}")))?;
        Ok(ScreenPoint::new(point.x, point.y))
    }
}

/// The Windows virtual-key code for each allowed key.
fn virtual_key(key: Key) -> VIRTUAL_KEY {
    match key {
        Key::Escape => VK_ESCAPE,
        Key::B => VK_B,
        Key::C => VK_C,
    }
}

fn move_cursor(point: ScreenPoint) -> Result<(), Error> {
    // SAFETY: SetCursorPos takes plain integers. Wavescan is per-monitor DPI aware (Tauri),
    // so these are physical pixels, matching `GameWindow::client_rect`.
    unsafe { SetCursorPos(point.x, point.y) }
        .map_err(|e| Error::InputBlocked(format!("couldn't move the cursor: {e}")))
}

fn mouse(flags: MOUSE_EVENT_FLAGS, data: u32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: 0,
                dy: 0,
                mouseData: data,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn keyboard(scan: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(0),
                wScan: scan,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

/// Sends a batch of events. Note: if the game runs as administrator and Wavescan doesn't,
/// Windows drops the events *silently* (UIPI), so success here doesn't prove the game got
/// them. The Diagnostics input test checks the effect on screen instead.
fn send(inputs: &[INPUT]) -> Result<(), Error> {
    let size = i32::try_from(size_of::<INPUT>()).unwrap_or(i32::MAX);
    // SAFETY: `inputs` is a valid slice of fully initialised INPUT structs, and `size` is
    // the size of one INPUT, as the API requires.
    let sent = unsafe { SendInput(inputs, size) };
    if usize::try_from(sent).unwrap_or(0) == inputs.len() {
        Ok(())
    } else {
        Err(Error::InputBlocked(
            "Windows blocked the input. If the game runs as administrator, run Wavescan as \
             administrator too."
                .into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_keys_map_to_expected_virtual_keys() {
        assert_eq!(virtual_key(Key::Escape), VK_ESCAPE);
        assert_eq!(virtual_key(Key::B).0, u16::from(b'B'));
        assert_eq!(virtual_key(Key::C).0, u16::from(b'C'));
    }

    #[test]
    fn wheel_delta_is_stored_as_twos_complement() {
        let input = mouse(MOUSEEVENTF_WHEEL, (-240i32).cast_unsigned());
        // SAFETY: test-only read of the union field we just wrote.
        let data = unsafe { input.Anonymous.mi.mouseData };
        assert_eq!(data.cast_signed(), -240);
    }
}
