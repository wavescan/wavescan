//! Shared `ScreenCaptureKit` helpers: listing shareable windows and mapping its errors.

use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2_foundation::NSError;
use objc2_screen_capture_kit::{SCShareableContent, SCWindow};

use crate::error::Error;
use crate::platform::MacWindowInfo;

/// Message shown when macOS hasn't granted Screen Recording.
pub(super) const SCREEN_RECORDING_HELP: &str = "Screen Recording. Open System Settings → \
    Privacy & Security → Screen & System Audio Recording, turn on Wavescan, then quit and \
    reopen Wavescan.";

/// `SCStreamErrorUserDeclined`: the user hasn't granted Screen Recording.
const USER_DECLINED: isize = -3801;

/// How long to wait for `ScreenCaptureKit` to answer before giving up.
pub(super) const TIMEOUT: Duration = Duration::from_secs(5);

/// Lists windows (including off-screen ones, so a minimised game is still found).
/// Blocks until `ScreenCaptureKit` answers.
pub(super) fn shareable_content() -> Result<Retained<SCShareableContent>, Error> {
    let (tx, rx) = mpsc::channel();
    let block = RcBlock::new(
        move |content: *mut SCShareableContent, error: *mut NSError| {
            // SAFETY: ScreenCaptureKit passes a valid object or null for each argument;
            // `Retained::retain` returns None for null.
            let result = match unsafe { Retained::retain(content) } {
                Some(content) => Ok(content),
                // SAFETY: as above, for the error argument.
                None => Err(from_ns_error(unsafe { Retained::retain(error) })),
            };
            let _ = tx.send(result);
        },
    );
    // SAFETY: the block lives until the completion handler has run (ScreenCaptureKit copies
    // it), and the flags are plain booleans.
    unsafe {
        SCShareableContent::getShareableContentExcludingDesktopWindows_onScreenWindowsOnly_completionHandler(
            true, false, &block,
        );
    }
    rx.recv_timeout(TIMEOUT)
        .map_err(|_| Error::CaptureFailed("timed out listing windows".into()))?
}

/// Copies what we need out of each window.
pub(super) fn window_infos(
    content: &SCShareableContent,
) -> Vec<(MacWindowInfo, Retained<SCWindow>)> {
    // SAFETY: plain property reads on objects ScreenCaptureKit just returned.
    unsafe {
        content
            .windows()
            .iter()
            .map(|window| {
                let app = window.owningApplication();
                let frame = window.frame();
                let info = MacWindowInfo {
                    id: window.windowID(),
                    app_name: app
                        .as_ref()
                        .map(|a| a.applicationName().to_string())
                        .unwrap_or_default(),
                    title: window.title().map(|t| t.to_string()).unwrap_or_default(),
                    layer: window.windowLayer(),
                    on_screen: window.isOnScreen(),
                    pid: app.as_ref().map_or(0, |a| a.processID()),
                    frame: (
                        frame.origin.x,
                        frame.origin.y,
                        frame.size.width,
                        frame.size.height,
                    ),
                };
                (info, window)
            })
            .collect()
    }
}

/// Turns a `ScreenCaptureKit` error into ours, recognising a missing permission.
pub(super) fn from_ns_error(error: Option<Retained<NSError>>) -> Error {
    match error {
        Some(e) if e.code() == USER_DECLINED => {
            Error::PermissionDenied(SCREEN_RECORDING_HELP.into())
        }
        Some(e) => Error::CaptureFailed(e.localizedDescription().to_string()),
        None => Error::CaptureFailed("ScreenCaptureKit returned nothing".into()),
    }
}
