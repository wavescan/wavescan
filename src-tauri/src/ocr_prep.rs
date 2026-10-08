//! Cleans up a crop before an OCR engine reads it: grey, more contrast, and three times
//! bigger.
//!
//! Wuthering Tools' browser scanner reads the same echo panels almost perfectly with this
//! recipe (`echoScanner.worker.ts` `preprocess` in the optimizer repo). Without it, Windows
//! OCR dropped short labels standing alone on a row ("HP", "ATK"), read "44.0%" as
//! "44.00/0" and missed small names (2026-10-08 report). At 1920×1080 the panel text is
//! only about 20 px tall, and enlarging it gives the engine more pixels per letter.
//!
//! OS-independent so it's unit-tested everywhere. Each OCR adapter decides whether to use
//! it (ADR 0004: "keep engine-specific preprocessing inside each impl").

use crate::error::Error;
use crate::frame::{BYTES_PER_PIXEL, Frame};
use crate::geometry::Rect;

/// How many times bigger a crop is made before OCR, when the engine's size limit allows.
/// Same as Wuthering Tools.
pub const OCR_UPSCALE: u32 = 3;

/// Contrast multiplier around mid-grey: `(grey - 128) × 1.5 + 128`. Same as Wuthering Tools.
const CONTRAST: f64 = 1.5;

/// The enlargement to use for a `width`×`height` crop: [`OCR_UPSCALE`], or less if that
/// would make either side bigger than `max_dimension` (the engine's limit), but never
/// below 1. A crop already over the limit gets 1, and the engine reports the error.
#[must_use]
pub fn ocr_scale(width: u32, height: u32, max_dimension: u32) -> u32 {
    let longest = width.max(height).max(1);
    (max_dimension / longest).clamp(1, OCR_UPSCALE)
}

/// A copy of `image` that is grey, has more contrast, and is `scale` times bigger, with
/// smooth (bilinear) enlargement like a browser canvas. The result is still BGRA (grey in
/// every colour channel, fully opaque) and keeps the frame's `seq`.
///
/// # Errors
///
/// Returns [`Error::InvalidFrame`] if `scale` is 0 or the enlarged image is too large.
pub fn prepare_for_ocr(image: &Frame, scale: u32) -> Result<Frame, Error> {
    if scale == 0 {
        return Err(Error::InvalidFrame("OCR scale must be at least 1".into()));
    }
    let (width, height) = (image.width(), image.height());
    let too_large = || Error::InvalidFrame(format!("{width}x{height} ×{scale} is too large"));
    let out_width = width.checked_mul(scale).ok_or_else(too_large)?;
    let out_height = height.checked_mul(scale).ok_or_else(too_large)?;

    let grey = grey_levels(image);
    let source_x: Vec<(usize, usize, f64)> = (0..out_width)
        .map(|x| sample_position(x, scale, width))
        .collect();
    let row_len = width as usize;

    let len = out_width as usize * out_height as usize * BYTES_PER_PIXEL;
    let mut pixels = Vec::new();
    pixels.try_reserve_exact(len).map_err(|_| too_large())?;
    for y in 0..out_height {
        let (y0, y1, fy) = sample_position(y, scale, height);
        let (top, bottom) = (y0 * row_len, y1 * row_len);
        for &(x0, x1, fx) in &source_x {
            let at = |offset: usize, x: usize| grey.get(offset + x).copied().unwrap_or(0.0);
            let upper = at(top, x0) * (1.0 - fx) + at(top, x1) * fx;
            let lower = at(bottom, x0) * (1.0 - fx) + at(bottom, x1) * fx;
            let blended = upper * (1.0 - fy) + lower * fy;
            let value = to_byte((blended - 128.0) * CONTRAST + 128.0);
            pixels.extend_from_slice(&[value, value, value, u8::MAX]);
        }
    }
    Frame::from_bgra(out_width, out_height, image.seq(), pixels)
}

/// Maps a box found in an image enlarged `scale` times back to the original crop's pixels,
/// rounding outwards so it still covers the whole text.
#[must_use]
pub fn unscale_bounds(bounds: Rect, scale: u32) -> Rect {
    let s = i64::from(scale.max(1));
    let (x, y) = (i64::from(bounds.x), i64::from(bounds.y));
    let round_up = |value: i64| (value + s - 1).div_euclid(s);
    let left = x.div_euclid(s);
    let top = y.div_euclid(s);
    let right = round_up(x + i64::from(bounds.width));
    let bottom = round_up(y + i64::from(bounds.height));
    // Each value is the original divided by `scale`, so it still fits its original type.
    Rect::new(
        i32::try_from(left).unwrap_or(bounds.x),
        i32::try_from(top).unwrap_or(bounds.y),
        u32::try_from(right - left).unwrap_or(bounds.width),
        u32::try_from(bottom - top).unwrap_or(bounds.height),
    )
}

/// Each pixel's brightness (0–255), using the same weights as Wuthering Tools
/// (0.299 R + 0.587 G + 0.114 B).
fn grey_levels(image: &Frame) -> Vec<f64> {
    // A frame is always whole pixels, so there's no leftover part to handle.
    let (pixels, _) = image.pixels().as_chunks::<BYTES_PER_PIXEL>();
    pixels.iter().copied().map(luma).collect()
}

/// Brightness of one BGRA pixel.
fn luma([blue, green, red, _]: [u8; BYTES_PER_PIXEL]) -> f64 {
    0.114 * f64::from(blue) + 0.587 * f64::from(green) + 0.299 * f64::from(red)
}

/// For output pixel `index` of an image enlarged `scale` times from `source_len` pixels:
/// the two source pixels to blend and how much of the second one to take (0–1). Pixel
/// centres line up the way a browser canvas does it, and edges repeat the last pixel.
fn sample_position(index: u32, scale: u32, source_len: u32) -> (usize, usize, f64) {
    let last = f64::from(source_len.saturating_sub(1));
    let position = ((f64::from(index) + 0.5) / f64::from(scale) - 0.5).clamp(0.0, last);
    let first = position.floor();
    let second = (first + 1.0).min(last);
    (to_index(first), to_index(second), position - first)
}

/// A whole, non-negative pixel position as an index.
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "only called with whole numbers between 0 and a u32 image size"
)]
fn to_index(value: f64) -> usize {
    value as usize
}

/// A brightness rounded and clamped to 0–255.
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the value is clamped to 0–255 first"
)]
fn to_byte(value: f64) -> u8 {
    value.round().clamp(0.0, 255.0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A frame of grey pixels with the given brightness values, row by row.
    fn grey_frame(width: u32, height: u32, values: &[u8]) -> Frame {
        let pixels = values.iter().flat_map(|&v| [v, v, v, 255]).collect();
        Frame::from_bgra(width, height, 9, pixels).unwrap()
    }

    #[test]
    fn scale_is_three_unless_the_engine_limit_needs_less() {
        assert_eq!(ocr_scale(558, 725, 10_000), 3);
        assert_eq!(ocr_scale(558, 725, 2_000), 2);
        assert_eq!(ocr_scale(558, 1_200, 2_000), 1);
        assert_eq!(ocr_scale(3_000, 10, 2_000), 1);
        assert_eq!(ocr_scale(0, 0, 2_000), 3);
    }

    #[test]
    fn enlarges_by_the_scale_and_keeps_the_frame_number() {
        let out = prepare_for_ocr(&grey_frame(2, 1, &[0, 255]), 3).unwrap();
        assert_eq!((out.width(), out.height(), out.seq()), (6, 3, 9));
    }

    #[test]
    fn turns_colour_into_grey_with_the_wuthering_tools_weights() {
        // Pure red: 0.299 × 255 = 76.2 → contrast (76.2 - 128) × 1.5 + 128 = 50.3 → 50.
        let red = Frame::from_bgra(1, 1, 0, vec![0, 0, 255, 255]).unwrap();
        let out = prepare_for_ocr(&red, 1).unwrap();
        assert_eq!(out.pixel(0, 0), Some([50, 50, 50, 255]));
    }

    #[test]
    fn stretches_contrast_around_mid_grey_and_clamps() {
        let image = grey_frame(4, 1, &[128, 200, 40, 250]);
        let out = prepare_for_ocr(&image, 1).unwrap();
        let values: Vec<u8> = (0..4).map(|x| out.pixel(x, 0).unwrap()[0]).collect();
        // 128 stays, 200 → 236, 40 → -4 → 0, 250 → 311 → 255.
        assert_eq!(values, [128, 236, 0, 255]);
    }

    #[test]
    fn blends_smoothly_between_pixels_and_repeats_edges() {
        // Mid-grey 128 and 168 (contrast maps them to 128 and 188), enlarged 2×:
        // centres fall at -0.25, 0.25, 0.75, 1.25 of a source pixel.
        let out = prepare_for_ocr(&grey_frame(2, 1, &[128, 168]), 2).unwrap();
        let values: Vec<u8> = (0..4).map(|x| out.pixel(x, 0).unwrap()[0]).collect();
        assert_eq!(values, [128, 143, 173, 188]);
    }

    #[test]
    fn rejects_a_zero_scale() {
        let result = prepare_for_ocr(&grey_frame(1, 1, &[0]), 0);
        assert!(matches!(result, Err(Error::InvalidFrame(_))));
    }

    #[test]
    fn maps_boxes_back_to_crop_pixels_rounding_outwards() {
        let original = Rect::new(7, 8, 9, 10);
        let enlarged = Rect::new(30, 61, 90, 29);
        assert_eq!(unscale_bounds(enlarged, 3), Rect::new(10, 20, 30, 10));
        assert_eq!(unscale_bounds(original, 1), original);
    }
}
