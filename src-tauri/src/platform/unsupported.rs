//! Placeholder adapters for operating systems that aren't implemented yet (macOS until
//! milestone 4; Linux, which only runs in the Docker check container).

use std::sync::Arc;

use crate::error::Error;
use crate::frame::Frame;
use crate::platform::Platform;
use crate::traits::{FrameSource, GameWindow, OcrEngine, OcrLine, WindowFinder};

/// Adapter that reports [`Error::Unsupported`] for everything.
struct Unsupported;

pub(super) fn create() -> Platform {
    Platform {
        finder: Box::new(Unsupported),
        capture: Box::new(Unsupported),
        ocr: Box::new(Unsupported),
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
