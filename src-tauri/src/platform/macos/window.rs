//! Finds the game window via `ScreenCaptureKit`'s window list. Reads only window titles,
//! owning app names and geometry. Listing windows with titles needs the Screen Recording
//! permission, so a missing permission shows up here first, with instructions.

use screencapturekit::prelude::*;
use screencapturekit::shareable_content::{ApplicationSnapshot, ContentSnapshot, WindowSnapshot};

use super::app::frontmost_pid;
use crate::error::Error;
use crate::geometry::Rect;
use crate::platform::{is_candidate_title, is_mac_game_window};
use crate::traits::{GameWindow, WindowCandidate, WindowFinder, WindowId};

/// Message shown when macOS hasn't granted Screen Recording.
pub(super) const SCREEN_RECORDING_HELP: &str = "Screen Recording. Open System Settings → \
    Privacy & Security → Screen & System Audio Recording, turn on Wavescan, then quit and \
    reopen Wavescan.";

/// `ScreenCaptureKit`-based finder.
pub(super) struct SckWindowFinder;

impl WindowFinder for SckWindowFinder {
    fn find_game_window(&self) -> Result<GameWindow, Error> {
        let content = shareable_content()?;
        let snapshot = snapshot(&content)?;
        let (window, app) = pick_game_window(&snapshot).ok_or(Error::WindowNotFound)?;

        // The scale (points → pixels) comes from a filter for this window.
        let scale = content
            .windows()
            .into_iter()
            .find(|w| w.window_id() == window.window_id)
            .and_then(|live| SCContentFilter::create().with_window(&live).build().ok())
            .map_or(1.0, |filter| f64::from(filter.point_pixel_scale()));

        Ok(GameWindow {
            id: WindowId(u64::from(window.window_id)),
            client_rect: rect_from_points(
                window.frame.origin.x,
                window.frame.origin.y,
                window.frame.size.width,
                window.frame.size.height,
            ),
            scale_factor: scale,
            focused: frontmost_pid() == Some(app.process_id),
            minimized: !window.is_on_screen,
            process_id: u32::try_from(app.process_id).ok(),
        })
    }

    fn candidates(&self) -> Result<Vec<WindowCandidate>, Error> {
        let content = shareable_content()?;
        let snapshot = snapshot(&content)?;
        let chosen = pick_game_window(&snapshot).map(|(w, _)| w.window_id);
        Ok(snapshot
            .windows
            .iter()
            .filter_map(|w| {
                let app = app_of(&snapshot, w)?;
                let title = w.title.clone().unwrap_or_default();
                let relevant =
                    is_candidate_title(&title) || is_candidate_title(&app.application_name);
                relevant.then(|| WindowCandidate {
                    title,
                    class: app.application_name.clone(),
                    matched: Some(w.window_id) == chosen,
                })
            })
            .collect())
    }
}

/// Lists shareable content, mapping a missing permission to a helpful error.
pub(super) fn shareable_content() -> Result<SCShareableContent, Error> {
    SCShareableContent::get().map_err(|e| match e {
        SCError::PermissionDenied(_) => Error::PermissionDenied(SCREEN_RECORDING_HELP.into()),
        other => Error::CaptureFailed(other.to_string()),
    })
}

fn snapshot(content: &SCShareableContent) -> Result<ContentSnapshot, Error> {
    content
        .snapshot()
        .ok_or_else(|| Error::CaptureFailed("couldn't read the window list".into()))
}

fn app_of<'a>(
    snapshot: &'a ContentSnapshot,
    window: &WindowSnapshot,
) -> Option<&'a ApplicationSnapshot> {
    window
        .owning_app_index
        .and_then(|i| snapshot.applications.get(i))
}

/// The game's main window: a normal-level window of the game app, preferring on-screen
/// windows, then the largest.
fn pick_game_window(snapshot: &ContentSnapshot) -> Option<(&WindowSnapshot, &ApplicationSnapshot)> {
    snapshot
        .windows
        .iter()
        .filter(|w| w.window_layer == 0)
        .filter_map(|w| {
            let app = app_of(snapshot, w)?;
            let title = w.title.as_deref().unwrap_or("");
            is_mac_game_window(&app.application_name, title).then_some((w, app))
        })
        .max_by(|(a, _), (b, _)| {
            (a.is_on_screen, area(a))
                .partial_cmp(&(b.is_on_screen, area(b)))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
}

fn area(window: &WindowSnapshot) -> f64 {
    window.frame.size.width * window.frame.size.height
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
