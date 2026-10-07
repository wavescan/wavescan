//! Facts about Wavescan's *own* process. Never opens or inspects the game's process.

use std::mem::size_of;

use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Security::{GetTokenInformation, TOKEN_ELEVATION, TOKEN_QUERY, TokenElevation};
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

/// True if Wavescan is running as administrator. `None` if Windows won't say.
///
/// Diagnostics shows this so a failed click test can be explained: Windows blocks clicks
/// from a normal app into a game running as administrator (UIPI).
pub(in crate::platform) fn is_elevated() -> Option<bool> {
    let mut token = HANDLE::default();
    // SAFETY: GetCurrentProcess returns a pseudo-handle that needs no closing, and `token`
    // is a valid, writable HANDLE for the result.
    unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &raw mut token) }.ok()?;

    let mut elevation = TOKEN_ELEVATION::default();
    let mut written = 0u32;
    let size = u32::try_from(size_of::<TOKEN_ELEVATION>()).ok()?;
    // SAFETY: `token` was opened above with TOKEN_QUERY. `elevation` is a writable
    // TOKEN_ELEVATION and `size` is exactly its size, as the API requires.
    let result = unsafe {
        GetTokenInformation(
            token,
            TokenElevation,
            Some((&raw mut elevation).cast()),
            size,
            &raw mut written,
        )
    };
    // SAFETY: `token` is a handle we own, closed exactly once here.
    let _ = unsafe { CloseHandle(token) };

    result.ok()?;
    Some(elevation.TokenIsElevated != 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_answers_the_elevation_question() {
        // CI runners may or may not be elevated; either way Windows must give an answer.
        assert!(is_elevated().is_some());
    }
}
