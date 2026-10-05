//! Small `AppKit` helpers shared by the window finder and input driver.

use objc2_app_kit::NSWorkspace;

/// Process id of the app the user is currently using (the frontmost app), if any.
pub(super) fn frontmost_pid() -> Option<i32> {
    NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .map(|app| app.processIdentifier())
}
