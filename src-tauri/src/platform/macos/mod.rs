//! macOS adapters: `ScreenCaptureKit` for finding and capturing the window (ADR 0005),
//! Vision for text (ADR 0004), Core Graphics events for auto mode (ADR 0006).
//!
//! macOS asks the user for two permissions: **Screen Recording** (needed to list and
//! capture windows) and, only for auto mode, **Accessibility** (needed to click).

mod app;
mod capture;
mod input;
mod ocr;
mod sck;
mod window;

use crate::platform::Platform;

pub(super) fn create() -> Platform {
    Platform {
        finder: Box::new(window::SckWindowFinder),
        capture: Box::new(capture::SckCapture::default()),
        ocr: Box::new(ocr::VisionOcr),
        input: Box::new(input::CgInput),
    }
}
