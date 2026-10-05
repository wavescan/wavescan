//! The gatekeeper for everything that could affect the user's game or privacy.
//!
//! Two jobs:
//!
//! 1. **Auto-mode input** ([`AutoMode`]): every click, scroll and key press goes through
//!    here. It only reaches the game if the user armed auto mode with the typed
//!    confirmation, the game window exists, is focused and isn't minimised, the target is
//!    inside the window, the user hasn't touched the mouse, and the session's action cap
//!    isn't used up. Any failure **stops auto mode** until the user arms it again
//!    (ADR 0006).
//! 2. **User ID privacy** ([`mask_user_id`], [`crop_outside_user_id`]): the game prints
//!    the player's User ID bottom-right. It's never cropped for OCR and is blacked out
//!    before any frame is saved (ADR 0013).
//!
//! This file is security-sensitive: changes need tests and a note in the PR description
//! (CLAUDE.md).

use std::fmt;

use serde::Serialize;

use crate::error::Error;
use crate::frame::Frame;
use crate::geometry::{FracPoint, FracRect, ScreenPoint};
use crate::traits::{GameWindow, InputDriver, Key, WindowFinder};

/// The phrase the user must type to arm auto mode. Shown in the UI next to the Fair Play
/// warning. Compared ignoring case and surrounding spaces.
pub const CONFIRMATION_PHRASE: &str = "I understand";

/// Where the User ID is drawn, as fractions of the game's client area. Measured on 16:10
/// captures at 2880×1800 and 2800×1752: the text spans x 0.886–0.972, y 0.985–0.996. The
/// region adds padding on every side but stays below the Upgrade button (y < 0.95).
///
/// TODO(16:9): measure on 16:9 captures once we have them (docs/fixtures.md).
pub const USER_ID_REGION: FracRect = FracRect::new(0.86, 0.975, 0.14, 0.025);

/// Colour used to black out the User ID (opaque black, BGRA).
const MASK_COLOUR: [u8; 4] = [0, 0, 0, 255];

/// Why auto mode stopped. The user must arm it again to continue.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum AbortReason {
    /// The mouse moved between our actions, so the user wants control back.
    UserInput,
    /// The user pressed the stop hotkey.
    Hotkey,
    /// The game window lost focus or was minimised.
    FocusLost,
    /// The game window disappeared (game closed or crashed).
    WindowGone,
    /// The session used up its maximum number of actions.
    ActionCapReached,
    /// A click target was outside the game window (a bug; we refuse to guess).
    InvalidTarget,
    /// The OS rejected our input.
    InputRejected,
    /// Something unexpected failed while checking conditions.
    CheckFailed,
}

impl fmt::Display for AbortReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let text = match self {
            AbortReason::UserInput => "the mouse was moved",
            AbortReason::Hotkey => "the stop key was pressed",
            AbortReason::FocusLost => "the game window lost focus",
            AbortReason::WindowGone => "the game window closed",
            AbortReason::ActionCapReached => "the safety limit on actions was reached",
            AbortReason::InvalidTarget => "a click target was outside the game window",
            AbortReason::InputRejected => "the game did not accept input",
            AbortReason::CheckFailed => "a safety check could not be completed",
        };
        f.write_str(text)
    }
}

/// Limits for one auto-mode session.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AutoModeLimits {
    /// Maximum clicks + scrolls + key presses per armed session. A full 3,000-echo bag
    /// needs about 3,000 clicks plus a few hundred scrolls.
    pub max_actions: u32,
    /// How far (in physical pixels) the cursor may drift from where we last put it
    /// before we treat it as the user taking over. Allows for rounding in DPI scaling.
    pub cursor_tolerance_px: f64,
}

impl Default for AutoModeLimits {
    fn default() -> Self {
        Self {
            max_actions: 5_000,
            cursor_tolerance_px: 3.0,
        }
    }
}

/// Whether auto mode may act.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum AutoModeState {
    /// Off (the default, and after every app start).
    Disarmed,
    /// Armed by the user; actions are allowed while all checks pass.
    Armed,
    /// Stopped for a safety reason; must be re-armed.
    Aborted(AbortReason),
}

/// Guards all synthetic input. See the module docs for the rules it enforces.
///
/// Arming is never persisted: a new `AutoMode` always starts disarmed.
#[derive(Debug)]
pub struct AutoMode {
    state: AutoModeState,
    limits: AutoModeLimits,
    actions_used: u32,
    /// Where we last put the cursor, to notice the user moving it.
    last_cursor: Option<ScreenPoint>,
}

impl Default for AutoMode {
    fn default() -> Self {
        Self::new(AutoModeLimits::default())
    }
}

impl AutoMode {
    /// Creates a disarmed guard with the given limits.
    #[must_use]
    pub fn new(limits: AutoModeLimits) -> Self {
        Self {
            state: AutoModeState::Disarmed,
            limits,
            actions_used: 0,
            last_cursor: None,
        }
    }

    /// Current state.
    #[must_use]
    pub fn state(&self) -> AutoModeState {
        self.state
    }

    /// Actions sent since the guard was last armed.
    #[must_use]
    pub fn actions_used(&self) -> u32 {
        self.actions_used
    }

    /// Arms auto mode if `confirmation` matches [`CONFIRMATION_PHRASE`] (ignoring case and
    /// surrounding spaces). Resets the action count. Re-arming after an abort is allowed;
    /// it's the user's explicit choice.
    ///
    /// # Errors
    ///
    /// Returns [`Error::ConfirmationMismatch`] (and stays disarmed) if the phrase doesn't
    /// match.
    pub fn arm(&mut self, confirmation: &str) -> Result<(), Error> {
        if !confirmation
            .trim()
            .eq_ignore_ascii_case(CONFIRMATION_PHRASE)
        {
            self.state = AutoModeState::Disarmed;
            return Err(Error::ConfirmationMismatch);
        }
        self.state = AutoModeState::Armed;
        self.actions_used = 0;
        self.last_cursor = None;
        Ok(())
    }

    /// Turns auto mode off (the user's choice, not an error).
    pub fn disarm(&mut self) {
        self.state = AutoModeState::Disarmed;
        self.last_cursor = None;
    }

    /// Stops auto mode for `reason`. Called internally when a check fails, and externally
    /// by the stop hotkey. Does nothing if auto mode isn't armed (keeps the first reason).
    pub fn abort(&mut self, reason: AbortReason) {
        if self.state == AutoModeState::Armed {
            self.state = AutoModeState::Aborted(reason);
        }
    }

    /// Brings the game to the front so it receives input. Needs auto mode armed and the
    /// game window present and not minimised, but (unlike the other actions) not focused.
    ///
    /// # Errors
    ///
    /// Same as [`AutoMode::click`], except focus isn't required.
    pub fn focus_game(
        &mut self,
        finder: &dyn WindowFinder,
        driver: &dyn InputDriver,
    ) -> Result<(), Error> {
        let window = self.check(finder, driver, Focus::NotRequired)?;
        self.send(|| driver.focus(&window))
    }

    /// Clicks at `target` (fractions of the game's client area) if every check passes.
    ///
    /// # Errors
    ///
    /// - [`Error::AutoModeNotArmed`] / [`Error::AutoModeAborted`] if auto mode can't act.
    /// - [`Error::OutOfBounds`] if `target` isn't within 0.0–1.0 (auto mode stops).
    /// - The driver's error (usually [`Error::InputBlocked`]) if the OS refused the click
    ///   (auto mode stops).
    pub fn click(
        &mut self,
        finder: &dyn WindowFinder,
        driver: &dyn InputDriver,
        target: FracPoint,
    ) -> Result<(), Error> {
        let window = self.check(finder, driver, Focus::Required)?;
        let point = self.resolve(&window, target)?;
        self.send(|| driver.click(point))?;
        self.last_cursor = Some(point);
        Ok(())
    }

    /// Scrolls the mouse wheel at `target` (fractions of the client area). Negative
    /// `ticks` scroll down.
    ///
    /// # Errors
    ///
    /// Same as [`AutoMode::click`].
    pub fn scroll(
        &mut self,
        finder: &dyn WindowFinder,
        driver: &dyn InputDriver,
        target: FracPoint,
        ticks: i32,
    ) -> Result<(), Error> {
        let window = self.check(finder, driver, Focus::Required)?;
        let point = self.resolve(&window, target)?;
        self.send(|| driver.scroll(point, ticks))?;
        self.last_cursor = Some(point);
        Ok(())
    }

    /// Presses one of the allowed [`Key`]s.
    ///
    /// # Errors
    ///
    /// Same as [`AutoMode::click`], except there is no target to be out of bounds.
    pub fn press(
        &mut self,
        finder: &dyn WindowFinder,
        driver: &dyn InputDriver,
        key: Key,
    ) -> Result<(), Error> {
        self.check(finder, driver, Focus::Required)?;
        self.send(|| driver.press(key))
    }

    /// Runs every pre-action check, stopping auto mode on the first failure.
    fn check(
        &mut self,
        finder: &dyn WindowFinder,
        driver: &dyn InputDriver,
        focus: Focus,
    ) -> Result<GameWindow, Error> {
        match self.state {
            AutoModeState::Armed => {}
            AutoModeState::Disarmed => return Err(Error::AutoModeNotArmed),
            AutoModeState::Aborted(reason) => return Err(Error::AutoModeAborted(reason)),
        }
        if self.actions_used >= self.limits.max_actions {
            return Err(self.stop(AbortReason::ActionCapReached));
        }

        // Fresh window state every time: focus and position can change between actions.
        let window = match finder.find_game_window() {
            Ok(window) => window,
            Err(Error::WindowNotFound) => return Err(self.stop(AbortReason::WindowGone)),
            Err(_) => return Err(self.stop(AbortReason::CheckFailed)),
        };
        if window.minimized || (focus == Focus::Required && !window.focused) {
            return Err(self.stop(AbortReason::FocusLost));
        }

        // If the cursor isn't where we left it, the user moved the mouse: hand back control.
        if let Some(last) = self.last_cursor {
            let Ok(now) = driver.cursor_position() else {
                return Err(self.stop(AbortReason::CheckFailed));
            };
            if now.distance_to(last) > self.limits.cursor_tolerance_px {
                return Err(self.stop(AbortReason::UserInput));
            }
        }
        Ok(window)
    }

    /// Turns a fractional target into a screen point inside the client area.
    fn resolve(&mut self, window: &GameWindow, target: FracPoint) -> Result<ScreenPoint, Error> {
        match window.client_rect.point_at(target) {
            Some(point) if window.client_rect.contains(point) => Ok(point),
            _ => {
                self.abort(AbortReason::InvalidTarget);
                Err(Error::OutOfBounds)
            }
        }
    }

    /// Sends one action and counts it. If the OS refuses, auto mode stops and the
    /// driver's error is returned so the UI can explain it (e.g. "run as administrator").
    fn send(&mut self, action: impl FnOnce() -> Result<(), Error>) -> Result<(), Error> {
        self.actions_used += 1;
        action().inspect_err(|_| self.abort(AbortReason::InputRejected))
    }

    /// Aborts and returns the matching error.
    fn stop(&mut self, reason: AbortReason) -> Error {
        self.abort(reason);
        Error::AutoModeAborted(reason)
    }
}

/// Whether an action needs the game to already have focus.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Focus {
    Required,
    NotRequired,
}

/// True if `region` (fractions of the client area) touches the User ID area.
#[must_use]
pub fn overlaps_user_id(region: &FracRect) -> bool {
    region.overlaps(&USER_ID_REGION)
}

/// Blacks out the User ID in place. Must run before any frame or crop is written to disk
/// or shown outside the scanning pipeline (ADR 0013).
///
/// # Errors
///
/// Returns [`Error::InvalidRegion`] only if the frame is too small for the region to cover
/// any pixels (not possible for real game frames).
pub fn mask_user_id(frame: &mut Frame) -> Result<(), Error> {
    frame.fill(USER_ID_REGION, MASK_COLOUR)
}

/// Crops `region` from `frame`, refusing any region that overlaps the User ID. The only
/// way the scanning pipeline should crop frames for OCR.
///
/// # Errors
///
/// Returns [`Error::InvalidRegion`] if the region overlaps the User ID or is otherwise
/// invalid.
pub fn crop_outside_user_id(frame: &Frame, region: FracRect) -> Result<Frame, Error> {
    if overlaps_user_id(&region) {
        return Err(Error::InvalidRegion);
    }
    frame.crop(region)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{FakeInput, FakeWindowFinder, InputEvent};

    const CENTER: FracPoint = FracPoint::new(0.5, 0.5);

    fn assert_nothing_sent(input: &FakeInput) {
        assert_eq!(
            input.events(),
            Vec::<InputEvent>::new(),
            "no input may be sent"
        );
    }

    fn armed() -> AutoMode {
        let mut guard = AutoMode::default();
        guard.arm(CONFIRMATION_PHRASE).unwrap();
        guard
    }

    // ---- arming ----------------------------------------------------------------------

    #[test]
    fn starts_disarmed_and_refuses_to_act() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = AutoMode::default();
        assert_eq!(guard.state(), AutoModeState::Disarmed);
        assert!(matches!(
            guard.click(&finder, &input, CENTER),
            Err(Error::AutoModeNotArmed)
        ));
        assert_nothing_sent(&input);
    }

    #[test]
    fn arming_requires_the_exact_phrase() {
        let mut guard = AutoMode::default();
        for wrong in ["", "yes", "I understand!", "understand", "I  understand"] {
            assert!(
                matches!(guard.arm(wrong), Err(Error::ConfirmationMismatch)),
                "{wrong:?} must not arm"
            );
            assert_eq!(guard.state(), AutoModeState::Disarmed);
        }
        guard.arm("  i UNDERSTAND ").unwrap();
        assert_eq!(guard.state(), AutoModeState::Armed);
    }

    #[test]
    fn disarm_blocks_further_actions() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = armed();
        guard.disarm();
        assert!(matches!(
            guard.click(&finder, &input, CENTER),
            Err(Error::AutoModeNotArmed)
        ));
        assert_nothing_sent(&input);
    }

    // ---- happy path ------------------------------------------------------------------

    #[test]
    fn armed_click_lands_inside_the_client_rect() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = armed();
        guard.click(&finder, &input, CENTER).unwrap();
        let events = input.events();
        assert_eq!(events.len(), 1);
        let InputEvent::Click(point) = events[0] else {
            panic!("expected a click, got {:?}", events[0]);
        };
        assert!(finder.window().client_rect.contains(point));
        assert_eq!(guard.actions_used(), 1);
    }

    #[test]
    fn scroll_and_press_go_through_the_same_checks() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = armed();
        guard.scroll(&finder, &input, CENTER, -3).unwrap();
        guard.press(&finder, &input, Key::Escape).unwrap();
        assert!(matches!(input.events()[0], InputEvent::Scroll(_, -3)));
        assert_eq!(input.events()[1], InputEvent::Press(Key::Escape));
        assert_eq!(guard.actions_used(), 2);
    }

    // ---- abort conditions --------------------------------------------------------------

    #[test]
    fn user_moving_the_mouse_aborts_before_the_next_action() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = armed();
        guard.click(&finder, &input, CENTER).unwrap();

        input.user_moves_cursor_by(10, 0);
        let result = guard.click(&finder, &input, FracPoint::new(0.6, 0.6));

        assert!(matches!(
            result,
            Err(Error::AutoModeAborted(AbortReason::UserInput))
        ));
        assert_eq!(input.events().len(), 1, "the second click must not be sent");
        assert_eq!(
            guard.state(),
            AutoModeState::Aborted(AbortReason::UserInput)
        );
    }

    #[test]
    fn small_cursor_jitter_within_tolerance_is_ignored() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = armed();
        guard.click(&finder, &input, CENTER).unwrap();
        input.user_moves_cursor_by(1, 1); // DPI rounding, not a human
        guard.click(&finder, &input, CENTER).unwrap();
        assert_eq!(input.events().len(), 2);
    }

    #[test]
    fn focus_loss_aborts() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = armed();
        finder.set_focused(false);
        assert!(matches!(
            guard.click(&finder, &input, CENTER),
            Err(Error::AutoModeAborted(AbortReason::FocusLost))
        ));
        assert_nothing_sent(&input);
    }

    #[test]
    fn minimized_window_aborts() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = armed();
        finder.set_minimized(true);
        assert!(matches!(
            guard.press(&finder, &input, Key::B),
            Err(Error::AutoModeAborted(AbortReason::FocusLost))
        ));
        assert_nothing_sent(&input);
    }

    #[test]
    fn game_closing_aborts() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = armed();
        finder.close();
        assert!(matches!(
            guard.click(&finder, &input, CENTER),
            Err(Error::AutoModeAborted(AbortReason::WindowGone))
        ));
        assert_nothing_sent(&input);
    }

    #[test]
    fn hotkey_abort_stops_everything_until_rearmed() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = armed();
        guard.abort(AbortReason::Hotkey);
        assert!(matches!(
            guard.click(&finder, &input, CENTER),
            Err(Error::AutoModeAborted(AbortReason::Hotkey))
        ));
        assert_nothing_sent(&input);

        guard.arm(CONFIRMATION_PHRASE).unwrap();
        guard.click(&finder, &input, CENTER).unwrap();
        assert_eq!(input.events().len(), 1);
    }

    #[test]
    fn focus_game_works_when_unfocused_but_needs_arming() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        finder.set_focused(false);

        let mut disarmed = AutoMode::default();
        assert!(matches!(
            disarmed.focus_game(&finder, &input),
            Err(Error::AutoModeNotArmed)
        ));
        assert_nothing_sent(&input);

        let mut guard = armed();
        guard.focus_game(&finder, &input).unwrap();
        assert_eq!(input.events(), vec![InputEvent::Focus]);
        assert_eq!(guard.actions_used(), 1);
    }

    #[test]
    fn focus_game_refuses_a_minimized_window() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        finder.set_minimized(true);
        let mut guard = armed();
        assert!(matches!(
            guard.focus_game(&finder, &input),
            Err(Error::AutoModeAborted(AbortReason::FocusLost))
        ));
        assert_nothing_sent(&input);
    }

    #[test]
    fn first_abort_reason_is_kept() {
        let mut guard = armed();
        guard.abort(AbortReason::Hotkey);
        guard.abort(AbortReason::FocusLost);
        assert_eq!(guard.state(), AutoModeState::Aborted(AbortReason::Hotkey));
    }

    #[test]
    fn action_cap_aborts_once_used_up() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = AutoMode::new(AutoModeLimits {
            max_actions: 2,
            ..AutoModeLimits::default()
        });
        guard.arm(CONFIRMATION_PHRASE).unwrap();
        guard.click(&finder, &input, CENTER).unwrap();
        guard.click(&finder, &input, CENTER).unwrap();
        assert!(matches!(
            guard.click(&finder, &input, CENTER),
            Err(Error::AutoModeAborted(AbortReason::ActionCapReached))
        ));
        assert_eq!(input.events().len(), 2);
    }

    #[test]
    fn out_of_bounds_targets_are_refused_not_clamped() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        for target in [
            FracPoint::new(1.2, 0.5),
            FracPoint::new(0.5, -0.1),
            FracPoint::new(f64::NAN, 0.5),
        ] {
            let mut guard = armed();
            assert!(matches!(
                guard.click(&finder, &input, target),
                Err(Error::OutOfBounds)
            ));
            assert_eq!(
                guard.state(),
                AutoModeState::Aborted(AbortReason::InvalidTarget)
            );
        }
        assert_nothing_sent(&input);
    }

    #[test]
    fn os_rejecting_input_aborts_and_returns_the_os_error() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        input.reject_input();
        let mut guard = armed();
        assert!(matches!(
            guard.click(&finder, &input, CENTER),
            Err(Error::InputBlocked(_))
        ));
        assert_eq!(
            guard.state(),
            AutoModeState::Aborted(AbortReason::InputRejected)
        );
    }

    #[test]
    fn cursor_query_failure_aborts() {
        let (finder, input) = (FakeWindowFinder::focused(), FakeInput::default());
        let mut guard = armed();
        guard.click(&finder, &input, CENTER).unwrap();
        input.fail_cursor_queries();
        assert!(matches!(
            guard.click(&finder, &input, CENTER),
            Err(Error::AutoModeAborted(AbortReason::CheckFailed))
        ));
        assert_eq!(input.events().len(), 1);
    }

    // ---- User ID privacy ---------------------------------------------------------------

    #[test]
    fn user_id_region_covers_the_measured_text_with_padding() {
        // Bounding box of the User ID text measured on the 16:10 fixtures (see const docs).
        let measured = FracRect::new(0.8861, 0.9850, 0.9715 - 0.8861, 0.9961 - 0.9850);
        let r = USER_ID_REGION;
        assert!(r.is_valid());
        assert!(r.x < measured.x - 0.02, "left padding");
        assert!(r.y < measured.y - 0.005, "top padding");
        assert!(r.x + r.width >= measured.x + measured.width);
        assert!(r.y + r.height >= measured.y + measured.height);
        assert!(r.y > 0.95, "must not cover the Upgrade button");
    }

    #[test]
    fn mask_blacks_out_the_user_id_and_nothing_else() {
        let white = [255, 255, 255, 255];
        let mut frame = Frame::solid(2880, 1800, 0, white).unwrap();
        mask_user_id(&mut frame).unwrap();
        // Centre of the measured text (x 0.93, y 0.99) is black.
        assert_eq!(frame.pixel(2678, 1782), Some(MASK_COLOUR));
        // Bottom-right corner is black.
        assert_eq!(frame.pixel(2879, 1799), Some(MASK_COLOUR));
        // Just outside the region is untouched.
        assert_eq!(frame.pixel(2400, 1782), Some(white));
        assert_eq!(frame.pixel(2678, 1700), Some(white));
    }

    #[test]
    fn crops_overlapping_the_user_id_are_refused() {
        let frame = Frame::solid(100, 100, 0, [1, 2, 3, 255]).unwrap();
        assert!(matches!(
            crop_outside_user_id(&frame, FracRect::new(0.5, 0.5, 0.5, 0.5)),
            Err(Error::InvalidRegion)
        ));
        let ok = crop_outside_user_id(&frame, FracRect::new(0.0, 0.0, 0.5, 0.5)).unwrap();
        assert_eq!((ok.width(), ok.height()), (50, 50));
    }
}
