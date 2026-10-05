//! The app's error type, and how errors are sent to the UI.

use serde::ser::SerializeStruct;

use crate::safety::AbortReason;

/// Everything that can go wrong in a command or at startup.
///
/// Each variant is sent to the UI as `{ kind, message }` (see `src/ipc/types.ts`), so the
/// UI can show a specific explanation for each `kind`.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The app couldn't start (window or webview creation failed).
    #[error("the app could not start: {0}")]
    Startup(String),

    /// Wuthering Waves isn't running, or its window couldn't be found.
    #[error("the Wuthering Waves window was not found; is the game running?")]
    WindowNotFound,

    /// The game window is minimised, so it can't be captured or clicked.
    #[error("the Wuthering Waves window is minimised")]
    WindowMinimized,

    /// The OS hasn't granted a permission we need (macOS Screen Recording or Accessibility).
    #[error("permission needed: {0}")]
    PermissionDenied(String),

    /// Screen capture failed for a reason other than permissions.
    #[error("capture failed: {0}")]
    CaptureFailed(String),

    /// The OS has no OCR engine or language pack we can use.
    #[error("text recognition is unavailable: {0}")]
    OcrUnavailable(String),

    /// The OS OCR engine returned an error.
    #[error("text recognition failed: {0}")]
    OcrFailed(String),

    /// The OS refused synthetic input (on Windows, usually because the game runs as
    /// administrator and Wavescan doesn't).
    #[error("the game did not accept input: {0}")]
    InputBlocked(String),

    /// Pixel data didn't match its declared size.
    #[error("invalid frame: {0}")]
    InvalidFrame(String),

    /// A requested region was outside 0.0–1.0 or rounded to zero pixels.
    #[error("the requested region is outside the frame")]
    InvalidRegion,

    /// Auto mode was asked to act before the user armed it.
    #[error("auto mode is not turned on")]
    AutoModeNotArmed,

    /// The typed confirmation didn't match, so auto mode stays off.
    #[error("auto mode needs the confirmation phrase to be typed exactly")]
    ConfirmationMismatch,

    /// Auto mode stopped for a safety reason and must be re-armed by the user.
    #[error("auto mode stopped: {0}")]
    AutoModeAborted(AbortReason),

    /// A click target was outside the game window. Indicates a bug, so we refuse to act.
    #[error("refused to send input outside the game window")]
    OutOfBounds,

    /// This feature isn't implemented on this operating system.
    #[error("not supported on this operating system")]
    Unsupported,
}

impl Error {
    /// Short, stable identifier for the error, used by the UI to pick a message.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Error::Startup(_) => "Startup",
            Error::WindowNotFound => "WindowNotFound",
            Error::WindowMinimized => "WindowMinimized",
            Error::PermissionDenied(_) => "PermissionDenied",
            Error::CaptureFailed(_) => "CaptureFailed",
            Error::OcrUnavailable(_) => "OcrUnavailable",
            Error::OcrFailed(_) => "OcrFailed",
            Error::InputBlocked(_) => "InputBlocked",
            Error::InvalidFrame(_) => "InvalidFrame",
            Error::InvalidRegion => "InvalidRegion",
            Error::AutoModeNotArmed => "AutoModeNotArmed",
            Error::ConfirmationMismatch => "ConfirmationMismatch",
            Error::AutoModeAborted(_) => "AutoModeAborted",
            Error::OutOfBounds => "OutOfBounds",
            Error::Unsupported => "Unsupported",
        }
    }
}

impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("Error", 2)?;
        state.serialize_field("kind", self.kind())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_as_kind_and_message() {
        let error = Error::Startup("no webview".into());
        let json = serde_json::to_value(&error).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "kind": "Startup",
                "message": "the app could not start: no webview"
            })
        );
    }

    #[test]
    fn abort_reason_appears_in_message() {
        let error = Error::AutoModeAborted(AbortReason::UserInput);
        let json = serde_json::to_value(&error).unwrap();
        assert_eq!(json["kind"], "AutoModeAborted");
        assert!(json["message"].as_str().unwrap().contains("mouse"));
    }
}
