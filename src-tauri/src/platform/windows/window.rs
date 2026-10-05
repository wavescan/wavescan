//! Finds the game window with Win32 window enumeration. Reads only window titles, classes
//! and geometry; never opens the game process.

use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
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
    let mut client = RECT::default();
    // SAFETY: `hwnd` came from EnumWindows moments ago and `client` is a valid, writable
    // RECT. If the window has since closed, the call fails and we return an error.
    unsafe { GetClientRect(hwnd, &raw mut client) }.map_err(|_| Error::WindowNotFound)?;

    let mut origin = POINT { x: 0, y: 0 };
    // SAFETY: as above; `origin` is a valid, writable POINT.
    if !unsafe { ClientToScreen(hwnd, &raw mut origin) }.as_bool() {
        return Err(Error::WindowNotFound);
    }

    // SAFETY: these only read state of a window handle; an invalid handle returns 0/false.
    let (dpi, focused, minimized) = unsafe {
        (
            GetDpiForWindow(hwnd),
            GetForegroundWindow() == hwnd,
            IsIconic(hwnd).as_bool(),
        )
    };

    let width = u32::try_from(client.right - client.left).unwrap_or(0);
    let height = u32::try_from(client.bottom - client.top).unwrap_or(0);
    Ok(GameWindow {
        id: id_from_hwnd(hwnd),
        client_rect: Rect::new(origin.x, origin.y, width, height),
        scale_factor: if dpi == 0 { 1.0 } else { f64::from(dpi) / 96.0 },
        focused,
        minimized,
    })
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
