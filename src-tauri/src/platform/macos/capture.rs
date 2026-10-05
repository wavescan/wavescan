//! Captures the game window with `ScreenCaptureKit` (ADR 0005): one window only, cursor
//! hidden, BGRA frames at the window's full pixel resolution.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError, mpsc};
use std::time::Instant;

use block2::RcBlock;
use dispatch2::{DispatchQueue, DispatchRetained};
use objc2::rc::Retained;
use objc2::runtime::{NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{AnyThread, DefinedClass, define_class, msg_send};
use objc2_core_media::{CMSampleBuffer, CMTime};
use objc2_core_video::{
    CVPixelBufferGetBaseAddress, CVPixelBufferGetBytesPerRow, CVPixelBufferGetHeight,
    CVPixelBufferGetWidth, CVPixelBufferLockBaseAddress, CVPixelBufferLockFlags,
    CVPixelBufferUnlockBaseAddress, kCVPixelFormatType_32BGRA, kCVReturnSuccess,
};
use objc2_foundation::NSError;
use objc2_screen_capture_kit::{
    SCContentFilter, SCStream, SCStreamConfiguration, SCStreamOutput, SCStreamOutputType,
};

use super::sck::{TIMEOUT, from_ns_error, shareable_content, window_infos};
use super::window::point_pixel_scale;
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

impl Shared {
    fn store(&self, frame: Frame) {
        *self.latest.lock().unwrap_or_else(PoisonError::into_inner) = Some(Arc::new(frame));
        self.fps
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .record(Instant::now());
    }
}

define_class!(
    /// Receives frames from `ScreenCaptureKit` on our dispatch queue.
    #[unsafe(super(NSObject))]
    #[name = "WavescanStreamOutput"]
    #[ivars = Arc<Shared>]
    struct StreamOutput;

    unsafe impl NSObjectProtocol for StreamOutput {}

    unsafe impl SCStreamOutput for StreamOutput {
        #[unsafe(method(stream:didOutputSampleBuffer:ofType:))]
        fn stream_did_output(
            &self,
            _stream: &SCStream,
            sample: &CMSampleBuffer,
            kind: SCStreamOutputType,
        ) {
            if kind != SCStreamOutputType::Screen {
                return;
            }
            // Idle samples (nothing changed) carry no image; skip them.
            if let Some(frame) = to_frame(sample, &self.ivars().seq) {
                self.ivars().store(frame);
            }
        }
    }
);

impl StreamOutput {
    fn new(shared: Arc<Shared>) -> Retained<Self> {
        let this = Self::alloc().set_ivars(shared);
        // SAFETY: calling NSObject's designated initialiser on a freshly allocated object.
        unsafe { msg_send![super(this), init] }
    }
}

/// Copies a sample's pixels into a [`Frame`].
fn to_frame(sample: &CMSampleBuffer, seq: &AtomicU64) -> Option<Frame> {
    // SAFETY: plain accessor on a valid sample buffer.
    let image = unsafe { sample.image_buffer() }?;
    let flags = CVPixelBufferLockFlags::ReadOnly;
    // SAFETY: `image` is a valid pixel buffer; we unlock it below on every path.
    if unsafe { CVPixelBufferLockBaseAddress(&image, flags) } != kCVReturnSuccess {
        return None;
    }
    let width = CVPixelBufferGetWidth(&image);
    let height = CVPixelBufferGetHeight(&image);
    let stride = CVPixelBufferGetBytesPerRow(&image);
    let base = CVPixelBufferGetBaseAddress(&image)
        .cast::<u8>()
        .cast_const();
    let pixels = if base.is_null() {
        None
    } else {
        // SAFETY: the buffer is locked, `base` points to `stride * height` readable bytes,
        // and the slice isn't used after unlocking.
        let bytes = unsafe { std::slice::from_raw_parts(base, stride.saturating_mul(height)) };
        strip_row_padding(bytes, width, height, stride)
    };
    // SAFETY: balances the successful lock above.
    unsafe { CVPixelBufferUnlockBaseAddress(&image, flags) };

    let next = seq.fetch_add(1, Ordering::Relaxed) + 1;
    Frame::from_bgra(
        u32::try_from(width).ok()?,
        u32::try_from(height).ok()?,
        next,
        pixels?,
    )
    .ok()
}

/// A running stream and the objects it depends on.
struct Session {
    stream: Retained<SCStream>,
    _output: Retained<StreamOutput>,
    _queue: DispatchRetained<DispatchQueue>,
}

// SAFETY: `SCStream` is thread-safe (Apple documents starting/stopping from any thread),
// and we only call start/stop on it; the output and queue are only kept alive here.
unsafe impl Send for Session {}

/// `ScreenCaptureKit` frame source.
#[derive(Default)]
pub(super) struct SckCapture {
    shared: Arc<Shared>,
    session: Option<Session>,
}

impl FrameSource for SckCapture {
    fn start(&mut self, window: &GameWindow, max_fps: u32) -> Result<(), Error> {
        self.stop();
        let content = shareable_content()?;
        let live = window_infos(&content)
            .into_iter()
            .find(|(info, _)| u64::from(info.id) == window.id.0)
            .map(|(_, w)| w)
            .ok_or(Error::WindowNotFound)?;

        // SAFETY: creating a filter for a window ScreenCaptureKit just returned.
        let filter = unsafe {
            SCContentFilter::initWithDesktopIndependentWindow(SCContentFilter::alloc(), &live)
        };
        let scale = point_pixel_scale(&live).max(1.0);
        let fps = i32::try_from(max_fps.clamp(1, 60)).unwrap_or(30);

        // SAFETY: setting documented configuration properties on a new configuration.
        let config = unsafe {
            let config = SCStreamConfiguration::new();
            config.setWidth(to_pixels(window.client_rect.width, scale));
            config.setHeight(to_pixels(window.client_rect.height, scale));
            config.setPixelFormat(kCVPixelFormatType_32BGRA);
            config.setShowsCursor(false);
            config.setMinimumFrameInterval(CMTime::new(1, fps));
            config.setQueueDepth(3);
            config
        };

        // SAFETY: filter and configuration are valid; no delegate is needed.
        let stream = unsafe {
            SCStream::initWithFilter_configuration_delegate(
                SCStream::alloc(),
                &filter,
                &config,
                None,
            )
        };
        let output = StreamOutput::new(Arc::clone(&self.shared));
        let queue = DispatchQueue::new("app.wavescan.capture", None);
        // SAFETY: `output` and `queue` are kept alive in `Session` for the stream's lifetime.
        unsafe {
            stream.addStreamOutput_type_sampleHandlerQueue_error(
                ProtocolObject::from_ref(&*output),
                SCStreamOutputType::Screen,
                Some(&queue),
            )
        }
        .map_err(|e| from_ns_error(Some(e)))?;

        start_and_wait(&stream)?;
        self.session = Some(Session {
            stream,
            _output: output,
            _queue: queue,
        });
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
        if let Some(session) = self.session.take() {
            // SAFETY: stopping a stream we started; no completion handler needed.
            unsafe { session.stream.stopCaptureWithCompletionHandler(None) };
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

/// Starts the stream and waits for `ScreenCaptureKit` to confirm (or refuse).
fn start_and_wait(stream: &SCStream) -> Result<(), Error> {
    let (tx, rx) = mpsc::channel();
    let block = RcBlock::new(move |error: *mut NSError| {
        // SAFETY: ScreenCaptureKit passes a valid error or null.
        let _ = tx.send(unsafe { Retained::retain(error) });
    });
    // SAFETY: the block is copied by ScreenCaptureKit and lives until it has run.
    unsafe { stream.startCaptureWithCompletionHandler(Some(&block)) };
    match rx.recv_timeout(TIMEOUT) {
        Ok(None) => Ok(()),
        Ok(error) => Err(from_ns_error(error)),
        Err(_) => Err(Error::CaptureFailed("timed out starting capture".into())),
    }
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "window sizes in pixels are positive and far below usize::MAX"
)]
fn to_pixels(points: u32, scale: f64) -> usize {
    (f64::from(points) * scale).round() as usize
}
