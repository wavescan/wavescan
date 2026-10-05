//! The four seams between Wavescan and the operating system.
//!
//! Everything OS-specific sits behind one of these traits. The Windows and macOS
//! implementations live in `platform/` (thin wrappers around OS APIs). Tests use the fakes
//! in `testing.rs`, so the logic built on top (safety, sessions) is tested without a game
//! or a real screen. See `docs/architecture.md` §4.

use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::frame::Frame;
use crate::geometry::{Rect, ScreenPoint};

/// An OS-specific window identifier (an `HWND` on Windows, a `CGWindowID` on macOS).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct WindowId(pub u64);

/// What we know about the game window at one moment.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GameWindow {
    /// Identifies the window for capture.
    pub id: WindowId,
    /// The drawable area (no title bar or borders), in physical screen pixels.
    pub client_rect: Rect,
    /// Display scale factor (1.0 = 100%, 2.0 = Retina/200%).
    pub scale_factor: f64,
    /// True if the game window currently has keyboard focus.
    pub focused: bool,
    /// True if the window is minimised (nothing can be captured or clicked).
    pub minimized: bool,
}

/// A window that might be the game, listed on the Diagnostics screen to debug
/// "game window not found".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WindowCandidate {
    /// Window title.
    pub title: String,
    /// OS window class (Windows) or owning app name (macOS).
    pub class: String,
    /// True if this is the window `find_game_window` would pick.
    pub matched: bool,
}

/// Finds the Wuthering Waves window.
pub trait WindowFinder {
    /// Looks up the game window right now. Call it again whenever fresh state matters
    /// (focus and position change at any time).
    ///
    /// # Errors
    ///
    /// Returns [`Error::WindowNotFound`] if the game isn't running, or a platform error if
    /// the OS query fails.
    fn find_game_window(&self) -> Result<GameWindow, Error>;

    /// Visible windows whose title mentions Wuthering Waves, for diagnostics. Only titles
    /// containing "Wuthering" are returned, so no other apps' window names are collected.
    ///
    /// # Errors
    ///
    /// Returns a platform error if the OS query fails.
    fn candidates(&self) -> Result<Vec<WindowCandidate>, Error> {
        Ok(Vec::new())
    }
}

/// Captures frames of one window, never the whole screen (ADR 0005).
pub trait FrameSource {
    /// Starts capturing `window` at up to `max_fps` frames per second. Replaces any capture
    /// already running.
    ///
    /// # Errors
    ///
    /// Returns [`Error::PermissionDenied`] if the OS hasn't granted screen capture (macOS
    /// Screen Recording), or [`Error::CaptureFailed`] for other capture errors.
    fn start(&mut self, window: &GameWindow, max_fps: u32) -> Result<(), Error>;

    /// The most recent frame, if one has arrived since `start`. Older frames are dropped,
    /// never queued, so this is always "what the game looks like now". Shared (`Arc`) so
    /// callers don't copy megabytes of pixels.
    fn latest_frame(&self) -> Option<Arc<Frame>>;

    /// Frames received per second over the last second (0.0 when idle).
    fn fps(&self) -> f64;

    /// Stops capturing. Safe to call when nothing is running.
    fn stop(&mut self);
}

/// One line of text found by OCR.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OcrLine {
    /// The recognised text.
    pub text: String,
    /// Where the line is, in pixels of the image that was passed in.
    pub bounds: Rect,
}

/// Reads text from an image using the OS's built-in OCR (ADR 0004).
pub trait OcrEngine {
    /// Recognises text in `image`, returning lines from top to bottom.
    ///
    /// # Errors
    ///
    /// Returns [`Error::OcrUnavailable`] if the OS has no usable OCR language (for example
    /// the English OCR pack is missing on Windows), or [`Error::OcrFailed`] otherwise.
    fn recognize(&self, image: &Frame) -> Result<Vec<OcrLine>, Error>;
}

/// The only keys Wavescan can ever press. A closed list keeps auto mode from typing
/// anything else into the game (or anywhere else).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Key {
    /// Closes menus.
    Escape,
    /// Opens the Bag (default keybind).
    B,
    /// Opens Resonators (default keybind).
    C,
}

/// Sends mouse and keyboard input (ADR 0006).
///
/// **Never call this directly.** All input goes through [`crate::safety::AutoMode`], which
/// checks arming, focus, bounds and abort conditions first. Only `safety.rs` and the
/// platform implementations may refer to this trait's methods.
pub trait InputDriver {
    /// Moves the cursor to `point` and left-clicks.
    ///
    /// # Errors
    ///
    /// Returns [`Error::InputBlocked`] if the OS refused the input (for example, the game is
    /// running as administrator and Wavescan isn't).
    fn click(&self, point: ScreenPoint) -> Result<(), Error>;

    /// Moves the cursor to `point` and scrolls the wheel. Negative `ticks` scroll down.
    ///
    /// # Errors
    ///
    /// Returns [`Error::InputBlocked`] if the OS refused the input.
    fn scroll(&self, point: ScreenPoint, ticks: i32) -> Result<(), Error>;

    /// Presses and releases one key.
    ///
    /// # Errors
    ///
    /// Returns [`Error::InputBlocked`] if the OS refused the input.
    fn press(&self, key: Key) -> Result<(), Error>;

    /// Where the cursor is right now. Used to notice the user moving the mouse, which
    /// stops auto mode.
    ///
    /// # Errors
    ///
    /// Returns a platform error if the OS query fails.
    fn cursor_position(&self) -> Result<ScreenPoint, Error>;
}
