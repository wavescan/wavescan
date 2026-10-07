//! Windows adapters: Win32 for finding the window, Windows.Graphics.Capture for frames
//! (ADR 0005), Windows.Media.Ocr for text (ADR 0004), `SendInput` for auto mode (ADR 0006).

mod capture;
mod input;
mod ocr;
mod process;
mod window;

pub(in crate::platform) use process::is_elevated;

use crate::platform::Platform;

pub(super) fn create() -> Platform {
    Platform {
        finder: Box::new(window::Win32WindowFinder),
        capture: Box::new(capture::WgcCapture::default()),
        ocr: Box::new(ocr::WinRtOcr),
        input: Box::new(input::SendInputDriver),
    }
}

/// Converts a window id back to the Win32 handle it came from.
#[allow(
    clippy::cast_possible_truncation,
    reason = "ids are created from HWNDs on this (64-bit) machine, so they fit in usize"
)]
fn hwnd_from_id(id: crate::traits::WindowId) -> ::windows::Win32::Foundation::HWND {
    ::windows::Win32::Foundation::HWND(id.0 as usize as *mut core::ffi::c_void)
}

/// Converts a Win32 handle to our OS-independent window id.
fn id_from_hwnd(hwnd: ::windows::Win32::Foundation::HWND) -> crate::traits::WindowId {
    crate::traits::WindowId(hwnd.0 as usize as u64)
}
