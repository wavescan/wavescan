//! Rectangles and points, in two coordinate systems:
//!
//! - **Pixels** ([`Rect`], [`ScreenPoint`]): physical pixels, either on screen (can be
//!   negative on multi-monitor setups) or inside a captured frame.
//! - **Fractions** ([`FracPoint`], [`FracRect`]): 0.0–1.0 of the game's client area. All
//!   screen layouts (ROIs, click targets) are written in fractions so they work at any
//!   resolution, the same way the optimizer's `layout.ts` does.

use serde::{Deserialize, Serialize};

/// A rectangle in physical pixels. `x`/`y` is the top-left corner.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rect {
    /// Left edge.
    pub x: i32,
    /// Top edge.
    pub y: i32,
    /// Width in pixels.
    pub width: u32,
    /// Height in pixels.
    pub height: u32,
}

impl Rect {
    /// Creates a rectangle.
    #[must_use]
    pub const fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    /// Returns true if the point is inside the rectangle (right/bottom edges excluded).
    #[must_use]
    pub fn contains(&self, point: ScreenPoint) -> bool {
        let right = i64::from(self.x) + i64::from(self.width);
        let bottom = i64::from(self.y) + i64::from(self.height);
        let (px, py) = (i64::from(point.x), i64::from(point.y));
        px >= i64::from(self.x) && px < right && py >= i64::from(self.y) && py < bottom
    }

    /// Converts a fractional point (0.0–1.0 of this rectangle) to an absolute pixel point
    /// inside it.
    ///
    /// Returns `None` if the fraction is outside 0.0–1.0 or not a finite number. Callers
    /// must treat that as "don't act", never clamp it into range: a bad coordinate means a
    /// bug, and silently clicking the nearest edge could click the wrong thing.
    #[must_use]
    pub fn point_at(&self, frac: FracPoint) -> Option<ScreenPoint> {
        if !frac.is_valid() {
            return None;
        }
        // Map 0.0..=1.0 onto the pixel range [x, x + width - 1], so 1.0 lands on the last
        // pixel inside the rectangle rather than one past it.
        let last_column = f64::from(self.width.saturating_sub(1));
        let last_row = f64::from(self.height.saturating_sub(1));
        let dx = round_to_i64(frac.x * last_column);
        let dy = round_to_i64(frac.y * last_row);
        let x = i32::try_from(i64::from(self.x) + dx).ok()?;
        let y = i32::try_from(i64::from(self.y) + dy).ok()?;
        Some(ScreenPoint { x, y })
    }
}

/// A point in physical screen pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScreenPoint {
    /// Horizontal position.
    pub x: i32,
    /// Vertical position.
    pub y: i32,
}

impl ScreenPoint {
    /// Creates a point.
    #[must_use]
    pub const fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    /// Distance to another point in pixels (straight line).
    #[must_use]
    pub fn distance_to(self, other: ScreenPoint) -> f64 {
        let dx = f64::from(self.x) - f64::from(other.x);
        let dy = f64::from(self.y) - f64::from(other.y);
        dx.hypot(dy)
    }
}

/// A point as fractions (0.0–1.0) of the game's client area.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct FracPoint {
    /// 0.0 = left edge, 1.0 = right edge.
    pub x: f64,
    /// 0.0 = top edge, 1.0 = bottom edge.
    pub y: f64,
}

impl FracPoint {
    /// Creates a fractional point. Doesn't validate; use [`FracPoint::is_valid`].
    #[must_use]
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    /// True if both coordinates are finite and within 0.0–1.0.
    #[must_use]
    pub fn is_valid(&self) -> bool {
        is_unit(self.x) && is_unit(self.y)
    }
}

/// A rectangle as fractions (0.0–1.0) of a frame or client area.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct FracRect {
    /// Left edge (0.0–1.0).
    pub x: f64,
    /// Top edge (0.0–1.0).
    pub y: f64,
    /// Width (0.0–1.0).
    pub width: f64,
    /// Height (0.0–1.0).
    pub height: f64,
}

impl FracRect {
    /// Creates a fractional rectangle. Doesn't validate; use [`FracRect::is_valid`].
    #[must_use]
    pub const fn new(x: f64, y: f64, width: f64, height: f64) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    /// True if the rectangle is non-empty and lies entirely within 0.0–1.0.
    #[must_use]
    pub fn is_valid(&self) -> bool {
        is_unit(self.x)
            && is_unit(self.y)
            && self.width > 0.0
            && self.height > 0.0
            && is_unit(self.x + self.width)
            && is_unit(self.y + self.height)
    }

    /// True if the two rectangles share any area.
    #[must_use]
    pub fn overlaps(&self, other: &FracRect) -> bool {
        self.x < other.x + other.width
            && other.x < self.x + self.width
            && self.y < other.y + other.height
            && other.y < self.y + self.height
    }

    /// Converts to a pixel rectangle inside an image of `width` × `height`, rounding
    /// outwards (so the pixel rectangle always covers the whole fractional area) and
    /// clipping to the image bounds.
    ///
    /// Returns `None` if the fractional rectangle is invalid or the result would be empty.
    #[must_use]
    pub fn to_pixels(&self, width: u32, height: u32) -> Option<Rect> {
        if !self.is_valid() || width == 0 || height == 0 {
            return None;
        }
        let (w, h) = (f64::from(width), f64::from(height));
        let left = clamp_to_u32((self.x * w).floor(), width);
        let top = clamp_to_u32((self.y * h).floor(), height);
        let right = clamp_to_u32(((self.x + self.width) * w).ceil(), width);
        let bottom = clamp_to_u32(((self.y + self.height) * h).ceil(), height);
        if right <= left || bottom <= top {
            return None;
        }
        Some(Rect::new(
            i32::try_from(left).ok()?,
            i32::try_from(top).ok()?,
            right - left,
            bottom - top,
        ))
    }
}

fn is_unit(value: f64) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}

/// Rounds a finite value that is known to be small (a pixel offset) to `i64`.
#[allow(
    clippy::cast_possible_truncation,
    reason = "callers pass pixel offsets bounded by a u32 width/height, far inside i64"
)]
fn round_to_i64(value: f64) -> i64 {
    value.round() as i64
}

/// Converts a non-negative pixel coordinate to `u32`, clipped to `0..=max`.
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "the value is clamped to 0..=max (a u32) before the cast"
)]
fn clamp_to_u32(value: f64, max: u32) -> u32 {
    value.clamp(0.0, f64::from(max)) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLIENT: Rect = Rect::new(100, 50, 2880, 1800);

    #[test]
    fn point_at_maps_corners_inside_the_rect() {
        assert_eq!(
            CLIENT.point_at(FracPoint::new(0.0, 0.0)),
            Some(ScreenPoint::new(100, 50))
        );
        let bottom_right = CLIENT.point_at(FracPoint::new(1.0, 1.0)).unwrap();
        assert_eq!(bottom_right, ScreenPoint::new(100 + 2879, 50 + 1799));
        assert!(CLIENT.contains(bottom_right));
    }

    #[test]
    fn point_at_rejects_out_of_range_and_non_finite_fractions() {
        for frac in [
            FracPoint::new(-0.01, 0.5),
            FracPoint::new(0.5, 1.01),
            FracPoint::new(f64::NAN, 0.5),
            FracPoint::new(0.5, f64::INFINITY),
        ] {
            assert_eq!(CLIENT.point_at(frac), None, "{frac:?} must be rejected");
        }
    }

    #[test]
    fn point_at_works_with_negative_screen_origins() {
        // A monitor to the left of the primary one has negative x.
        let left_monitor = Rect::new(-1920, 0, 1920, 1080);
        let p = left_monitor.point_at(FracPoint::new(0.5, 0.5)).unwrap();
        assert!(left_monitor.contains(p));
        assert!(p.x < 0);
    }

    #[test]
    fn contains_excludes_right_and_bottom_edges() {
        let r = Rect::new(0, 0, 10, 10);
        assert!(r.contains(ScreenPoint::new(0, 0)));
        assert!(r.contains(ScreenPoint::new(9, 9)));
        assert!(!r.contains(ScreenPoint::new(10, 5)));
        assert!(!r.contains(ScreenPoint::new(5, 10)));
        assert!(!r.contains(ScreenPoint::new(-1, 5)));
    }

    #[test]
    fn frac_rect_validity() {
        assert!(FracRect::new(0.0, 0.0, 1.0, 1.0).is_valid());
        assert!(
            !FracRect::new(0.5, 0.5, 0.6, 0.1).is_valid(),
            "spills past 1.0"
        );
        assert!(!FracRect::new(0.1, 0.1, 0.0, 0.1).is_valid(), "empty");
        assert!(!FracRect::new(f64::NAN, 0.1, 0.1, 0.1).is_valid());
    }

    #[test]
    fn to_pixels_rounds_outwards_and_stays_in_bounds() {
        let r = FracRect::new(0.86, 0.975, 0.14, 0.025)
            .to_pixels(2880, 1800)
            .unwrap();
        assert_eq!(r.x, 2476); // floor(0.86 * 2880 = 2476.8)
        assert_eq!(r.y, 1755); // floor(0.975 * 1800 = 1755.0)
        assert_eq!(i64::from(r.x) + i64::from(r.width), 2880);
        assert_eq!(i64::from(r.y) + i64::from(r.height), 1800);
    }

    #[test]
    fn to_pixels_rejects_invalid_input() {
        assert_eq!(FracRect::new(0.0, 0.0, 1.0, 1.0).to_pixels(0, 100), None);
        assert_eq!(FracRect::new(0.9, 0.0, 0.2, 1.0).to_pixels(100, 100), None);
    }

    #[test]
    fn overlaps_detects_shared_area_only() {
        let a = FracRect::new(0.0, 0.0, 0.5, 0.5);
        assert!(a.overlaps(&FracRect::new(0.4, 0.4, 0.2, 0.2)));
        assert!(
            !a.overlaps(&FracRect::new(0.5, 0.0, 0.2, 0.2)),
            "touching edges"
        );
        assert!(!a.overlaps(&FracRect::new(0.6, 0.6, 0.1, 0.1)));
    }

    #[test]
    fn distance_between_points() {
        let d = ScreenPoint::new(0, 0).distance_to(ScreenPoint::new(3, 4));
        assert!((d - 5.0).abs() < f64::EPSILON);
    }
}
