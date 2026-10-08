//! Captures the game window with Windows.Graphics.Capture via the `windows-capture` crate
//! (ADR 0005). Window-only, cursor excluded, yellow border off where Windows allows it.
//! Each frame is cropped to the game area, so a windowed game's title bar and borders never
//! reach the rest of the app.
//!
//! Several capture options (border, cursor, secondary windows, frame-rate cap) only exist on
//! newer Windows builds, and `windows-capture` refuses to start if we ask for one the OS lacks.
//! So we ask Windows which ones it has and leave the rest at the system default.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use windows_capture::capture::{CaptureControl, Context, GraphicsCaptureApiHandler};
use windows_capture::frame::Frame as WgcFrame;
use windows_capture::graphics_capture_api::{GraphicsCaptureApi, InternalCaptureControl};
use windows_capture::settings::{
    ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
    MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
};
use windows_capture::window::Window;

use super::hwnd_from_id;
use super::window::client_area_in_frame;
use crate::error::Error;
use crate::frame::Frame;
use crate::stats::FpsCounter;
use crate::traits::{FrameSource, GameWindow, WindowId};

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

/// What the capture thread is started with: where to put frames, and which window they
/// come from (to find its game area in each frame).
#[derive(Clone)]
struct Flags {
    shared: Arc<Shared>,
    window: WindowId,
}

/// Receives frames on the capture thread.
struct Handler {
    shared: Arc<Shared>,
    window: WindowId,
    /// Reused between frames to avoid reallocating when the GPU buffer has row padding.
    scratch: Vec<u8>,
}

impl GraphicsCaptureApiHandler for Handler {
    type Flags = Flags;
    type Error = HandlerError;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        Ok(Self {
            shared: ctx.flags.shared,
            window: ctx.flags.window,
            scratch: Vec::new(),
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut WgcFrame,
        _control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        // A windowed capture includes the title bar and borders; keep only the game area.
        // (Not `buffer_without_title_bar`: it crops nothing when display scaling is above
        // 100%, see `helpers::client_area_in_frame`.) If the window is closing and has no
        // game area, the whole frame is kept; the window is about to go away anyway.
        let (frame_width, frame_height) = (frame.width(), frame.height());
        let buffer =
            match client_area_in_frame(hwnd_from_id(self.window), frame_width, frame_height) {
                Some(area) if (area.width, area.height) != (frame_width, frame_height) => {
                    let left = area.x.unsigned_abs();
                    let top = area.y.unsigned_abs();
                    frame.buffer_crop(left, top, left + area.width, top + area.height)?
                }
                _ => frame.buffer()?,
            };
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

/// Which optional capture options this Windows build supports.
///
/// Each one arrived in a different Windows release (e.g. hiding the border needs Windows 11,
/// excluding secondary windows needs Windows 11 24H2).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(
    clippy::struct_excessive_bools,
    reason = "one flag per independent OS feature"
)]
struct Support {
    cursor: bool,
    border: bool,
    secondary_windows: bool,
    min_interval: bool,
}

impl Support {
    /// Asks Windows which options exist. A failed query counts as "not supported", which only
    /// means we keep the system default for that option.
    fn detect() -> Self {
        Self {
            cursor: GraphicsCaptureApi::is_cursor_settings_supported().unwrap_or(false),
            border: GraphicsCaptureApi::is_border_settings_supported().unwrap_or(false),
            secondary_windows: GraphicsCaptureApi::is_secondary_windows_supported()
                .unwrap_or(false),
            min_interval: GraphicsCaptureApi::is_minimum_update_interval_supported()
                .unwrap_or(false),
        }
    }
}

/// The capture options we ask for, given what the OS supports.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Options {
    cursor: CursorCaptureSettings,
    border: DrawBorderSettings,
    secondary_windows: SecondaryWindowSettings,
    interval: MinimumUpdateIntervalSettings,
}

/// Picks our preferred value for every supported option and the system default otherwise.
/// The defaults are safe: secondary windows are already excluded by default, and without a
/// frame-rate cap frames simply arrive more often.
fn choose_options(support: Support, max_fps: u32) -> Options {
    let interval = Duration::from_millis(1000 / u64::from(max_fps.clamp(1, 60)));
    Options {
        cursor: if support.cursor {
            CursorCaptureSettings::WithoutCursor
        } else {
            CursorCaptureSettings::Default
        },
        border: if support.border {
            DrawBorderSettings::WithoutBorder
        } else {
            DrawBorderSettings::Default
        },
        secondary_windows: if support.secondary_windows {
            SecondaryWindowSettings::Exclude
        } else {
            SecondaryWindowSettings::Default
        },
        interval: if support.min_interval {
            MinimumUpdateIntervalSettings::Custom(interval)
        } else {
            MinimumUpdateIntervalSettings::Default
        },
    }
}

impl WgcCapture {
    fn settings(&self, window: &GameWindow, options: Options) -> Settings<Flags, Window> {
        Settings::new(
            Window::from_raw_hwnd(hwnd_from_id(window.id).0),
            options.cursor,
            options.border,
            options.secondary_windows,
            options.interval,
            DirtyRegionSettings::Default,
            ColorFormat::Bgra8,
            Flags {
                shared: Arc::clone(&self.shared),
                window: window.id,
            },
        )
    }
}

impl FrameSource for WgcCapture {
    fn start(&mut self, window: &GameWindow, max_fps: u32) -> Result<(), Error> {
        self.stop();
        let options = choose_options(Support::detect(), max_fps);
        let control = Handler::start_free_threaded(self.settings(window, options))
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

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: Support = Support {
        cursor: true,
        border: true,
        secondary_windows: true,
        min_interval: true,
    };
    const NONE: Support = Support {
        cursor: false,
        border: false,
        secondary_windows: false,
        min_interval: false,
    };

    #[test]
    fn newest_windows_gets_every_preferred_option() {
        let options = choose_options(ALL, 20);
        assert_eq!(options.cursor, CursorCaptureSettings::WithoutCursor);
        assert_eq!(options.border, DrawBorderSettings::WithoutBorder);
        assert_eq!(options.secondary_windows, SecondaryWindowSettings::Exclude);
        assert_eq!(
            options.interval,
            MinimumUpdateIntervalSettings::Custom(Duration::from_millis(50))
        );
    }

    #[test]
    fn unsupported_options_fall_back_to_system_defaults() {
        let options = choose_options(NONE, 20);
        assert_eq!(options.cursor, CursorCaptureSettings::Default);
        assert_eq!(options.border, DrawBorderSettings::Default);
        assert_eq!(options.secondary_windows, SecondaryWindowSettings::Default);
        assert_eq!(options.interval, MinimumUpdateIntervalSettings::Default);
    }

    // Regression: Windows 11 before 24H2 has border hiding but not secondary-window control.
    // We used to request `Exclude` anyway, so capture never started on those machines.
    #[test]
    fn windows_11_before_24h2_does_not_request_secondary_window_control() {
        let support = Support {
            secondary_windows: false,
            ..ALL
        };
        let options = choose_options(support, 20);
        assert_eq!(options.secondary_windows, SecondaryWindowSettings::Default);
        assert_eq!(options.border, DrawBorderSettings::WithoutBorder);
    }

    #[test]
    fn frame_rate_cap_is_clamped() {
        assert_eq!(
            choose_options(ALL, 0).interval,
            MinimumUpdateIntervalSettings::Custom(Duration::from_millis(1000))
        );
        assert_eq!(
            choose_options(ALL, 500).interval,
            MinimumUpdateIntervalSettings::Custom(Duration::from_millis(16))
        );
    }

    #[test]
    fn detecting_support_does_not_fail() {
        // Runs on the Windows CI runner; any answer is fine as long as it doesn't panic.
        let _ = Support::detect();
    }
}
