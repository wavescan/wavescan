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
}
