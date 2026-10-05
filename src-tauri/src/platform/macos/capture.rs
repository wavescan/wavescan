//! Captures the game window with `ScreenCaptureKit` (ADR 0005): one window only, cursor
//! hidden, BGRA frames at the window's full pixel resolution.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Instant;

use screencapturekit::cv::CVPixelBufferLockFlags;
use screencapturekit::prelude::*;

use super::window::shareable_content;
use crate::error::Error;
use crate::frame::Frame;
use crate::platform::strip_row_padding;
use crate::stats::FpsCounter;
use crate::traits::{FrameSource, GameWindow};

/// State shared between `ScreenCaptureKit`'s callback queue and the app.
#[derive(Default)]
struct Shared {
    latest: Mutex<Option<Arc<Frame>>>,
    seq: AtomicU64,
    fps: Mutex<FpsCounter>,
}

/// Receives frames on `ScreenCaptureKit`'s queue.
struct Handler {
    shared: Arc<Shared>,
}

impl SCStreamOutputTrait for Handler {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, of_type: SCStreamOutputType) {
        if !matches!(of_type, SCStreamOutputType::Screen) {
            return;
        }
        let Some(frame) = to_frame(&sample, &self.shared.seq) else {
            return; // e.g. an idle/blank sample with no pixel buffer
        };
        *self
            .shared
            .latest
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = Some(Arc::new(frame));
        self.shared
            .fps
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .record(Instant::now());
    }
}

/// Copies the sample's pixels into a [`Frame`].
fn to_frame(sample: &CMSampleBuffer, seq: &AtomicU64) -> Option<Frame> {
    let buffer = sample.pixel_buffer()?;
    let guard = buffer.lock(CVPixelBufferLockFlags::READ_ONLY).ok()?;
    let (width, height, stride) = (guard.width(), guard.height(), guard.bytes_per_row());
    // SAFETY: the pixel buffer is locked for reading for as long as `guard` lives, and the
    // slice isn't used after this block.
    let bytes = unsafe { guard.as_slice() }?;
    let pixels = strip_row_padding(bytes, width, height, stride)?;
    let next = seq.fetch_add(1, Ordering::Relaxed) + 1;
    Frame::from_bgra(
        u32::try_from(width).ok()?,
        u32::try_from(height).ok()?,
        next,
        pixels,
    )
    .ok()
}

/// `ScreenCaptureKit` frame source.
#[derive(Default)]
pub(super) struct SckCapture {
    shared: Arc<Shared>,
    stream: Option<SCStream>,
}

impl FrameSource for SckCapture {
    fn start(&mut self, window: &GameWindow, max_fps: u32) -> Result<(), Error> {
        self.stop();
        let content = shareable_content()?;
        let live = content
            .windows()
            .into_iter()
            .find(|w| u64::from(w.window_id()) == window.id.0)
            .ok_or(Error::WindowNotFound)?;
        let filter = SCContentFilter::create()
            .with_window(&live)
            .build()
            .map_err(capture_failed)?;

        // Capture at full pixel resolution: points × the display's scale (2 on Retina).
        let scale = f64::from(filter.point_pixel_scale()).max(1.0);
        let fps = i32::try_from(max_fps.clamp(1, 60)).unwrap_or(30);
        let config = SCStreamConfiguration::new()
            .with_width(to_pixels(window.client_rect.width, scale))
            .with_height(to_pixels(window.client_rect.height, scale))
            .with_pixel_format(PixelFormat::BGRA)
            .with_shows_cursor(false)
            .with_minimum_frame_interval(&CMTime::new(1, fps));

        let mut stream = SCStream::new(&filter, &config).map_err(capture_failed)?;
        stream
            .add_output_handler(
                Handler {
                    shared: Arc::clone(&self.shared),
                },
                SCStreamOutputType::Screen,
            )
            .map_err(capture_failed)?;
        stream.start_capture().map_err(capture_failed)?;
        self.stream = Some(stream);
        Ok(())
    }

    fn latest_frame(&self) -> Option<Arc<Frame>> {
        self.shared
            .latest
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn fps(&self) -> f64 {
        self.shared
            .fps
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .per_second(Instant::now())
    }

    fn stop(&mut self) {
        if let Some(stream) = self.stream.take() {
            // Ignore errors: the window may already be gone, which ends capture anyway.
            let _ = stream.stop_capture();
        }
        *self
            .shared
            .latest
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = None;
        self.shared
            .fps
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .reset();
    }
}

impl Drop for SckCapture {
    fn drop(&mut self) {
        self.stop();
    }
}

#[allow(clippy::needless_pass_by_value, reason = "used as a map_err adapter")]
fn capture_failed(error: SCError) -> Error {
    match error {
        SCError::PermissionDenied(_) => {
            Error::PermissionDenied(super::window::SCREEN_RECORDING_HELP.into())
        }
        other => Error::CaptureFailed(other.to_string()),
    }
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "window sizes in pixels are positive and far below u32::MAX"
)]
fn to_pixels(points: u32, scale: f64) -> u32 {
    (f64::from(points) * scale).round() as u32
}
