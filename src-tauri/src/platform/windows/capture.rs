//! Captures the game window with Windows.Graphics.Capture via the `windows-capture` crate
//! (ADR 0005). Window-only, cursor excluded, yellow border off where Windows allows it.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame as WgcFrame;
use windows_capture::graphics_capture_api::InternalCaptureControl;
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};
use windows_capture::window::Window;

use super::hwnd_from_id;
use crate::error::Error;
use crate::frame::Frame;
use crate::stats::FpsCounter;
use crate::traits::{FrameSource, GameWindow};

type HandlerError = Box<dyn std::error::Error + Send + Sync>;

/// State shared between the capture thread and the app.
#[derive(Default)]
struct Shared {
    /// The newest frame. Replaced on every arrival; older frames are dropped.
    latest: Mutex<Option<Arc<Frame>>>,
    seq: AtomicU64,
    fps: Mutex<FpsCounter>,
}

impl Shared {
    fn reset(&self) {
        *self.latest.lock().unwrap_or_else(PoisonError::into_inner) = None;
        self.fps
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .reset();
    }
}

/// Receives frames on the capture thread.
struct Handler {
    shared: Arc<Shared>,
    /// Reused between frames to avoid reallocating when the GPU buffer has row padding.
    scratch: Vec<u8>,
}

impl GraphicsCaptureApiHandler for Handler {
    type Flags = Arc<Shared>;
    type Error = HandlerError;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            shared: ctx.flags,
            scratch: Vec::new(),
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut WgcFrame,
        _control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        // Windowed mode includes the title bar; drop it so frames match the client area.
        let buffer = frame.buffer_without_title_bar()?;
        let (width, height) = (buffer.width(), buffer.height());
        let pixels = buffer.as_nopadding_buffer(&mut self.scratch).to_vec();
        let seq = self.shared.seq.fetch_add(1, Ordering::Relaxed) + 1;
        let frame = Frame::from_bgra(width, height, seq, pixels)?;

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
        Ok(())
    }
}

/// Windows.Graphics.Capture frame source.
#[derive(Default)]
pub(super) struct WgcCapture {
    shared: Arc<Shared>,
    control: Option<CaptureControl<Handler, HandlerError>>,
}

impl WgcCapture {
    fn settings(
        &self,
        window: &GameWindow,
        max_fps: u32,
        border: DrawBorderSettings,
    ) -> Settings<Arc<Shared>, Window> {
        let interval = Duration::from_millis(1000 / u64::from(max_fps.clamp(1, 60)));
        Settings::new(
            Window::from_raw_hwnd(hwnd_from_id(window.id).0),
            CursorCaptureSettings::WithoutCursor,
            border,
            SecondaryWindowSettings::Exclude,
            MinimumUpdateIntervalSettings::Custom(interval),
            DirtyRegionSettings::Default,
            ColorFormat::Bgra8,
            Arc::clone(&self.shared),
        )
    }
}

impl FrameSource for WgcCapture {
    fn start(&mut self, window: &GameWindow, max_fps: u32) -> Result<(), Error> {
        self.stop();
        // Hiding the yellow capture border needs Windows 11; fall back to the default
        // (border shown) on Windows 10 rather than failing.
        let control = Handler::start_free_threaded(self.settings(
            window,
            max_fps,
            DrawBorderSettings::WithoutBorder,
        ))
        .or_else(|_| {
            Handler::start_free_threaded(self.settings(
                window,
                max_fps,
                DrawBorderSettings::Default,
            ))
        })
        .map_err(|e| Error::CaptureFailed(e.to_string()))?;
        self.control = Some(control);
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
        if let Some(control) = self.control.take() {
            // Ignore errors here: the window may already be gone, which ends capture anyway.
            let _ = control.stop();
        }
        self.shared.reset();
    }
}

impl Drop for WgcCapture {
    fn drop(&mut self) {
        self.stop();
    }
}
