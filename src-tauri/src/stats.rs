//! Small measurement helpers shown on the Diagnostics screen.

use std::collections::VecDeque;
use std::time::{Duration, Instant};

/// Counts events (frames) over a sliding one-second window.
#[derive(Debug, Default)]
pub struct FpsCounter {
    times: VecDeque<Instant>,
}

const WINDOW: Duration = Duration::from_secs(1);

impl FpsCounter {
    /// Records one event at `now`.
    pub fn record(&mut self, now: Instant) {
        self.times.push_back(now);
        self.prune(now);
    }

    /// Events in the second before `now`.
    #[must_use]
    pub fn per_second(&mut self, now: Instant) -> f64 {
        self.prune(now);
        f64::from(u32::try_from(self.times.len()).unwrap_or(u32::MAX))
    }

    /// Forgets everything (capture stopped).
    pub fn reset(&mut self) {
        self.times.clear();
    }

    fn prune(&mut self, now: Instant) {
        while let Some(&oldest) = self.times.front() {
            if now.duration_since(oldest) > WINDOW {
                self.times.pop_front();
            } else {
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_only_the_last_second() {
        let start = Instant::now();
        let mut fps = FpsCounter::default();
        for i in 0..30 {
            fps.record(start + Duration::from_millis(i * 33));
        }
        let now = start + Duration::from_millis(29 * 33);
        assert!((fps.per_second(now) - 30.0).abs() < f64::EPSILON);
        let later = now + Duration::from_secs(2);
        assert!(fps.per_second(later).abs() < f64::EPSILON);
    }

    #[test]
    fn reset_clears_counts() {
        let now = Instant::now();
        let mut fps = FpsCounter::default();
        fps.record(now);
        fps.reset();
        assert!(fps.per_second(now).abs() < f64::EPSILON);
    }
}
