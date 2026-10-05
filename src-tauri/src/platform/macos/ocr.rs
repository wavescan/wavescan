//! Text recognition with Apple's Vision framework (`VNRecognizeTextRequest`, ADR 0004).
//! Runs entirely on this Mac; nothing is sent anywhere.

use objc2::AnyThread;
use objc2::rc::{Retained, autoreleasepool};
use objc2_core_foundation::CFData;
use objc2_core_graphics::{
    CGBitmapInfo, CGColorRenderingIntent, CGColorSpace, CGDataProvider, CGImage, CGImageAlphaInfo,
    CGImageByteOrderInfo,
};
use objc2_foundation::{NSArray, NSDictionary, NSString};
use objc2_vision::{
    VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
};

use crate::error::Error;
use crate::frame::{BYTES_PER_PIXEL, Frame};
use crate::platform::union_bounds;
use crate::traits::{OcrEngine, OcrLine};

/// Language used for recognition. The game client must be in English for v0.1.
const LANGUAGE: &str = "en-US";

/// Apple Vision text recognition.
pub(super) struct VisionOcr;

impl OcrEngine for VisionOcr {
    fn recognize(&self, image: &Frame) -> Result<Vec<OcrLine>, Error> {
        // Vision returns autoreleased objects; drain them on this (worker) thread.
        autoreleasepool(|_| recognize(image))
    }
}

fn recognize(image: &Frame) -> Result<Vec<OcrLine>, Error> {
    let cg_image = to_cg_image(image)?;

    let request = VNRecognizeTextRequest::new();
    request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
    // Game text is names and numbers; dictionary "correction" only makes it worse.
    request.setUsesLanguageCorrection(false);
    request.setRecognitionLanguages(&NSArray::from_retained_slice(&[NSString::from_str(
        LANGUAGE,
    )]));

    // SAFETY: `cg_image` is a valid CGImage that outlives the handler, and an empty
    // options dictionary is allowed.
    let handler = unsafe {
        VNImageRequestHandler::initWithCGImage_options(
            VNImageRequestHandler::alloc(),
            &cg_image,
            &NSDictionary::new(),
        )
    };
    let as_request: Retained<VNRequest> =
        Retained::into_super(Retained::into_super(request.clone()));
    handler
        .performRequests_error(&NSArray::from_retained_slice(&[as_request]))
        .map_err(|e| Error::OcrFailed(e.localizedDescription().to_string()))?;

    let (width, height) = (f64::from(image.width()), f64::from(image.height()));
    let mut lines = Vec::new();
    for observation in request.results().unwrap_or_default() {
        let Some(best) = observation.topCandidates(1).firstObject() else {
            continue;
        };
        // SAFETY: plain property read on a valid observation.
        let b = unsafe { observation.boundingBox() };
        // Vision uses normalised coordinates with the origin at the bottom-left; convert
        // to pixels with the origin at the top-left like the rest of the app.
        let rect = (
            to_f32(b.origin.x * width),
            to_f32((1.0 - b.origin.y - b.size.height) * height),
            to_f32(b.size.width * width),
            to_f32(b.size.height * height),
        );
        if let Some(bounds) = union_bounds(&[rect]) {
            lines.push(OcrLine {
                text: best.string().to_string(),
                bounds,
            });
        }
    }
    lines.sort_by_key(|line| (line.bounds.y, line.bounds.x));
    Ok(lines)
}

/// Wraps BGRA pixels in a `CGImage` (32-bit little-endian, premultiplied alpha first,
/// which is BGRA in memory).
fn to_cg_image(image: &Frame) -> Result<objc2_core_foundation::CFRetained<CGImage>, Error> {
    let failed = || Error::OcrFailed("couldn't prepare the image for text recognition".into());
    let data = CFData::from_bytes(image.pixels());
    let provider = CGDataProvider::with_cf_data(Some(&data)).ok_or_else(failed)?;
    let colour_space = CGColorSpace::new_device_rgb().ok_or_else(failed)?;
    let width = image.width() as usize;
    let height = image.height() as usize;
    let bitmap_info = CGBitmapInfo(
        CGImageAlphaInfo::PremultipliedFirst.0 | CGImageByteOrderInfo::Order32Little.0,
    );
    // SAFETY: the provider holds exactly width*height*4 bytes (guaranteed by `Frame`), the
    // row stride matches, and `decode` may be null.
    unsafe {
        CGImage::new(
            width,
            height,
            8,
            8 * BYTES_PER_PIXEL,
            width * BYTES_PER_PIXEL,
            Some(&colour_space),
            bitmap_info,
            Some(&provider),
            std::ptr::null(),
            false,
            CGColorRenderingIntent::RenderingIntentDefault,
        )
    }
    .ok_or_else(failed)
}

#[allow(
    clippy::cast_possible_truncation,
    reason = "pixel coordinates within an image whose size fits in u32"
)]
fn to_f32(value: f64) -> f32 {
    value as f32
}
