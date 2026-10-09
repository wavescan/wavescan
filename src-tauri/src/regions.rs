//! Reading parts of a captured frame for the scanner: small images for change detection
//! (`sample`), OCR text (`read`), and full-size crops for the webview's own OCR (`crops`,
//! Tesseract on Windows, ADR 0027). Every crop goes through
//! [`crate::safety::crop_outside_user_id`], so the User ID can never be sampled or read.
//!
//! The layout fractions come from the TypeScript side (scanner-core's `layout.ts`); this
//! module only crops, scales and reads. See `docs/architecture.md` §2.

use std::collections::VecDeque;
use std::sync::Arc;
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

/// How many recently sampled frames stay readable. `read_regions` takes its frame as soon as
/// it's called and holds it while OCR runs, so a frame only has to survive the moment between
/// the UI asking for a read and Rust picking the frame up. Meanwhile the UI may already be
/// sampling again (auto mode clicks the next echo while the last one is read), and each new
/// frame it samples would push out the last one. Four covers that gap with room to spare,
/// and costs at most three extra frames of memory (about 20 MB each at 2880×1800).
pub const PINNED_FRAMES: usize = 4;

/// The last few distinct frames `sample` looked at, so `read` can read the exact frame that
/// was judged stable (ADR 0021, ADR 0025). Sampling the same frame again doesn't use a slot.
#[derive(Default)]
pub struct PinnedFrames {
    frames: VecDeque<Arc<Frame>>,
}

impl PinnedFrames {
    /// Keeps `frame` readable, dropping the oldest frame once [`PINNED_FRAMES`] are kept.
    pub fn pin(&mut self, frame: Arc<Frame>) {
        if self
            .frames
            .back()
            .is_some_and(|last| last.seq() == frame.seq())
        {
            return;
        }
        self.frames.push_back(frame);
        while self.frames.len() > PINNED_FRAMES {
            self.frames.pop_front();
        }
    }

    /// The pinned frame with sequence number `seq`.
    ///
    /// # Errors
    ///
    /// [`Error::FrameExpired`] if it isn't one of the last [`PINNED_FRAMES`] sampled frames.
    pub fn get(&self, seq: u64) -> Result<Arc<Frame>, Error> {
        self.frames
            .iter()
            .find(|frame| frame.seq() == seq)
            .cloned()
            .ok_or(Error::FrameExpired)
    }
}

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

/// Full-size RGBA crops of `regions`, for OCR in the webview (Tesseract on Windows,
/// ADR 0027). Encoded as:
///
/// `[count: u32 LE]` then, per region, `[width: u32 LE][height: u32 LE][RGBA]`.
///
/// Crops are not scaled: the reader does its own enlarging. They only travel to the
/// webview's memory and are never written anywhere.
///
/// # Errors
///
/// [`Error::InvalidRegion`] if there are no regions, too many, or any region is invalid
/// or overlaps the User ID.
pub fn crops(frame: &Frame, regions: &[FracRect]) -> Result<Vec<u8>, Error> {
    check_count(regions.len())?;
    // Crop everything first, so a bad region fails before any bytes are built.
    let crops = regions
        .iter()
        .map(|region| safety::crop_outside_user_id(frame, *region))
        .collect::<Result<Vec<_>, _>>()?;
    let mut out = Vec::new();
    out.extend_from_slice(&u32::try_from(crops.len()).unwrap_or(0).to_le_bytes());
    for crop in &crops {
        out.extend_from_slice(&crop.width().to_le_bytes());
        out.extend_from_slice(&crop.height().to_le_bytes());
        out.extend_from_slice(&crop.to_rgba());
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
    fn pinned_frames_keep_the_last_few_distinct_frames() {
        let mut pinned = PinnedFrames::default();
        assert!(matches!(pinned.get(1), Err(Error::FrameExpired)));
        for seq in 1..=4 {
            pinned.pin(Arc::new(frame(seq)));
        }
        // Sampling the newest frame again doesn't push anything out.
        pinned.pin(Arc::new(frame(4)));
        assert_eq!(pinned.get(1).unwrap().seq(), 1);
        assert_eq!(pinned.get(4).unwrap().seq(), 4);

        pinned.pin(Arc::new(frame(5)));
        assert!(matches!(pinned.get(1), Err(Error::FrameExpired)));
        assert_eq!(pinned.get(2).unwrap().seq(), 2);
        assert_eq!(pinned.get(5).unwrap().seq(), 5);
        assert!(matches!(pinned.get(9), Err(Error::FrameExpired)));
    }

    #[test]
    fn a_frame_being_read_survives_being_unpinned() {
        let mut pinned = PinnedFrames::default();
        pinned.pin(Arc::new(frame(1)));
        let held = pinned.get(1).unwrap();
        for seq in 2..=10 {
            pinned.pin(Arc::new(frame(seq)));
        }
        assert!(matches!(pinned.get(1), Err(Error::FrameExpired)));
        // A read that already took the frame keeps it until it's done.
        assert_eq!(held.seq(), 1);
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
    fn crops_are_full_size_rgba_in_request_order() {
        let bytes = crops(&frame(3), &[NAME, PANEL]).unwrap();
        assert_eq!(read_u32(&bytes, 0), 2);
        let name = NAME.to_pixels(2880, 1800).unwrap();
        let (w1, h1) = (read_u32(&bytes, 4), read_u32(&bytes, 8));
        assert_eq!((w1, h1), (name.width, name.height));
        // RGBA order: the BGRA test colour [10, 20, 30] comes back as [30, 20, 10].
        assert_eq!(&bytes[12..16], &[30, 20, 10, 255]);
        let second = 12 + (w1 * h1 * 4) as usize;
        let (w2, h2) = (read_u32(&bytes, second), read_u32(&bytes, second + 4));
        assert!(w2 > w1 && h2 > h1, "the panel is bigger than the name");
        assert_eq!(bytes.len(), second + 8 + (w2 * h2 * 4) as usize);
    }

    #[test]
    fn crops_refuse_user_id_regions_and_bad_counts() {
        assert!(matches!(
            crops(&frame(1), &[NAME, USER_ID_OVERLAP]),
            Err(Error::InvalidRegion)
        ));
        assert!(matches!(crops(&frame(1), &[]), Err(Error::InvalidRegion)));
        assert!(matches!(
            crops(&frame(1), &vec![NAME; MAX_REGIONS + 1]),
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
