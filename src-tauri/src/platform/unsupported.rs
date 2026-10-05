//! Placeholder adapters for Linux, which only runs in the Docker check container. The app
//! itself supports Windows and macOS.

use std::sync::Arc;

use crate::error::Error;
use crate::frame::Frame;
use crate::geometry::ScreenPoint;
use crate::platform::Platform;
use crate::traits::{FrameSource, GameWindow, InputDriver, Key, OcrEngine, OcrLine, WindowFinder};

/// Adapter that reports [`Error::Unsupported`] for everything.
struct Unsupported;

pub(super) fn create() -> Platform {
    Platform {
        finder: Box::new(Unsupported),
        capture: Box::new(Unsupported),
        ocr: Box::new(Unsupported),
        input: Box::new(Unsupported),
    }
}

impl WindowFinder for Unsupported {
    fn find_game_window(&self) -> Result<GameWindow, Error> {
        Err(Error::Unsupported)
    }
}

impl FrameSource for Unsupported {
    fn start(&mut self, _window: &GameWindow, _max_fps: u32) -> Result<(), Error> {
        Err(Error::Unsupported)
    }

    fn latest_frame(&self) -> Option<Arc<Frame>> {
        None
    }

    fn fps(&self) -> f64 {
        0.0
    }

    fn stop(&mut self) {}
}

impl OcrEngine for Unsupported {
    fn recognize(&self, _image: &Frame) -> Result<Vec<OcrLine>, Error> {
        Err(Error::Unsupported)
    }
}

impl InputDriver for Unsupported {
    fn focus(&self, _window: &GameWindow) -> Result<(), Error> {
        Err(Error::Unsupported)
    }

    fn click(&self, _point: ScreenPoint) -> Result<(), Error> {
        Err(Error::Unsupported)
    }

    fn scroll(&self, _point: ScreenPoint, _ticks: i32) -> Result<(), Error> {
        Err(Error::Unsupported)
    }

    fn press(&self, _key: Key) -> Result<(), Error> {
        Err(Error::Unsupported)
    }

    fn cursor_position(&self) -> Result<ScreenPoint, Error> {
        Err(Error::Unsupported)
    }
}
