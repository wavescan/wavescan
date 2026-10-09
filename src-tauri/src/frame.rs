//! An in-memory image of the game window, as captured.
//!
//! Frames never touch the disk unless the user turns on "Save debug frames", and even then
//! only after [`crate::safety::mask_user_id`] has run (ADR 0013).

use crate::error::Error;
use crate::geometry::{FracRect, Rect};

/// Bytes per pixel in a [`Frame`] (blue, green, red, alpha).
pub const BYTES_PER_PIXEL: usize = 4;

/// One captured image of the game's client area, in BGRA order with no row padding.
///
/// Both capture APIs (Windows.Graphics.Capture, `ScreenCaptureKit`) deliver BGRA; the
/// platform adapters strip any row padding so every frame has `width * 4` bytes per row.
#[derive(Clone, PartialEq, Eq)]
pub struct Frame {
    width: u32,
    height: u32,
    /// Increases by one for every frame a capture session produces. Lets the UI ask for
    /// crops of exactly the frame it fingerprinted.
    seq: u64,
    pixels: Vec<u8>,
}

impl std::fmt::Debug for Frame {
    // Don't dump megabytes of pixels into logs or test output.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Frame")
            .field("width", &self.width)
            .field("height", &self.height)
            .field("seq", &self.seq)
            .finish_non_exhaustive()
    }
}

impl Frame {
    /// Wraps raw BGRA pixels.
    ///
    /// # Errors
    ///
    /// Returns [`Error::InvalidFrame`] if the frame is empty or `pixels` isn't exactly
    /// `width * height * 4` bytes.
    pub fn from_bgra(width: u32, height: u32, seq: u64, pixels: Vec<u8>) -> Result<Self, Error> {
        let expected = byte_len(width, height)
            .ok_or_else(|| Error::InvalidFrame(format!("{width}x{height} is too large")))?;
        if width == 0 || height == 0 {
            return Err(Error::InvalidFrame("frame has no pixels".into()));
        }
        if pixels.len() != expected {
            return Err(Error::InvalidFrame(format!(
                "expected {expected} bytes for {width}x{height}, got {}",
                pixels.len()
            )));
        }
        Ok(Self {
            width,
            height,
            seq,
            pixels,
        })
    }

    /// Creates a frame filled with one colour. Mainly for tests and fakes.
    ///
    /// # Errors
    ///
    /// Returns [`Error::InvalidFrame`] if the size is zero or too large.
    pub fn solid(width: u32, height: u32, seq: u64, bgra: [u8; 4]) -> Result<Self, Error> {
        let len = byte_len(width, height)
            .ok_or_else(|| Error::InvalidFrame(format!("{width}x{height} is too large")))?;
        let pixels = bgra.iter().copied().cycle().take(len).collect();
        Self::from_bgra(width, height, seq, pixels)
    }

    /// Width in pixels.
    #[must_use]
    pub fn width(&self) -> u32 {
        self.width
    }

    /// Height in pixels.
    #[must_use]
    pub fn height(&self) -> u32 {
        self.height
    }

    /// Sequence number within the capture session.
    #[must_use]
    pub fn seq(&self) -> u64 {
        self.seq
    }

    /// Raw BGRA bytes, row by row.
    #[must_use]
    pub fn pixels(&self) -> &[u8] {
        &self.pixels
    }

    /// The BGRA value of one pixel, or `None` if `(x, y)` is outside the frame.
    #[must_use]
    pub fn pixel(&self, x: u32, y: u32) -> Option<[u8; 4]> {
        let start = self.offset(x, y)?;
        let bytes = self.pixels.get(start..start + BYTES_PER_PIXEL)?;
        Some([bytes[0], bytes[1], bytes[2], bytes[3]])
    }

    /// Copies out the region described by `region` (fractions of this frame) as a new frame
    /// with the same sequence number.
    ///
    /// # Errors
    ///
    /// Returns [`Error::InvalidRegion`] if the region is invalid or rounds to zero pixels.
    pub fn crop(&self, region: FracRect) -> Result<Frame, Error> {
        let rect = region
            .to_pixels(self.width, self.height)
            .ok_or(Error::InvalidRegion)?;
        let (left, top) = rect_origin(rect);
        let row_bytes = rect.width as usize * BYTES_PER_PIXEL;
        let mut pixels = Vec::with_capacity(row_bytes * rect.height as usize);
        for row in top..top + rect.height {
            let start = self.offset(left, row).ok_or(Error::InvalidRegion)?;
            let bytes = self
                .pixels
                .get(start..start + row_bytes)
                .ok_or(Error::InvalidRegion)?;
            pixels.extend_from_slice(bytes);
        }
        Frame::from_bgra(rect.width, rect.height, self.seq, pixels)
    }

    /// Paints the region (fractions of this frame) with one colour, in place.
    ///
    /// # Errors
    ///
    /// Returns [`Error::InvalidRegion`] if the region is invalid or rounds to zero pixels.
    pub fn fill(&mut self, region: FracRect, bgra: [u8; 4]) -> Result<(), Error> {
        let rect = region
            .to_pixels(self.width, self.height)
            .ok_or(Error::InvalidRegion)?;
        let (left, top) = rect_origin(rect);
        let row_bytes = rect.width as usize * BYTES_PER_PIXEL;
        for row in top..top + rect.height {
            let start = self.offset(left, row).ok_or(Error::InvalidRegion)?;
            let bytes = self
                .pixels
                .get_mut(start..start + row_bytes)
                .ok_or(Error::InvalidRegion)?;
            let (pixels, _) = bytes.as_chunks_mut::<BYTES_PER_PIXEL>();
            pixels.fill(bgra);
        }
        Ok(())
    }

    /// A smaller copy at most `max_width` pixels wide (aspect ratio kept), converted to
    /// RGBA for drawing in the webview. Uses box averaging so small text stays legible.
    /// Returns `(width, height, rgba_bytes)`.
    ///
    /// Never call this on an unmasked frame that leaves the app; the preview command masks
    /// the User ID on the result before sending it.
    #[must_use]
    pub fn downscaled_rgba(&self, max_width: u32) -> (u32, u32, Vec<u8>) {
        let out_w = max_width.clamp(1, self.width);
        // Keep the aspect ratio; widen to u64 so the multiplication can't overflow.
        let out_h = u32::try_from(
            (u64::from(self.height) * u64::from(out_w) / u64::from(self.width)).max(1),
        )
        .unwrap_or(1);
        let mut out = Vec::with_capacity(out_w as usize * out_h as usize * BYTES_PER_PIXEL);
        for oy in 0..out_h {
            let (y0, y1) = source_span(oy, out_h, self.height);
            for ox in 0..out_w {
                let (x0, x1) = source_span(ox, out_w, self.width);
                let [b, g, r, a] = self.average(x0, x1, y0, y1);
                out.extend_from_slice(&[r, g, b, a]);
            }
        }
        (out_w, out_h, out)
    }

    /// A full-size copy converted to RGBA, the order the webview's image APIs use.
    ///
    /// Never call this on an unmasked frame that leaves the app; crop with
    /// [`crate::safety::crop_outside_user_id`] first.
    #[must_use]
    pub fn to_rgba(&self) -> Vec<u8> {
        let mut out = self.pixels.clone();
        let (pixels, _) = out.as_chunks_mut::<BYTES_PER_PIXEL>();
        for pixel in pixels {
            pixel.swap(0, 2);
        }
        out
    }

    /// Average BGRA colour of the source block `[x0, x1) × [y0, y1)`.
    fn average(&self, x0: u32, x1: u32, y0: u32, y1: u32) -> [u8; 4] {
        let mut sums = [0u64; 4];
        let mut count = 0u64;
        for y in y0..y1 {
            for x in x0..x1 {
                if let Some(pixel) = self.pixel(x, y) {
                    for (sum, channel) in sums.iter_mut().zip(pixel) {
                        *sum += u64::from(channel);
                    }
                    count += 1;
                }
            }
        }
        let count = count.max(1);
        sums.map(|sum| u8::try_from(sum / count).unwrap_or(u8::MAX))
    }

    /// Byte offset of pixel `(x, y)`, or `None` if it's outside the frame.
    fn offset(&self, x: u32, y: u32) -> Option<usize> {
        if x >= self.width || y >= self.height {
            return None;
        }
        let index = y as usize * self.width as usize + x as usize;
        index.checked_mul(BYTES_PER_PIXEL)
    }
}

/// The source pixel range `[start, end)` that output pixel `index` (of `out_len`) covers
/// when shrinking `src_len` pixels. Always at least one pixel wide.
fn source_span(index: u32, out_len: u32, src_len: u32) -> (u32, u32) {
    let scale = |i: u32| {
        u32::try_from(u64::from(i) * u64::from(src_len) / u64::from(out_len)).unwrap_or(src_len)
    };
    let start = scale(index);
    let end = scale(index + 1).max(start + 1).min(src_len);
    (start, end)
}

/// `width * height * 4`, or `None` on overflow.
fn byte_len(width: u32, height: u32) -> Option<usize> {
    (width as usize)
        .checked_mul(height as usize)?
        .checked_mul(BYTES_PER_PIXEL)
}

/// The top-left of a rect produced by `FracRect::to_pixels`, which is never negative.
fn rect_origin(rect: Rect) -> (u32, u32) {
    (rect.x.unsigned_abs(), rect.y.unsigned_abs())
}

#[cfg(test)]
mod tests {
    use super::*;

    const RED: [u8; 4] = [0, 0, 255, 255];
    const BLACK: [u8; 4] = [0, 0, 0, 255];

    /// A 4×2 frame where every pixel's blue channel is its index (0..8).
    fn numbered() -> Frame {
        let pixels = (0u8..8).flat_map(|i| [i, 0, 0, 255]).collect();
        Frame::from_bgra(4, 2, 7, pixels).unwrap()
    }

    #[test]
    fn rejects_wrong_byte_counts_and_empty_frames() {
        assert!(matches!(
            Frame::from_bgra(2, 2, 0, vec![0; 15]),
            Err(Error::InvalidFrame(_))
        ));
        assert!(matches!(
            Frame::from_bgra(0, 2, 0, vec![]),
            Err(Error::InvalidFrame(_))
        ));
    }

    #[test]
    fn pixel_reads_bgra_and_rejects_out_of_bounds() {
        let frame = numbered();
        assert_eq!(frame.pixel(1, 1), Some([5, 0, 0, 255]));
        assert_eq!(frame.pixel(4, 0), None);
        assert_eq!(frame.pixel(0, 2), None);
    }

    #[test]
    fn crop_copies_the_right_pixels_and_keeps_seq() {
        let frame = numbered();
        // Right half: columns 2..4 of both rows -> indices 2,3,6,7.
        let half = frame.crop(FracRect::new(0.5, 0.0, 0.5, 1.0)).unwrap();
        assert_eq!((half.width(), half.height(), half.seq()), (2, 2, 7));
        let (pixels, _) = half.pixels().as_chunks::<4>();
        let blues: Vec<u8> = pixels.iter().map(|p| p[0]).collect();
        assert_eq!(blues, vec![2, 3, 6, 7]);
    }

    #[test]
    fn crop_rejects_invalid_regions() {
        let frame = numbered();
        assert!(matches!(
            frame.crop(FracRect::new(0.8, 0.0, 0.5, 1.0)),
            Err(Error::InvalidRegion)
        ));
    }

    #[test]
    fn fill_paints_only_the_region() {
        let mut frame = Frame::solid(10, 10, 0, RED).unwrap();
        frame
            .fill(FracRect::new(0.5, 0.5, 0.5, 0.5), BLACK)
            .unwrap();
        assert_eq!(frame.pixel(4, 4), Some(RED));
        assert_eq!(frame.pixel(5, 5), Some(BLACK));
        assert_eq!(frame.pixel(9, 9), Some(BLACK));
        assert_eq!(frame.pixel(9, 4), Some(RED));
    }

    #[test]
    fn downscale_keeps_aspect_and_converts_to_rgba() {
        // 4x2 frame, left half pure blue (BGRA 255,0,0), right half pure red (0,0,255).
        let mut frame = Frame::solid(4, 2, 0, [255, 0, 0, 255]).unwrap();
        frame.fill(FracRect::new(0.5, 0.0, 0.5, 1.0), RED).unwrap();
        let (w, h, rgba) = frame.downscaled_rgba(2);
        assert_eq!((w, h), (2, 1));
        // RGBA order: left pixel blue, right pixel red.
        assert_eq!(&rgba[0..4], &[0, 0, 255, 255]);
        assert_eq!(&rgba[4..8], &[255, 0, 0, 255]);
    }

    #[test]
    fn downscale_never_upscales_and_averages_blocks() {
        let mut frame = Frame::solid(2, 2, 0, [0, 0, 0, 255]).unwrap();
        frame
            .fill(FracRect::new(0.0, 0.0, 0.5, 1.0), [200, 200, 200, 255])
            .unwrap();
        let (w, h, _) = frame.downscaled_rgba(10);
        assert_eq!((w, h), (2, 2), "max_width larger than the frame keeps size");
        let (_, _, one) = frame.downscaled_rgba(1);
        assert_eq!(&one, &[100, 100, 100, 255], "average of the two halves");
    }

    #[test]
    fn to_rgba_keeps_size_and_swaps_blue_and_red() {
        let frame = Frame::solid(3, 2, 0, [10, 20, 30, 255]).unwrap();
        let rgba = frame.to_rgba();
        assert_eq!(rgba.len(), 3 * 2 * 4);
        let (pixels, _) = rgba.as_chunks::<4>();
        assert!(pixels.iter().all(|p| p == &[30, 20, 10, 255]));
    }

    #[test]
    fn debug_output_omits_pixels() {
        let text = format!("{:?}", Frame::solid(2, 2, 3, RED).unwrap());
        assert!(text.contains("seq: 3"));
        assert!(!text.contains("pixels"));
    }
}
