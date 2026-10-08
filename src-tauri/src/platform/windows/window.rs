//! Finds the game window with Win32 window enumeration. Reads only window titles, classes
//! and geometry; never opens the game process.

use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute};
use windows::Win32::Graphics::Gdi::ClientToScreen;
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetClientRect, GetForegroundWindow, GetWindowTextW, IsIconic,
    IsWindowVisible,
};
use windows::core::BOOL;

use super::id_from_hwnd;
use crate::error::Error;
use crate::geometry::Rect;
use crate::platform::{is_candidate_title, is_game_window};
use crate::traits::{GameWindow, WindowCandidate, WindowFinder};

/// Finds the game by window class (`UnrealWindow`) and title (`Wuthering Waves`).
pub(super) struct Win32WindowFinder;

/// A visible top-level window.
struct TopLevelWindow {
    hwnd: HWND,
    title: String,
    class: String,
}

impl WindowFinder for Win32WindowFinder {
    fn find_game_window(&self) -> Result<GameWindow, Error> {
        let game = visible_windows()?
            .into_iter()
            .find(|w| is_game_window(&w.class, &w.title))
            .ok_or(Error::WindowNotFound)?;
        describe(game.hwnd)
    }

    fn candidates(&self) -> Result<Vec<WindowCandidate>, Error> {
        Ok(visible_windows()?
            .into_iter()
            .filter(|w| is_candidate_title(&w.title))
            .map(|w| WindowCandidate {
                matched: is_game_window(&w.class, &w.title),
                title: w.title,
                class: w.class,
            })
            .collect())
    }
}

/// Reads the current geometry, DPI, focus and minimised state of `hwnd`.
fn describe(hwnd: HWND) -> Result<GameWindow, Error> {
    let client_rect = client_on_screen(hwnd).ok_or(Error::WindowNotFound)?;

    // SAFETY: these only read state of a window handle; an invalid handle returns 0/false.
    let (dpi, focused, minimized) = unsafe {
        (
            GetDpiForWindow(hwnd),
            GetForegroundWindow() == hwnd,
            IsIconic(hwnd).as_bool(),
        )
    };

    Ok(GameWindow {
        id: id_from_hwnd(hwnd),
        client_rect,
        scale_factor: if dpi == 0 { 1.0 } else { f64::from(dpi) / 96.0 },
        focused,
        minimized,
        process_id: None,
    })
}

/// The window's client area (the game picture, without title bar or borders) in screen
/// pixels. `None` if the window has closed.
fn client_on_screen(hwnd: HWND) -> Option<Rect> {
    let mut client = RECT::default();
    // SAFETY: `client` is a valid, writable RECT. An invalid or closed `hwnd` makes the call
    // fail, which we return as `None`.
    unsafe { GetClientRect(hwnd, &raw mut client) }.ok()?;

    let mut origin = POINT { x: 0, y: 0 };
    // SAFETY: as above; `origin` is a valid, writable POINT.
    if !unsafe { ClientToScreen(hwnd, &raw mut origin) }.as_bool() {
        return None;
    }

    let width = u32::try_from(client.right - client.left).unwrap_or(0);
    let height = u32::try_from(client.bottom - client.top).unwrap_or(0);
    Some(Rect::new(origin.x, origin.y, width, height))
}

/// Where the game area sits inside a captured frame of `hwnd`, in frame pixels. A windowed
/// capture includes the title bar and borders, so the capture code crops to this. `None` if
/// the window has closed or the game area isn't inside the frame.
///
/// The capture covers the window's visible bounds (`DWMWA_EXTENDED_FRAME_BOUNDS`, which
/// leaves out the invisible resize border), so the game area's offset is measured from there.
pub(super) fn client_area_in_frame(
    hwnd: HWND,
    frame_width: u32,
    frame_height: u32,
) -> Option<Rect> {
    let mut bounds = RECT::default();
    let size = u32::try_from(std::mem::size_of::<RECT>()).ok()?;
    // SAFETY: `bounds` is a valid, writable RECT and we pass its exact size, which is what
    // this attribute writes. An invalid or closed `hwnd` makes the call fail (`None`).
    unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            std::ptr::from_mut(&mut bounds).cast(),
            size,
        )
    }
    .ok()?;
    let window = Rect::new(
        bounds.left,
        bounds.top,
        u32::try_from(bounds.right - bounds.left).ok()?,
        u32::try_from(bounds.bottom - bounds.top).ok()?,
    );
    let client = client_on_screen(hwnd)?;
    crate::platform::client_area_in_frame(frame_width, frame_height, window, client)
}

/// Lists visible top-level windows with their titles and classes.
fn visible_windows() -> Result<Vec<TopLevelWindow>, Error> {
    let mut found: Vec<TopLevelWindow> = Vec::new();
    // SAFETY: `collect` only runs during this EnumWindows call, while `found` is alive and
    // not otherwise borrowed; the LPARAM carries a pointer to it.
    unsafe {
        EnumWindows(
            Some(collect),
            LPARAM(std::ptr::from_mut(&mut found) as isize),
        )
    }
    .map_err(|e| Error::CaptureFailed(format!("could not list windows: {e}")))?;
    Ok(found)
}

/// `EnumWindows` callback: records visible windows. Returning `true` continues enumeration.
unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
    // SAFETY: `lparam` is the `&mut Vec<TopLevelWindow>` passed by `visible_windows`,
    // which outlives the EnumWindows call that invokes this callback.
    let found = unsafe { &mut *(lparam.0 as *mut Vec<TopLevelWindow>) };
    // SAFETY: `hwnd` is supplied by the OS for this callback.
    if unsafe { IsWindowVisible(hwnd) }.as_bool() {
        // SAFETY: `hwnd` comes from the OS for this callback; `buf` is a valid, writable
        // buffer and the API never writes past its length.
        let title = read_text(|buf| unsafe { GetWindowTextW(hwnd, buf) });
        // SAFETY: as above.
        let class = read_text(|buf| unsafe { GetClassNameW(hwnd, buf) });
        found.push(TopLevelWindow { hwnd, title, class });
    }
    true.into()
}

/// Calls a Win32 "fill this UTF-16 buffer" function and converts the result to a String.
fn read_text(fill: impl FnOnce(&mut [u16]) -> i32) -> String {
    let mut buf = [0u16; 256];
    let len = usize::try_from(fill(&mut buf)).unwrap_or(0).min(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_that_does_not_exist_has_no_client_area() {
        let gone = HWND(std::ptr::null_mut());
        assert_eq!(client_on_screen(gone), None);
        assert_eq!(client_area_in_frame(gone, 1920, 1080), None);
    }
}
