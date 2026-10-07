//! OS-specific implementations of the traits in `traits.rs`.
//!
//! Only `platform/windows/` and `platform/macos/` may call OS APIs (CLAUDE.md). The
//! OS-independent helpers in `helpers.rs` are unit-tested everywhere.

use crate::traits::{FrameSource, InputDriver, OcrEngine, WindowFinder};

mod helpers;
#[cfg_attr(
    not(any(windows, target_os = "macos")),
    allow(
        unused_imports,
        reason = "only the Windows/macOS adapters use the helpers"
    )
)]
pub(crate) use helpers::*;

#[cfg(windows)]
mod windows;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(not(any(windows, target_os = "macos")))]
mod unsupported;

/// The OS adapters for the platform this build targets.
pub struct Platform {
    /// Finds the game window.
    pub finder: Box<dyn WindowFinder + Send + Sync>,
    /// Captures the game window.
    pub capture: Box<dyn FrameSource + Send>,
    /// Reads text.
    pub ocr: Box<dyn OcrEngine + Send + Sync>,
    /// Sends input. Only `safety::AutoMode` may use it.
    pub input: Box<dyn InputDriver + Send + Sync>,
}

/// True if Wavescan itself is running as administrator (Windows). `None` on other systems,
/// where it doesn't matter, or if Windows won't say. Shown in Diagnostics because Windows
/// blocks clicks from a normal app into a game running as administrator.
#[must_use]
pub fn is_elevated() -> Option<bool> {
    #[cfg(windows)]
    {
        windows::is_elevated()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// Creates the adapters for this OS. On other platforms (Linux, which only runs in the
/// Docker check container) every adapter returns [`crate::Error::Unsupported`].
#[must_use]
pub fn create() -> Platform {
    #[cfg(windows)]
    {
        windows::create()
    }
    #[cfg(target_os = "macos")]
    {
        macos::create()
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        unsupported::create()
    }
}
