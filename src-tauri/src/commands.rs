//! IPC commands the UI can call. Keep these thin: each `#[tauri::command]` forwards to an
//! [`AppState`] method, which holds the logic and is unit-tested with fakes. Every command
//! must also be listed in `build.rs` and granted in `capabilities/default.json`, or the UI
//! can't call it.

// Tauri hands commands their `State` by value; that's the framework's calling convention.
#![allow(
    clippy::needless_pass_by_value,
    reason = "Tauri commands receive State<'_, T> by value"
)]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Instant;

use serde::Serialize;

use crate::error::Error;
use crate::frame::Frame;
use crate::geometry::{FracPoint, FracRect};
use crate::hotkey;
use crate::platform::Platform;
use crate::regions::{self, RegionRead, RegionText};
use crate::safety::{self, AbortReason, AutoMode, AutoModeState};
use crate::traits::{
    FrameSource, GameWindow, InputDriver, OcrEngine, OcrLine, WindowCandidate, WindowFinder,
};

/// Basic facts about the running app. Mirrored in `src/ipc/types.ts` as `AppInfo`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppInfo {
    /// Product name.
    pub name: &'static str,
    /// App version from `Cargo.toml`.
    pub version: &'static str,
    /// Operating system this build targets: `windows`, `macos` or `linux`.
    pub platform: &'static str,
    /// Short commit id for CI builds (`WAVESCAN_BUILD` at compile time); `None` locally.
    pub build: Option<&'static str>,
    /// True if Wavescan runs as administrator (Windows only; `None` elsewhere or if
    /// unknown). Explains failed click tests: see [`crate::platform::is_elevated`].
    pub elevated: Option<bool>,
}

/// Size and sequence number of a captured frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct FrameInfo {
    /// Sequence number within the capture session.
    pub seq: u64,
    /// Width in pixels.
    pub width: u32,
    /// Height in pixels.
    pub height: u32,
}

/// Whether capture is running and how well. Mirrored as `CaptureStatus` in TS.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CaptureStatus {
    /// True between `start_capture` and `stop_capture`.
    pub running: bool,
    /// Frames received in the last second.
    pub fps: f64,
    /// The latest frame, if any has arrived.
    pub frame: Option<FrameInfo>,
}

/// Result of reading one region of the latest frame. Mirrored as `OcrResult` in TS.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OcrResult {
    /// Lines of text, top to bottom, with positions inside the cropped region.
    pub lines: Vec<OcrLine>,
    /// Time spent in the OS OCR engine, in milliseconds.
    pub elapsed_ms: f64,
    /// Cropped region width in pixels.
    pub width: u32,
    /// Cropped region height in pixels.
    pub height: u32,
}

/// Auto-mode state for the UI. Mirrored as `AutoModeStatus` in TS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct AutoModeStatus {
    /// Disarmed, armed, or aborted (with the reason).
    pub state: AutoModeState,
    /// Actions sent since arming.
    pub actions_used: u32,
    /// Whether F8 is claimed as the stop key right now. False while disarmed, and also when
    /// armed if another app already holds F8 (then only moving the mouse stops auto mode).
    pub stop_key_active: bool,
}

/// Largest preview the UI may request, in pixels wide. Keeps IPC payloads small.
const MAX_PREVIEW_WIDTH: u32 = 1280;

/// The app's OS adapters and capture state, shared by all commands.
pub struct AppState {
    finder: Box<dyn WindowFinder + Send + Sync>,
    capture: Mutex<Box<dyn FrameSource + Send>>,
    ocr: Arc<dyn OcrEngine + Send + Sync>,
    input: Box<dyn InputDriver + Send + Sync>,
    /// Starts disarmed on every launch; never persisted (ADR 0006).
    auto: Mutex<AutoMode>,
    capturing: AtomicBool,
    /// The frame the last `sample_regions` call looked at. `read_regions` reads this exact
    /// frame, so text always comes from the frame that was judged stable, even if the
    /// game has moved on since.
    pinned: Mutex<Option<Arc<Frame>>>,
    /// Whether the F8 stop key is claimed (set by `hotkey::sync`).
    stop_key_active: AtomicBool,
}

impl AppState {
    /// Wraps the platform adapters.
    #[must_use]
    pub fn new(platform: Platform) -> Self {
        Self {
            finder: platform.finder,
            capture: Mutex::new(platform.capture),
            ocr: Arc::from(platform.ocr),
            input: platform.input,
            auto: Mutex::new(AutoMode::default()),
            capturing: AtomicBool::new(false),
            pinned: Mutex::new(None),
            stop_key_active: AtomicBool::new(false),
        }
    }

    /// See [`find_game_window`].
    ///
    /// # Errors
    ///
    /// [`Error::WindowNotFound`] if the game isn't running.
    pub fn find_game_window(&self) -> Result<GameWindow, Error> {
        self.finder.find_game_window()
    }

    /// See [`window_candidates`].
    ///
    /// # Errors
    ///
    /// A platform error if the OS query fails.
    pub fn window_candidates(&self) -> Result<Vec<WindowCandidate>, Error> {
        self.finder.candidates()
    }

    /// See [`start_capture`].
    ///
    /// # Errors
    ///
    /// [`Error::WindowNotFound`], [`Error::WindowMinimized`], or a capture error.
    pub fn start_capture(&self, max_fps: u32) -> Result<GameWindow, Error> {
        let window = self.finder.find_game_window()?;
        if window.minimized {
            return Err(Error::WindowMinimized);
        }
        self.lock_capture().start(&window, max_fps.clamp(1, 60))?;
        self.capturing.store(true, Ordering::SeqCst);
        Ok(window)
    }

    /// See [`stop_capture`].
    pub fn stop_capture(&self) {
        self.lock_capture().stop();
        self.capturing.store(false, Ordering::SeqCst);
    }

    /// See [`capture_status`].
    pub fn capture_status(&self) -> CaptureStatus {
        let capture = self.lock_capture();
        CaptureStatus {
            running: self.capturing.load(Ordering::SeqCst),
            fps: capture.fps(),
            frame: capture.latest_frame().map(|f| FrameInfo {
                seq: f.seq(),
                width: f.width(),
                height: f.height(),
            }),
        }
    }

    /// See [`capture_preview`]. Returns `[width u32 LE][height u32 LE][RGBA bytes]`.
    ///
    /// # Errors
    ///
    /// [`Error::CaptureFailed`] if no frame has arrived yet.
    pub fn capture_preview(&self, max_width: u32) -> Result<Vec<u8>, Error> {
        let frame = self.latest_frame()?;
        let (width, height, rgba) = frame.downscaled_rgba(max_width.clamp(64, MAX_PREVIEW_WIDTH));
        // Black out the User ID before the image leaves Rust (ADR 0013). The fill colour is
        // opaque black in both BGRA and RGBA, so masking the RGBA buffer is correct.
        let mut preview = Frame::from_bgra(width, height, frame.seq(), rgba)?;
        safety::mask_user_id(&mut preview)?;

        let mut out = Vec::with_capacity(8 + preview.pixels().len());
        out.extend_from_slice(&width.to_le_bytes());
        out.extend_from_slice(&height.to_le_bytes());
        out.extend_from_slice(preview.pixels());
        Ok(out)
    }

    /// See [`ocr_region`]. Blocking: call from a worker thread.
    ///
    /// # Errors
    ///
    /// [`Error::CaptureFailed`] if no frame has arrived, [`Error::InvalidRegion`] if the
    /// region is invalid or overlaps the User ID, or an OCR error.
    pub fn ocr_region(&self, region: FracRect) -> Result<OcrResult, Error> {
        let (crop, ocr) = self.prepare_ocr(region)?;
        run_ocr(&crop, ocr.as_ref())
    }

    /// Crops `region` (refusing the User ID area) and hands back the OCR engine, so the
    /// slow recognition step can run on another thread.
    fn prepare_ocr(
        &self,
        region: FracRect,
    ) -> Result<(Frame, Arc<dyn OcrEngine + Send + Sync>), Error> {
        let frame = self.latest_frame()?;
        let crop = safety::crop_outside_user_id(&frame, region)?;
        Ok((crop, Arc::clone(&self.ocr)))
    }

    /// See [`auto_mode_status`].
    pub fn auto_mode_status(&self) -> AutoModeStatus {
        let auto = self.lock_auto();
        AutoModeStatus {
            state: auto.state(),
            actions_used: auto.actions_used(),
            stop_key_active: self.stop_key_active.load(Ordering::SeqCst),
        }
    }

    /// Whether auto mode is armed (not disarmed, not aborted).
    #[must_use]
    pub fn is_armed(&self) -> bool {
        self.lock_auto().state() == AutoModeState::Armed
    }

    /// Records whether the F8 stop key is claimed. Only `hotkey::sync` calls this.
    pub fn set_stop_key_active(&self, active: bool) {
        self.stop_key_active.store(active, Ordering::SeqCst);
    }

    /// The F8 stop key was pressed: stops auto mode (it has to be re-armed). Does nothing if
    /// it isn't armed.
    pub fn stop_from_hotkey(&self) {
        self.lock_auto().abort(AbortReason::Hotkey);
    }

    /// See [`arm_auto_mode`].
    ///
    /// # Errors
    ///
    /// [`Error::ConfirmationMismatch`] if the phrase is wrong.
    pub fn arm_auto_mode(&self, confirmation: &str) -> Result<AutoModeStatus, Error> {
        self.lock_auto().arm(confirmation)?;
        Ok(self.auto_mode_status())
    }

    /// See [`disarm_auto_mode`].
    pub fn disarm_auto_mode(&self) -> AutoModeStatus {
        self.lock_auto().disarm();
        self.auto_mode_status()
    }

    /// See [`auto_focus_game`].
    ///
    /// # Errors
    ///
    /// Any [`AutoMode::focus_game`] error.
    pub fn auto_focus_game(&self) -> Result<AutoModeStatus, Error> {
        self.lock_auto()
            .focus_game(self.finder.as_ref(), self.input.as_ref())?;
        Ok(self.auto_mode_status())
    }

    /// See [`auto_click`].
    ///
    /// # Errors
    ///
    /// Any [`AutoMode::click`] error.
    pub fn auto_click(&self, target: FracPoint) -> Result<AutoModeStatus, Error> {
        self.lock_auto()
            .click(self.finder.as_ref(), self.input.as_ref(), target)?;
        Ok(self.auto_mode_status())
    }

    /// See [`auto_scroll`].
    ///
    /// # Errors
    ///
    /// Any [`AutoMode::scroll`] error.
    pub fn auto_scroll(&self, target: FracPoint, ticks: i32) -> Result<AutoModeStatus, Error> {
        self.lock_auto()
            .scroll(self.finder.as_ref(), self.input.as_ref(), target, ticks)?;
        Ok(self.auto_mode_status())
    }

    /// See [`sample_regions`]. Pins the sampled frame for [`AppState::read_regions`].
    ///
    /// # Errors
    ///
    /// [`Error::CaptureFailed`] if no frame has arrived, or [`Error::InvalidRegion`].
    pub fn sample_regions(&self, regions: &[FracRect], max_width: u32) -> Result<Vec<u8>, Error> {
        let frame = self.latest_frame()?;
        let bytes = regions::sample(&frame, regions, max_width)?;
        *self.pinned.lock().unwrap_or_else(PoisonError::into_inner) = Some(frame);
        Ok(bytes)
    }

    /// The pinned frame, if its sequence number is `seq`.
    fn pinned_frame(&self, seq: u64) -> Result<Arc<Frame>, Error> {
        self.pinned
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
            .filter(|frame| frame.seq() == seq)
            .ok_or(Error::FrameExpired)
    }

    /// See [`read_regions`]. Blocking: call from a worker thread.
    ///
    /// # Errors
    ///
    /// [`Error::FrameExpired`] if `seq` isn't the pinned frame, [`Error::InvalidRegion`],
    /// or an OCR error.
    pub fn read_regions(&self, seq: u64, regions: &[RegionRead]) -> Result<Vec<RegionText>, Error> {
        let frame = self.pinned_frame(seq)?;
        regions::read(&frame, regions, self.ocr.as_ref())
    }

    fn lock_auto(&self) -> std::sync::MutexGuard<'_, AutoMode> {
        self.auto.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn latest_frame(&self) -> Result<Arc<Frame>, Error> {
        self.lock_capture()
            .latest_frame()
            .ok_or_else(|| Error::CaptureFailed("no frame has been captured yet".into()))
    }

    fn lock_capture(&self) -> std::sync::MutexGuard<'_, Box<dyn FrameSource + Send>> {
        self.capture.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Returns the app's name, version and platform. Used by the home and diagnostics screens.
#[tauri::command]
#[must_use]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: "Wavescan",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        build: option_env!("WAVESCAN_BUILD"),
        elevated: crate::platform::is_elevated(),
    }
}

/// Finds the game window and reports its size, scale and focus.
///
/// # Errors
///
/// [`Error::WindowNotFound`] if the game isn't running.
#[tauri::command]
pub fn find_game_window(state: tauri::State<'_, AppState>) -> Result<GameWindow, Error> {
    state.find_game_window()
}

/// Lists windows whose title mentions Wuthering Waves (diagnostics only).
///
/// # Errors
///
/// A platform error if the OS query fails.
#[tauri::command]
pub fn window_candidates(state: tauri::State<'_, AppState>) -> Result<Vec<WindowCandidate>, Error> {
    state.window_candidates()
}

/// Starts capturing the game window at up to `max_fps` (clamped to 1–60).
///
/// # Errors
///
/// [`Error::WindowNotFound`], [`Error::WindowMinimized`], [`Error::PermissionDenied`] or
/// [`Error::CaptureFailed`].
#[tauri::command]
pub fn start_capture(state: tauri::State<'_, AppState>, max_fps: u32) -> Result<GameWindow, Error> {
    state.start_capture(max_fps)
}

/// Stops capturing. Safe to call when not capturing.
#[tauri::command]
pub fn stop_capture(state: tauri::State<'_, AppState>) {
    state.stop_capture();
}

/// Reports whether capture is running, its frame rate and the latest frame size.
#[tauri::command]
#[must_use]
pub fn capture_status(state: tauri::State<'_, AppState>) -> CaptureStatus {
    state.capture_status()
}

/// A small, User-ID-masked preview of the latest frame for the Diagnostics screen.
///
/// # Errors
///
/// [`Error::CaptureFailed`] if no frame has arrived yet.
#[tauri::command]
pub fn capture_preview(
    state: tauri::State<'_, AppState>,
    max_width: u32,
) -> Result<tauri::ipc::Response, Error> {
    state
        .capture_preview(max_width)
        .map(tauri::ipc::Response::new)
}

/// Reads text from `region` (fractions of the frame) of the latest frame.
///
/// # Errors
///
/// See [`AppState::ocr_region`].
#[tauri::command]
pub async fn ocr_region(
    state: tauri::State<'_, AppState>,
    region: FracRect,
) -> Result<OcrResult, Error> {
    let (crop, ocr) = state.prepare_ocr(region)?;
    // OCR blocks for tens of milliseconds; run it on a blocking-work thread.
    tauri::async_runtime::spawn_blocking(move || run_ocr(&crop, ocr.as_ref()))
        .await
        .map_err(|e| Error::OcrFailed(format!("OCR task failed: {e}")))?
}

/// Current auto-mode state.
#[tauri::command]
#[must_use]
pub fn auto_mode_status(state: tauri::State<'_, AppState>) -> AutoModeStatus {
    state.auto_mode_status()
}

/// Arms auto mode if `confirmation` is the exact phrase shown with the Fair Play warning,
/// and claims F8 as the stop key while it's armed. Async so it runs off the main thread,
/// which claiming the key waits for (see `hotkey`).
///
/// # Errors
///
/// [`Error::ConfirmationMismatch`] if the phrase is wrong.
#[tauri::command]
pub async fn arm_auto_mode(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    confirmation: String,
) -> Result<AutoModeStatus, Error> {
    state.arm_auto_mode(&confirmation)?;
    hotkey::sync(&app);
    Ok(state.auto_mode_status())
}

/// Turns auto mode off and gives F8 back. Async for the same reason as [`arm_auto_mode`].
///
/// # Errors
///
/// Never; returns `Result` because async commands that borrow state must.
#[tauri::command]
pub async fn disarm_auto_mode(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<AutoModeStatus, Error> {
    state.disarm_auto_mode();
    hotkey::sync(&app);
    Ok(state.auto_mode_status())
}

/// After an action, gives F8 back if that action stopped auto mode.
fn release_stop_key_if_stopped(app: &tauri::AppHandle, state: &AppState) {
    if !state.is_armed() {
        hotkey::sync_later(app.clone());
    }
}

/// Brings the game to the front (auto mode must be armed).
///
/// # Errors
///
/// See [`AppState::auto_focus_game`].
#[tauri::command]
pub fn auto_focus_game(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<AutoModeStatus, Error> {
    let result = state.auto_focus_game();
    release_stop_key_if_stopped(&app, &state);
    result
}

/// Clicks at `target` (fractions of the game window) through every safety check.
///
/// # Errors
///
/// See [`AppState::auto_click`].
#[tauri::command]
pub fn auto_click(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    target: FracPoint,
) -> Result<AutoModeStatus, Error> {
    let result = state.auto_click(target);
    release_stop_key_if_stopped(&app, &state);
    result
}

/// Scrolls the mouse wheel `ticks` notches at `target` (fractions of the game window;
/// negative scrolls down) through every safety check, plus a limit of
/// `safety::MAX_SCROLL_TICKS` notches per call.
///
/// # Errors
///
/// See [`AppState::auto_scroll`].
#[tauri::command]
pub fn auto_scroll(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    target: FracPoint,
    ticks: i32,
) -> Result<AutoModeStatus, Error> {
    let result = state.auto_scroll(target, ticks);
    release_stop_key_if_stopped(&app, &state);
    result
}

/// Small images of `regions` from the latest frame, for change detection; pins that frame.
/// Returns binary data (see [`regions::sample`] for the layout).
///
/// # Errors
///
/// See [`AppState::sample_regions`].
#[tauri::command]
pub fn sample_regions(
    state: tauri::State<'_, AppState>,
    regions: Vec<FracRect>,
    max_width: u32,
) -> Result<tauri::ipc::Response, Error> {
    state
        .sample_regions(&regions, max_width)
        .map(tauri::ipc::Response::new)
}

/// OCRs `regions` of the frame pinned by the last `sample_regions` call (sequence `seq`).
///
/// # Errors
///
/// See [`AppState::read_regions`].
#[tauri::command]
pub async fn read_regions(
    state: tauri::State<'_, AppState>,
    seq: u64,
    regions: Vec<RegionRead>,
) -> Result<Vec<RegionText>, Error> {
    let frame = state.pinned_frame(seq)?;
    let ocr = Arc::clone(&state.ocr);
    tauri::async_runtime::spawn_blocking(move || regions::read(&frame, &regions, ocr.as_ref()))
        .await
        .map_err(|e| Error::OcrFailed(format!("OCR task failed: {e}")))?
}

/// Recognises text in `crop` and times it.
fn run_ocr(crop: &Frame, ocr: &(dyn OcrEngine + Send + Sync)) -> Result<OcrResult, Error> {
    let started = Instant::now();
    let lines = ocr.recognize(crop)?;
    Ok(OcrResult {
        lines,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        width: crop.width(),
        height: crop.height(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::Rect;
    use crate::safety::CONFIRMATION_PHRASE;
    use crate::testing::{FakeFrames, FakeInput, FakeOcr, FakeWindowFinder};

    fn state_with(frames: Vec<Frame>, lines: Vec<OcrLine>) -> AppState {
        AppState::new(Platform {
            finder: Box::new(FakeWindowFinder::focused()),
            capture: Box::new(FakeFrames::new(frames)),
            ocr: Box::new(FakeOcr::returning(lines)),
            input: Box::new(FakeInput::default()),
        })
    }

    fn white_frame() -> Frame {
        Frame::solid(2880, 1800, 1, [255, 255, 255, 255]).unwrap()
    }

    #[test]
    fn app_info_reports_cargo_version_and_os() {
        let info = app_info();
        assert_eq!(info.name, "Wavescan");
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(info.platform, std::env::consts::OS);
        assert_eq!(info.build, option_env!("WAVESCAN_BUILD"));
        assert_eq!(info.elevated.is_some(), cfg!(windows));
    }

    #[test]
    fn capture_status_follows_start_and_stop() {
        let state = state_with(vec![white_frame()], vec![]);
        assert!(!state.capture_status().running);
        state.start_capture(30).unwrap();
        let status = state.capture_status();
        assert!(status.running);
        assert_eq!(
            status.frame,
            Some(FrameInfo {
                seq: 1,
                width: 2880,
                height: 1800
            })
        );
        state.stop_capture();
        assert!(!state.capture_status().running);
        assert_eq!(state.capture_status().frame, None);
    }

    #[test]
    fn preview_is_downscaled_and_masks_the_user_id() {
        let state = state_with(vec![white_frame()], vec![]);
        state.start_capture(30).unwrap();
        let bytes = state.capture_preview(640).unwrap();

        let width = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
        let height = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
        assert_eq!((width, height), (640, 400));
        let pixel = |x: u32, y: u32| {
            let i = 8 + ((y * width + x) * 4) as usize;
            [bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]
        };
        assert_eq!(pixel(10, 10), [255, 255, 255, 255], "normal area untouched");
        assert_eq!(pixel(620, 397), [0, 0, 0, 255], "User ID area blacked out");
    }

    #[test]
    fn preview_without_a_frame_is_an_error() {
        let state = state_with(vec![], vec![]);
        assert!(matches!(
            state.capture_preview(640),
            Err(Error::CaptureFailed(_))
        ));
    }

    #[test]
    fn ocr_region_returns_lines_and_crop_size() {
        let line = OcrLine {
            text: "Thousand-Puppet Pavilion".into(),
            bounds: Rect::new(0, 0, 100, 20),
        };
        let state = state_with(vec![white_frame()], vec![line.clone()]);
        state.start_capture(30).unwrap();
        let result = state
            .ocr_region(FracRect::new(0.685, 0.104, 0.27, 0.034))
            .unwrap();
        assert_eq!(result.lines, vec![line]);
        assert!(result.width > 700 && result.height > 50);
    }

    #[test]
    fn ocr_region_refuses_the_user_id_area() {
        let state = state_with(vec![white_frame()], vec![]);
        state.start_capture(30).unwrap();
        assert!(matches!(
            state.ocr_region(FracRect::new(0.8, 0.9, 0.2, 0.1)),
            Err(Error::InvalidRegion)
        ));
    }

    #[test]
    fn start_capture_refuses_a_minimized_game() {
        let finder = FakeWindowFinder::focused();
        finder.set_minimized(true);
        let state = AppState::new(Platform {
            finder: Box::new(finder),
            capture: Box::new(FakeFrames::new(vec![white_frame()])),
            ocr: Box::new(FakeOcr::returning(vec![])),
            input: Box::new(FakeInput::default()),
        });
        assert!(matches!(
            state.start_capture(30),
            Err(Error::WindowMinimized)
        ));
    }

    #[test]
    fn auto_mode_starts_disarmed_and_clicks_only_after_arming() {
        let state = state_with(vec![], vec![]);
        assert_eq!(state.auto_mode_status().state, AutoModeState::Disarmed);
        assert!(matches!(
            state.auto_click(FracPoint::new(0.5, 0.5)),
            Err(Error::AutoModeNotArmed)
        ));
        assert!(matches!(
            state.arm_auto_mode("ok"),
            Err(Error::ConfirmationMismatch)
        ));

        state.arm_auto_mode(CONFIRMATION_PHRASE).unwrap();
        let status = state.auto_click(FracPoint::new(0.5, 0.5)).unwrap();
        assert_eq!(status.state, AutoModeState::Armed);
        assert_eq!(status.actions_used, 1);

        assert_eq!(state.disarm_auto_mode().state, AutoModeState::Disarmed);
    }

    #[test]
    fn the_stop_key_aborts_auto_mode_and_blocks_further_input() {
        let state = state_with(vec![], vec![]);
        state.arm_auto_mode(CONFIRMATION_PHRASE).unwrap();
        state.auto_click(FracPoint::new(0.5, 0.5)).unwrap();

        state.stop_from_hotkey();

        assert_eq!(
            state.auto_mode_status().state,
            AutoModeState::Aborted(AbortReason::Hotkey)
        );
        assert!(!state.is_armed());
        assert!(matches!(
            state.auto_click(FracPoint::new(0.5, 0.5)),
            Err(Error::AutoModeAborted(AbortReason::Hotkey))
        ));
        assert!(matches!(
            state.auto_scroll(FracPoint::new(0.5, 0.5), -3),
            Err(Error::AutoModeAborted(AbortReason::Hotkey))
        ));
        assert_eq!(state.auto_mode_status().actions_used, 1);
    }

    #[test]
    fn the_stop_key_does_nothing_while_disarmed() {
        let state = state_with(vec![], vec![]);
        state.stop_from_hotkey();
        assert_eq!(state.auto_mode_status().state, AutoModeState::Disarmed);
        // Arming afterwards works normally.
        state.arm_auto_mode(CONFIRMATION_PHRASE).unwrap();
        assert!(state.is_armed());
    }

    #[test]
    fn auto_scroll_needs_arming_and_goes_through_the_guard() {
        let state = state_with(vec![], vec![]);
        assert!(matches!(
            state.auto_scroll(FracPoint::new(0.5, 0.5), -3),
            Err(Error::AutoModeNotArmed)
        ));
        state.arm_auto_mode(CONFIRMATION_PHRASE).unwrap();
        let status = state.auto_scroll(FracPoint::new(0.5, 0.5), -3).unwrap();
        assert_eq!(status.actions_used, 1);
        assert!(matches!(
            state.auto_scroll(FracPoint::new(0.5, 0.5), 500),
            Err(Error::InvalidScroll)
        ));
        assert!(!state.is_armed(), "an oversized scroll stops auto mode");
    }

    #[test]
    fn read_regions_uses_the_frame_pinned_by_sample_and_expires_it() {
        let line = OcrLine {
            text: "Hecate".into(),
            bounds: Rect::new(0, 0, 10, 10),
        };
        let frames = vec![white_frame(), Frame::solid(2880, 1800, 2, [0; 4]).unwrap()];
        let state = state_with(frames, vec![line]);
        state.start_capture(30).unwrap();
        let name = FracRect::new(0.685, 0.104, 0.27, 0.034);

        // Reading before any sample: nothing pinned.
        let request = vec![RegionRead {
            id: "name".into(),
            region: name,
        }];
        assert!(matches!(
            state.read_regions(1, &request),
            Err(Error::FrameExpired)
        ));

        let bytes = state.sample_regions(&[name], 32).unwrap();
        let seq = u64::from_le_bytes(bytes[0..8].try_into().unwrap());
        assert_eq!(seq, 1);
        let text = state.read_regions(seq, &request).unwrap();
        assert_eq!(text[0].lines[0].text, "Hecate");

        // A stale sequence number is refused rather than reading a different frame.
        assert!(matches!(
            state.read_regions(seq + 1, &request),
            Err(Error::FrameExpired)
        ));
    }

    #[test]
    fn auto_mode_status_serializes_abort_reason_for_the_ui() {
        let status = AutoModeStatus {
            state: AutoModeState::Aborted(AbortReason::UserInput),
            actions_used: 3,
            stop_key_active: false,
        };
        let json = serde_json::to_value(status).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "state": { "Aborted": "UserInput" },
                "actions_used": 3,
                "stop_key_active": false
            })
        );
    }
}
