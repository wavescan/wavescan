//! The app's error type, and how errors are sent to the UI.

use serde::ser::SerializeStruct;

/// Everything that can go wrong in a command or at startup.
///
/// Each variant is sent to the UI as `{ kind, message }` (see `src/ipc/types.ts`), so the
/// UI can show a specific explanation for each `kind`. New variants are added as features
/// land (window not found, permission denied, and so on).
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The app couldn't start (window or webview creation failed).
    #[error("the app could not start: {0}")]
    Startup(String),
}

impl Error {
    /// Short, stable identifier for the error, used by the UI to pick a message.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Error::Startup(_) => "Startup",
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
}
