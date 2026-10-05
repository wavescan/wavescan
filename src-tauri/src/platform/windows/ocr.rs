//! Text recognition with the OCR engine built into Windows (`Windows.Media.Ocr`, ADR 0004).
//! Runs entirely on this computer; nothing is sent anywhere.

use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine as WinOcrEngine;
use windows::Storage::Streams::DataWriter;
use windows::Win32::System::WinRT::{RO_INIT_MULTITHREADED, RoInitialize};
use windows::core::HSTRING;

use crate::error::Error;
use crate::frame::Frame;
use crate::platform::union_bounds;
use crate::traits::{OcrEngine, OcrLine};

/// Language used for recognition. The game client must be in English for v0.1.
const LANGUAGE: &str = "en-US";

/// Windows' built-in OCR.
pub(super) struct WinRtOcr;

impl OcrEngine for WinRtOcr {
    fn recognize(&self, image: &Frame) -> Result<Vec<OcrLine>, Error> {
        ensure_winrt();
        let engine = english_engine()?;

        let max = WinOcrEngine::MaxImageDimension().map_err(failed)?;
        if image.width() > max || image.height() > max {
            return Err(Error::OcrFailed(format!(
                "image is {}x{}, larger than the OCR limit of {max}px",
                image.width(),
                image.height()
            )));
        }

        let bitmap = to_bitmap(image)?;
        let result = engine
            .RecognizeAsync(&bitmap)
            .map_err(failed)?
            .join()
            .map_err(failed)?;

        let lines = result.Lines().map_err(failed)?;
        let mut out = Vec::new();
        for i in 0..lines.Size().map_err(failed)? {
            let line = lines.GetAt(i).map_err(failed)?;
            let words = line.Words().map_err(failed)?;
            let mut boxes = Vec::new();
            for j in 0..words.Size().map_err(failed)? {
                let r = words
                    .GetAt(j)
                    .map_err(failed)?
                    .BoundingRect()
                    .map_err(failed)?;
                boxes.push((r.X, r.Y, r.Width, r.Height));
            }
            if let Some(bounds) = union_bounds(&boxes) {
                out.push(OcrLine {
                    text: line.Text().map_err(failed)?.to_string_lossy(),
                    bounds,
                });
            }
        }
        Ok(out)
    }
}

/// `WinRT` calls need the calling thread initialised. Tauri runs async commands on worker
/// threads, so initialise here; "already initialised" results are fine to ignore.
fn ensure_winrt() {
    // SAFETY: RoInitialize has no memory-safety preconditions; repeated calls on the same
    // thread return S_FALSE or RPC_E_CHANGED_MODE, both harmless here.
    let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };
}

/// Creates an English OCR engine, explaining how to fix a missing language pack.
fn english_engine() -> Result<WinOcrEngine, Error> {
    let language = Language::CreateLanguage(&HSTRING::from(LANGUAGE)).map_err(failed)?;
    WinOcrEngine::TryCreateFromLanguage(&language).map_err(|_| {
        Error::OcrUnavailable(
            "English text recognition isn't installed. In Windows Settings → Time & \
             language → Language & region, add English (United States)."
                .into(),
        )
    })
}

/// Copies a BGRA frame into a `WinRT` `SoftwareBitmap`.
fn to_bitmap(image: &Frame) -> Result<SoftwareBitmap, Error> {
    let writer = DataWriter::new().map_err(failed)?;
    writer.WriteBytes(image.pixels()).map_err(failed)?;
    let buffer = writer.DetachBuffer().map_err(failed)?;
    let width = i32::try_from(image.width()).map_err(|_| Error::InvalidRegion)?;
    let height = i32::try_from(image.height()).map_err(|_| Error::InvalidRegion)?;
    SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, width, height)
        .map_err(failed)
}

#[allow(
    clippy::needless_pass_by_value,
    reason = "used as a map_err adapter, which passes the error by value"
)]
fn failed(error: windows::core::Error) -> Error {
    Error::OcrFailed(error.message())
}
