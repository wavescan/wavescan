//! OS-specific implementations of the traits in `traits.rs`.
//!
//! Only `platform/windows/` and `platform/macos/` may call OS APIs (CLAUDE.md). Helpers in
//! this file are OS-independent so they can be unit-tested everywhere.

use crate::geometry::Rect;
use crate::traits::{FrameSource, InputDriver, OcrEngine, WindowFinder};

#[cfg(windows)]
mod windows;

#[cfg(not(windows))]
mod unsupported;

/// The OS adapters for the platform this build targets.
pub struct Platform {
    /// Finds the game window.
    pub finder: Box<dyn WindowFinder + Send + Sync>,
    /// Captures the game window.
    pub capture: Box<dyn FrameSource + Send>,
    /// Reads text.
    pub ocr: Box<dyn OcrEngine + Send + Sync>,
    /// Sends input. Only `safety::AutoMode` may use it.
    pub input: Box<dyn InputDriver + Send + Sync>,
}

/// Creates the adapters for this OS. On platforms that aren't implemented yet, every
/// adapter returns [`crate::Error::Unsupported`].
#[must_use]
pub fn create() -> Platform {
    #[cfg(windows)]
    {
        windows::create()
    }
    #[cfg(not(windows))]
    {
        unsupported::create()
    }
}

/// The window title the game uses (the real title has trailing spaces).
#[cfg_attr(
    not(windows),
    allow(
        dead_code,
        reason = "used by the Windows adapters; unit-tested on every OS"
    )
)]
pub(crate) const GAME_TITLE: &str = "Wuthering Waves";

/// Window class of Unreal Engine game windows on Windows. Matching on it keeps us from
/// picking the launcher or a browser tab titled "Wuthering Waves".
#[cfg_attr(
    not(windows),
    allow(
        dead_code,
        reason = "used by the Windows adapters; unit-tested on every OS"
    )
)]
pub(crate) const UNREAL_WINDOW_CLASS: &str = "UnrealWindow";

/// True if a window with this class and title is the game itself. Matching uses only the
/// title and class, never the game process, so Wavescan doesn't touch the game (ADR 0006).
#[cfg_attr(
    not(windows),
    allow(
        dead_code,
        reason = "used by the Windows adapters; unit-tested on every OS"
    )
)]
pub(crate) fn is_game_window(class: &str, title: &str) -> bool {
    class == UNREAL_WINDOW_CLASS && title.trim().eq_ignore_ascii_case(GAME_TITLE)
}

/// True if a window title should be listed as a diagnostics candidate.
#[cfg_attr(
    not(windows),
    allow(
        dead_code,
        reason = "used by the Windows adapters; unit-tested on every OS"
    )
)]
pub(crate) fn is_candidate_title(title: &str) -> bool {
    title.to_ascii_lowercase().contains("wuthering")
}

/// Smallest pixel rectangle containing all the given `(x, y, width, height)` boxes, as
/// reported by OCR engines in floating point. `None` if there are no boxes.
#[cfg_attr(
    not(windows),
    allow(
        dead_code,
        reason = "used by the Windows adapters; unit-tested on every OS"
    )
)]
pub(crate) fn union_bounds(boxes: &[(f32, f32, f32, f32)]) -> Option<Rect> {
    let (mut left, mut top) = (f32::INFINITY, f32::INFINITY);
    let (mut right, mut bottom) = (f32::NEG_INFINITY, f32::NEG_INFINITY);
    for &(x, y, w, h) in boxes {
        left = left.min(x);
        top = top.min(y);
        right = right.max(x + w);
        bottom = bottom.max(y + h);
    }
    if !(left.is_finite() && top.is_finite() && right > left && bottom > top) {
        return None;
    }
    // Round outwards on both edges so the rectangle covers every partly-covered pixel.
    let (x0, y0) = (to_px(left.floor()), to_px(top.floor()));
    let (x1, y1) = (to_px(right.ceil()), to_px(bottom.ceil()));
    Some(Rect::new(
        x0,
        y0,
        x1.saturating_sub(x0).unsigned_abs(),
        y1.saturating_sub(y0).unsigned_abs(),
    ))
}

/// Converts a whole-number pixel coordinate from an OCR engine to `i32`.
#[allow(
    clippy::cast_possible_truncation,
    reason = "OCR boxes lie within an image whose size fits in u32; `as` saturates anyway"
)]
#[cfg_attr(
    not(windows),
    allow(
        dead_code,
        reason = "used by the Windows adapters; unit-tested on every OS"
    )
)]
fn to_px(value: f32) -> i32 {
    value as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_game_window_only() {
        assert!(is_game_window("UnrealWindow", "Wuthering Waves  "));
        assert!(is_game_window("UnrealWindow", "Wuthering Waves"));
        assert!(
            !is_game_window("Chrome_WidgetWin_1", "Wuthering Waves"),
            "browser"
        );
        assert!(
            !is_game_window("Qt5QWindowIcon", "Wuthering Waves"),
            "launcher"
        );
        assert!(!is_game_window("UnrealWindow", "Some Other Game"));
    }

    #[test]
    fn candidate_titles_are_limited_to_wuthering() {
        assert!(is_candidate_title("Wuthering Waves  "));
        assert!(is_candidate_title("wuthering waves launcher"));
        assert!(!is_candidate_title("Inbox - Mail"));
    }

    #[test]
    fn union_bounds_covers_all_word_boxes() {
        let words = [(10.2, 5.0, 20.0, 8.0), (35.0, 4.5, 10.0, 9.0)];
        let r = union_bounds(&words).unwrap();
        assert_eq!((r.x, r.y), (10, 4));
        assert!(i64::from(r.x) + i64::from(r.width) >= 45);
        assert!(i64::from(r.y) + i64::from(r.height) >= 14);
        assert_eq!(union_bounds(&[]), None);
    }
}
