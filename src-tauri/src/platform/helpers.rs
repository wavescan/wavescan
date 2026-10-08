//! OS-independent helpers used by the platform adapters. Kept separate from `mod.rs` so
//! they're unit-tested on every OS and can be compiled into the macOS type-check probe
//! (`scripts/macos-probe/`).

use crate::geometry::Rect;

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

/// Where the game area (the window's client area) sits inside a captured window frame, in
/// frame pixels, clipped to the frame. `None` if none of it is inside the frame.
///
/// A windowed capture covers the whole visible window: title bar and borders included.
/// `window` is that visible area and `client` the game area, both in screen pixels, so the
/// game area starts at their difference. We work this out ourselves because
/// `windows-capture`'s `buffer_without_title_bar` assumes the client size is unscaled and
/// crops nothing when Windows display scaling is above 100% (2026-10-08 report: a
/// 1920×1080 game at 200% came through as 1924×1140, and every read region was shifted).
#[cfg_attr(
    not(windows),
    allow(
        dead_code,
        reason = "used by the Windows adapters; unit-tested on every OS"
    )
)]
pub(crate) fn client_area_in_frame(
    frame_width: u32,
    frame_height: u32,
    window: Rect,
    client: Rect,
) -> Option<Rect> {
    let left = i64::from(client.x) - i64::from(window.x);
    let top = i64::from(client.y) - i64::from(window.y);
    // The frame can lag a resize by a frame or two, so clip rather than trust the sizes.
    let right = (left + i64::from(client.width)).min(i64::from(frame_width));
    let bottom = (top + i64::from(client.height)).min(i64::from(frame_height));
    let (left, top) = (left.max(0), top.max(0));
    if right <= left || bottom <= top {
        return None;
    }
    Some(Rect::new(
        i32::try_from(left).ok()?,
        i32::try_from(top).ok()?,
        u32::try_from(right - left).ok()?,
        u32::try_from(bottom - top).ok()?,
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

/// True if a macOS window (owning app name + title) is the game. The Mac version runs as
/// an app named "Wuthering Waves"; the title check covers a differently named bundle.
#[cfg_attr(
    not(target_os = "macos"),
    allow(
        dead_code,
        reason = "used by the macOS adapters; unit-tested on every OS"
    )
)]
pub(crate) fn is_mac_game_window(app_name: &str, title: &str) -> bool {
    app_name.trim().eq_ignore_ascii_case(GAME_TITLE)
        || title.trim().eq_ignore_ascii_case(GAME_TITLE)
}

/// Copies `height` rows of `width` BGRA pixels out of a buffer whose rows are `stride`
/// bytes apart (GPU buffers often pad rows). `None` if the buffer is too small.
#[cfg_attr(
    not(target_os = "macos"),
    allow(
        dead_code,
        reason = "used by the macOS adapters; unit-tested on every OS"
    )
)]
pub(crate) fn strip_row_padding(
    bytes: &[u8],
    width: usize,
    height: usize,
    stride: usize,
) -> Option<Vec<u8>> {
    let row = width.checked_mul(4)?;
    if stride < row {
        return None;
    }
    let mut out = Vec::with_capacity(row.checked_mul(height)?);
    for y in 0..height {
        let start = y.checked_mul(stride)?;
        out.extend_from_slice(bytes.get(start..start.checked_add(row)?)?);
    }
    Some(out)
}

/// What the macOS window list tells us about one window, copied out of the
/// `ScreenCaptureKit` objects so the selection logic can be unit-tested.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(
    not(target_os = "macos"),
    allow(
        dead_code,
        reason = "used by the macOS adapters; unit-tested on every OS"
    )
)]
pub(crate) struct MacWindowInfo {
    pub id: u32,
    pub app_name: String,
    pub title: String,
    pub layer: isize,
    pub on_screen: bool,
    pub pid: i32,
    /// Frame in points: x, y, width, height.
    pub frame: (f64, f64, f64, f64),
}

/// Picks the game's main window: a normal-level (layer 0) window of the game, preferring
/// on-screen windows, then the largest.
#[cfg_attr(
    not(target_os = "macos"),
    allow(
        dead_code,
        reason = "used by the macOS adapters; unit-tested on every OS"
    )
)]
pub(crate) fn pick_mac_game_window(windows: &[MacWindowInfo]) -> Option<&MacWindowInfo> {
    let area = |w: &MacWindowInfo| w.frame.2 * w.frame.3;
    windows
        .iter()
        .filter(|w| w.layer == 0 && is_mac_game_window(&w.app_name, &w.title))
        .max_by(|a, b| {
            (a.on_screen, area(a))
                .partial_cmp(&(b.on_screen, area(b)))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
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

    #[test]
    fn matches_the_mac_game_by_app_name_or_title() {
        assert!(is_mac_game_window("Wuthering Waves", ""));
        assert!(is_mac_game_window("Client", "Wuthering Waves  "));
        assert!(!is_mac_game_window(
            "Safari",
            "Wuthering Waves wiki - Fandom"
        ));
        assert!(!is_mac_game_window("Finder", "Downloads"));
    }

    #[test]
    fn strips_row_padding() {
        // 2x2 image, 8 bytes of pixels per row, padded to 12.
        let padded = [
            1, 1, 1, 1, 2, 2, 2, 2, 0, 0, 0, 0, //
            3, 3, 3, 3, 4, 4, 4, 4, 0, 0, 0, 0,
        ];
        let out = strip_row_padding(&padded, 2, 2, 12).unwrap();
        assert_eq!(out, vec![1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
        assert_eq!(strip_row_padding(&padded, 2, 3, 12), None, "too few rows");
        assert_eq!(strip_row_padding(&padded, 4, 2, 12), None, "stride < row");
    }

    fn mac_window(id: u32, app: &str, layer: isize, on_screen: bool, w: f64) -> MacWindowInfo {
        MacWindowInfo {
            id,
            app_name: app.into(),
            title: String::new(),
            layer,
            on_screen,
            pid: 1,
            frame: (0.0, 0.0, w, w * 0.625),
        }
    }

    // 2026-10-08 report: 1920×1080 game at 200% scale in a window, captured as 1924×1140
    // (2 px borders, 58 px title bar). Client origin from the diagnostic: (480, 320).
    #[test]
    fn crops_title_bar_and_borders_from_a_windowed_capture() {
        let window = Rect::new(478, 262, 1924, 1140);
        let client = Rect::new(480, 320, 1920, 1080);
        assert_eq!(
            client_area_in_frame(1924, 1140, window, client),
            Some(Rect::new(2, 58, 1920, 1080))
        );
    }

    #[test]
    fn borderless_capture_is_left_whole() {
        let screen = Rect::new(0, 0, 2880, 1800);
        assert_eq!(
            client_area_in_frame(2880, 1800, screen, screen),
            Some(screen)
        );
    }

    #[test]
    fn crop_is_clipped_to_a_frame_that_lags_a_resize() {
        let window = Rect::new(100, 100, 1924, 1140);
        let client = Rect::new(102, 158, 1920, 1080);
        // The frame is still the old, smaller size.
        assert_eq!(
            client_area_in_frame(1600, 1000, window, client),
            Some(Rect::new(2, 58, 1598, 942))
        );
    }

    #[test]
    fn client_area_outside_the_frame_gives_no_crop() {
        let window = Rect::new(0, 0, 800, 600);
        assert_eq!(
            client_area_in_frame(800, 600, window, Rect::new(900, 0, 100, 100)),
            None
        );
        assert_eq!(
            client_area_in_frame(800, 600, window, Rect::new(0, 0, 0, 0)),
            None
        );
    }

    #[test]
    fn picks_the_largest_on_screen_normal_game_window() {
        let windows = [
            mac_window(1, "Safari", 0, true, 3000.0),
            mac_window(2, "Wuthering Waves", 3, true, 2000.0), // overlay layer
            mac_window(3, "Wuthering Waves", 0, false, 2880.0), // minimised
            mac_window(4, "Wuthering Waves", 0, true, 1440.0),
            mac_window(5, "Wuthering Waves", 0, true, 100.0),
        ];
        assert_eq!(pick_mac_game_window(&windows).map(|w| w.id), Some(4));
    }

    #[test]
    fn falls_back_to_an_off_screen_game_window() {
        let windows = [mac_window(3, "Wuthering Waves", 0, false, 2880.0)];
        assert_eq!(pick_mac_game_window(&windows).map(|w| w.id), Some(3));
        assert_eq!(
            pick_mac_game_window(&[mac_window(1, "Finder", 0, true, 10.0)]),
            None
        );
    }
}
