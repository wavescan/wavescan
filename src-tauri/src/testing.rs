//! Fake implementations of the OS traits, for tests. They behave like the real OS in the
//! ways our logic depends on (e.g. a click moves the cursor) and let tests simulate the
//! user, the game window and OS failures.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use crate::error::Error;
use crate::frame::Frame;
use crate::geometry::{Rect, ScreenPoint};
use crate::traits::{
    FrameSource, GameWindow, InputDriver, Key, OcrEngine, OcrLine, WindowFinder, WindowId,
};

/// A fake game window that tests can focus, minimise or close. Thread-safe so it can sit
/// inside `AppState` like the real finder.
pub struct FakeWindowFinder {
    window: Mutex<Option<GameWindow>>,
}

impl FakeWindowFinder {
    /// A focused 2880×1800 game window at screen position (100, 50).
    pub fn focused() -> Self {
        Self {
            window: Mutex::new(Some(GameWindow {
                id: WindowId(42),
                client_rect: Rect::new(100, 50, 2880, 1800),
                scale_factor: 2.0,
                focused: true,
                minimized: false,
            })),
        }
    }

    /// The current window state (panics if closed, test-only).
    pub fn window(&self) -> GameWindow {
        self.window
            .lock()
            .unwrap()
            .clone()
            .expect("window was closed")
    }

    /// Simulates the user clicking another app (or back into the game).
    pub fn set_focused(&self, focused: bool) {
        if let Some(window) = self.window.lock().unwrap().as_mut() {
            window.focused = focused;
        }
    }

    /// Simulates minimising or restoring the game.
    pub fn set_minimized(&self, minimized: bool) {
        if let Some(window) = self.window.lock().unwrap().as_mut() {
            window.minimized = minimized;
        }
    }

    /// Simulates the game closing.
    pub fn close(&self) {
        *self.window.lock().unwrap() = None;
    }
}

impl WindowFinder for FakeWindowFinder {
    fn find_game_window(&self) -> Result<GameWindow, Error> {
        self.window
            .lock()
            .unwrap()
            .clone()
            .ok_or(Error::WindowNotFound)
    }
}

/// An input action recorded by [`FakeInput`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InputEvent {
    /// The game was brought to the front.
    Focus,
    /// A left click at a screen point.
    Click(ScreenPoint),
    /// A wheel scroll at a screen point.
    Scroll(ScreenPoint, i32),
    /// A key press.
    Press(Key),
}

/// Records input instead of sending it, and simulates the cursor. Thread-safe so it can
/// sit inside `AppState` like the real driver.
#[derive(Default)]
pub struct FakeInput {
    state: Mutex<FakeInputState>,
}

#[derive(Default)]
struct FakeInputState {
    events: Vec<InputEvent>,
    cursor: Option<ScreenPoint>,
    reject: bool,
    cursor_query_fails: bool,
}

impl FakeInput {
    /// Everything sent so far, in order.
    pub fn events(&self) -> Vec<InputEvent> {
        self.state.lock().unwrap().events.clone()
    }

    /// Simulates the user moving the mouse.
    pub fn user_moves_cursor_by(&self, dx: i32, dy: i32) {
        let mut state = self.state.lock().unwrap();
        let current = state.cursor.unwrap_or(ScreenPoint::new(0, 0));
        state.cursor = Some(ScreenPoint::new(current.x + dx, current.y + dy));
    }

    /// Makes every input call fail like Windows UIPI blocking an elevated game.
    pub fn reject_input(&self) {
        self.state.lock().unwrap().reject = true;
    }

    /// Makes cursor queries fail.
    pub fn fail_cursor_queries(&self) {
        self.state.lock().unwrap().cursor_query_fails = true;
    }

    fn record(&self, event: InputEvent, moves_to: Option<ScreenPoint>) -> Result<(), Error> {
        let mut state = self.state.lock().unwrap();
        if state.reject {
            return Err(Error::InputBlocked("fake: input rejected".into()));
        }
        if let Some(point) = moves_to {
            state.cursor = Some(point);
        }
        state.events.push(event);
        Ok(())
    }
}

impl InputDriver for FakeInput {
    fn focus(&self, _window: &GameWindow) -> Result<(), Error> {
        self.record(InputEvent::Focus, None)
    }

    fn click(&self, point: ScreenPoint) -> Result<(), Error> {
        self.record(InputEvent::Click(point), Some(point))
    }

    fn scroll(&self, point: ScreenPoint, ticks: i32) -> Result<(), Error> {
        self.record(InputEvent::Scroll(point, ticks), Some(point))
    }

    fn press(&self, key: Key) -> Result<(), Error> {
        self.record(InputEvent::Press(key), None)
    }

    fn cursor_position(&self) -> Result<ScreenPoint, Error> {
        let state = self.state.lock().unwrap();
        if state.cursor_query_fails {
            return Err(Error::CaptureFailed("fake: cursor query failed".into()));
        }
        Ok(state.cursor.unwrap_or(ScreenPoint::new(0, 0)))
    }
}

/// Replays a fixed list of frames, one per [`FakeFrames::advance`].
#[derive(Default)]
pub struct FakeFrames {
    queue: VecDeque<Frame>,
    running: bool,
}

impl FakeFrames {
    /// A source that will deliver `frames` in order.
    pub fn new(frames: impl IntoIterator<Item = Frame>) -> Self {
        Self {
            queue: frames.into_iter().collect(),
            running: false,
        }
    }

    /// Moves to the next frame (like time passing). Keeps the last frame at the end.
    pub fn advance(&mut self) {
        if self.queue.len() > 1 {
            self.queue.pop_front();
        }
    }
}

impl FrameSource for FakeFrames {
    fn start(&mut self, _window: &GameWindow, _max_fps: u32) -> Result<(), Error> {
        self.running = true;
        Ok(())
    }

    fn latest_frame(&self) -> Option<Arc<Frame>> {
        if self.running {
            self.queue.front().cloned().map(Arc::new)
        } else {
            None
        }
    }

    fn fps(&self) -> f64 {
        if self.running { 30.0 } else { 0.0 }
    }

    fn stop(&mut self) {
        self.running = false;
    }
}

/// Returns the same OCR lines for every image.
pub struct FakeOcr {
    lines: Vec<OcrLine>,
}

impl FakeOcr {
    /// An engine that "reads" `lines` from any image.
    pub fn returning(lines: Vec<OcrLine>) -> Self {
        Self { lines }
    }
}

impl OcrEngine for FakeOcr {
    fn recognize(&self, _image: &Frame) -> Result<Vec<OcrLine>, Error> {
        Ok(self.lines.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fake_frames_only_deliver_while_running() {
        let finder = FakeWindowFinder::focused();
        let a = Frame::solid(2, 2, 1, [0; 4]).unwrap();
        let b = Frame::solid(2, 2, 2, [0; 4]).unwrap();
        let mut source = FakeFrames::new([a, b]);
        assert!(source.latest_frame().is_none());
        source.start(&finder.window(), 30).unwrap();
        assert_eq!(source.latest_frame().unwrap().seq(), 1);
        source.advance();
        source.advance();
        assert_eq!(source.latest_frame().unwrap().seq(), 2, "stays on last");
        source.stop();
        assert!(source.latest_frame().is_none());
    }

    #[test]
    fn fake_ocr_returns_its_lines() {
        let line = OcrLine {
            text: "Crit. DMG 15.0%".into(),
            bounds: Rect::new(0, 0, 10, 2),
        };
        let ocr = FakeOcr::returning(vec![line.clone()]);
        let frame = Frame::solid(1, 1, 0, [0; 4]).unwrap();
        assert_eq!(ocr.recognize(&frame).unwrap(), vec![line]);
    }

    #[test]
    fn fake_click_moves_the_cursor() {
        let input = FakeInput::default();
        input.click(ScreenPoint::new(5, 6)).unwrap();
        assert_eq!(input.cursor_position().unwrap(), ScreenPoint::new(5, 6));
    }
}
