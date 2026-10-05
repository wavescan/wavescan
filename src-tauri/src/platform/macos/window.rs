//! Finds the game window via `ScreenCaptureKit`'s window list. Reads only window titles,
//! owning app names and geometry. Listing windows needs the Screen Recording permission,
//! so a missing permission shows up here first, with instructions.

use objc2::AnyThread;
use objc2::runtime::NSObjectProtocol;
use objc2::sel;
use objc2_screen_capture_kit::{SCContentFilter, SCWindow};

use super::app::frontmost_pid;
use super::sck::{shareable_content, window_infos};
use crate::error::Error;
use crate::geometry::Rect;
use crate::platform::{is_candidate_title, pick_mac_game_window};
use crate::traits::{GameWindow, WindowCandidate, WindowFinder, WindowId};

/// Used when macOS is too old to report the scale (`pointPixelScale` needs macOS 14).
/// Apple Silicon built-in displays are 2×; asking for too large a capture is harmless
/// because `ScreenCaptureKit` never scales windows up.
pub(super) const FALLBACK_SCALE: f64 = 2.0;

/// `ScreenCaptureKit`-based finder.
pub(super) struct SckWindowFinder;

impl WindowFinder for SckWindowFinder {
    fn find_game_window(&self) -> Result<GameWindow, Error> {
        let content = shareable_content()?;
        let windows = window_infos(&content);
        let infos: Vec<_> = windows.iter().map(|(info, _)| info.clone()).collect();
        let game = pick_mac_game_window(&infos).ok_or(Error::WindowNotFound)?;
        let live = windows
            .iter()
            .find(|(info, _)| info.id == game.id)
            .map(|(_, window)| window)
            .ok_or(Error::WindowNotFound)?;

        let (x, y, w, h) = game.frame;
        Ok(GameWindow {
            id: WindowId(u64::from(game.id)),
            client_rect: rect_from_points(x, y, w, h),
            scale_factor: point_pixel_scale(live),
            focused: frontmost_pid() == Some(game.pid),
            minimized: !game.on_screen,
            process_id: u32::try_from(game.pid).ok(),
        })
    }

    fn candidates(&self) -> Result<Vec<WindowCandidate>, Error> {
        let content = shareable_content()?;
        let infos: Vec<_> = window_infos(&content)
            .into_iter()
            .map(|(info, _)| info)
            .collect();
        let chosen = pick_mac_game_window(&infos).map(|w| w.id);
        Ok(infos
            .iter()
            .filter(|w| is_candidate_title(&w.title) || is_candidate_title(&w.app_name))
            .map(|w| WindowCandidate {
                title: w.title.clone(),
                class: w.app_name.clone(),
                matched: Some(w.id) == chosen,
            })
            .collect())
    }
}

/// Points-to-pixels scale for `window`'s display.
pub(super) fn point_pixel_scale(window: &SCWindow) -> f64 {
    // SAFETY: creating a filter for a window ScreenCaptureKit just returned.
    let filter = unsafe {
        SCContentFilter::initWithDesktopIndependentWindow(SCContentFilter::alloc(), window)
    };
    if filter.respondsToSelector(sel!(pointPixelScale)) {
        // SAFETY: the selector exists on this macOS version (checked above).
        f64::from(unsafe { filter.pointPixelScale() })
    } else {
        FALLBACK_SCALE
    }
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "window geometry in points is far inside i32/u32; sizes are clamped to >= 0"
)]
fn rect_from_points(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect::new(
        x.round() as i32,
        y.round() as i32,
        width.max(0.0).round() as u32,
        height.max(0.0).round() as u32,
    )
}
