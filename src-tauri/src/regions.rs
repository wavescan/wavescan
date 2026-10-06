//! Reading parts of a captured frame for the scanner: small images for change detection
//! (`sample`) and OCR text (`read`). Every crop goes through
//! [`crate::safety::crop_outside_user_id`], so the User ID can never be sampled or read.
//!
//! The layout fractions come from the TypeScript side (scanner-core's `layout.ts`); this
//! module only crops, scales and reads. See `docs/architecture.md` §2.

use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::frame::Frame;
use crate::geometry::FracRect;
use crate::safety;
use crate::traits::{OcrEngine, OcrLine};

/// Most regions one request may ask for. A full echo panel needs about eight.
pub const MAX_REGIONS: usize = 16;

/// Largest sample width the UI may request, in pixels. Fingerprints need far less.
pub const MAX_SAMPLE_WIDTH: u32 = 256;

/// One region to OCR, identified by a caller-chosen id (e.g. `"name"`).
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct RegionRead {
    /// Echoed back in the result so the caller can match results to requests.
    pub id: String,
    /// The region, as fractions of the frame.
    pub region: FracRect,
}

/// The text read from one region. Mirrored as `RegionText` in `src/ipc/types.ts`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RegionText {
    /// The request's id.
    pub id: String,
    /// Lines top to bottom, with positions inside the cropped region.
    pub lines: Vec<OcrLine>,
    /// Cropped width in pixels.
    pub width: u32,
    /// Cropped height in pixels.
    pub height: u32,
    /// Time spent in the OS OCR engine for this region, in milliseconds.
    pub elapsed_ms: f64,
}

fn check_count(len: usize) -> Result<(), Error> {
    if len == 0 || len > MAX_REGIONS {
        return Err(Error::InvalidRegion);
    }
    Ok(())
}

/// Small RGBA images of `regions`, for change detection. Encoded as:
///
/// `[seq: u64 LE][count: u32 LE]` then, per region, `[width: u32 LE][height: u32 LE][RGBA]`.
///
/// Each region is downscaled to at most `max_width` pixels wide (clamped to
/// 8..=[`MAX_SAMPLE_WIDTH`]).
///
/// # Errors
///
/// [`Error::InvalidRegion`] if there are no regions, too many, or any region is invalid
/// or overlaps the User ID.
pub fn sample(frame: &Frame, regions: &[FracRect], max_width: u32) -> Result<Vec<u8>, Error> {
    check_count(regions.len())?;
    let width = max_width.clamp(8, MAX_SAMPLE_WIDTH);
    let mut out = Vec::new();
    out.extend_from_slice(&frame.seq().to_le_bytes());
    out.extend_from_slice(&u32::try_from(regions.len()).unwrap_or(0).to_le_bytes());
    for region in regions {
        let crop = safety::crop_outside_user_id(frame, *region)?;
        let (w, h, rgba) = crop.downscaled_rgba(width);
        out.extend_from_slice(&w.to_le_bytes());
        out.extend_from_slice(&h.to_le_bytes());
        out.extend_from_slice(&rgba);
    }
    Ok(out)
}

/// OCRs each region of `frame`, in parallel (one thread per region; OS OCR engines are
/// thread-safe and each call is independent). Results come back in request order.
///
/// # Errors
///
/// [`Error::InvalidRegion`] for a bad request (see [`sample`]), or the first OCR error.
pub fn read(
    frame: &Frame,
    regions: &[RegionRead],
    ocr: &(dyn OcrEngine + Send + Sync),
) -> Result<Vec<RegionText>, Error> {
    check_count(regions.len())?;
    // Crop everything first, so a bad region fails before any OCR work starts.
    let crops = regions
        .iter()
        .map(|r| safety::crop_outside_user_id(frame, r.region))
        .collect::<Result<Vec<_>, _>>()?;

    std::thread::scope(|scope| {
        let handles: Vec<_> = regions
            .iter()
            .zip(&crops)
            .map(|(request, crop)| {
                scope.spawn(move || {
                    let started = Instant::now();
                    let lines = ocr.recognize(crop)?;
                    Ok(RegionText {
                        id: request.id.clone(),
                        lines,
                        width: crop.width(),
                        height: crop.height(),
                        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                    })
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .unwrap_or_else(|_| Err(Error::OcrFailed("OCR thread crashed".into())))
            })
            .collect()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::Rect;
    use crate::testing::FakeOcr;

    fn frame(seq: u64) -> Frame {
        Frame::solid(2880, 1800, seq, [10, 20, 30, 255]).unwrap()
    }

    const NAME: FracRect = FracRect::new(0.685, 0.104, 0.27, 0.034);
    const PANEL: FracRect = FracRect::new(0.685, 0.095, 0.29, 0.67);
    const USER_ID_OVERLAP: FracRect = FracRect::new(0.8, 0.9, 0.2, 0.1);

    fn read_u32(bytes: &[u8], at: usize) -> u32 {
        u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap())
    }

    #[test]
    fn sample_encodes_seq_count_and_each_region() {
        let bytes = sample(&frame(42), &[NAME, PANEL], 64).unwrap();
        assert_eq!(u64::from_le_bytes(bytes[0..8].try_into().unwrap()), 42);
        assert_eq!(read_u32(&bytes, 8), 2);

        let (w1, h1) = (read_u32(&bytes, 12), read_u32(&bytes, 16));
        assert_eq!(w1, 64);
        let second = 20 + (w1 * h1 * 4) as usize;
        let (w2, h2) = (read_u32(&bytes, second), read_u32(&bytes, second + 4));
        assert_eq!(w2, 64);
        assert_eq!(bytes.len(), second + 8 + (w2 * h2 * 4) as usize);
        // RGBA order: the BGRA test colour [10, 20, 30] comes back as [30, 20, 10].
        assert_eq!(&bytes[20..24], &[30, 20, 10, 255]);
    }

    #[test]
    fn sample_refuses_user_id_regions_and_bad_counts() {
        assert!(matches!(
            sample(&frame(1), &[NAME, USER_ID_OVERLAP], 64),
            Err(Error::InvalidRegion)
        ));
        assert!(matches!(
            sample(&frame(1), &[], 64),
            Err(Error::InvalidRegion)
        ));
        let too_many = vec![NAME; MAX_REGIONS + 1];
        assert!(matches!(
            sample(&frame(1), &too_many, 64),
            Err(Error::InvalidRegion)
        ));
    }

    #[test]
    fn read_returns_text_per_region_in_request_order() {
        let ocr = FakeOcr::returning(vec![OcrLine {
            text: "Sabercat Prowler".into(),
            bounds: Rect::new(0, 4, 300, 40),
        }]);
        let requests = vec![
            RegionRead {
                id: "name".into(),
                region: NAME,
            },
            RegionRead {
                id: "panel".into(),
                region: PANEL,
            },
        ];
        let results = read(&frame(7), &requests, &ocr).unwrap();
        assert_eq!(
            results.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(),
            ["name", "panel"]
        );
        assert_eq!(results[0].lines[0].text, "Sabercat Prowler");
        assert!(results[0].width > 700 && results[0].height > 50);
    }

    #[test]
    fn read_fails_before_ocr_if_any_region_touches_the_user_id() {
        let ocr = FakeOcr::returning(vec![]);
        let requests = vec![
            RegionRead {
                id: "name".into(),
                region: NAME,
            },
            RegionRead {
                id: "bad".into(),
                region: USER_ID_OVERLAP,
            },
        ];
        assert!(matches!(
            read(&frame(1), &requests, &ocr),
            Err(Error::InvalidRegion)
        ));
    }
}
