//! Developer tool for the screenshots in `fixtures/` (see `docs/fixtures.md`). It isn't
//! part of the app and is never shipped. Two commands:
//!
//! - `mask <in.png> <out.png>`: blacks out the User ID with the same
//!   `safety::mask_user_id` the app uses, so the screenshot can be committed
//!   (`npm run fixtures:mask`).
//! - `ocr <manifest.json> <out.json>`: reads the requested regions of each screenshot with
//!   this OS's OCR engine, through `regions::read` exactly like the app does on a live
//!   frame, and writes the text as JSON. `tests/fixtureReplay.fixtures.ts` runs this
//!   (`npm run test:fixtures`).
//!
//! Run from `src-tauri/` with `cargo run --example fixtures -- <command> ...`.

use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use wavescan_lib::frame::Frame;
use wavescan_lib::regions::{self, RegionRead, RegionText};
use wavescan_lib::{platform, safety};

/// Any error, printed by `main` (this is a developer tool, so a message is enough).
type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

/// One screenshot to read: its path and the regions to OCR (computed on the TS side).
#[derive(Deserialize)]
struct ManifestEntry {
    image: PathBuf,
    regions: Vec<RegionRead>,
}

/// The text read from one screenshot, in the same shape the app's `read_regions` returns.
#[derive(Serialize)]
struct OcrEntry {
    image: PathBuf,
    regions: Vec<RegionText>,
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        [command, input, output] if command == "mask" => mask(Path::new(input), Path::new(output)),
        [command, manifest, output] if command == "ocr" => {
            ocr(Path::new(manifest), Path::new(output))
        }
        _ => Err(
            "usage: fixtures mask <in.png> <out.png> | fixtures ocr <manifest.json> <out.json>"
                .into(),
        ),
    }
}

/// Masks the User ID in `input` and saves the result to `output` as an RGB PNG.
fn mask(input: &Path, output: &Path) -> Result<()> {
    let mut frame = load_png(input)?;
    safety::mask_user_id(&mut frame)?;
    save_png(&frame, output)
}

/// OCRs every manifest entry with the platform OCR engine and writes the results.
/// Refuses a screenshot whose User ID isn't masked, so CI fails if one is committed.
fn ocr(manifest: &Path, output: &Path) -> Result<()> {
    let entries: Vec<ManifestEntry> =
        serde_json::from_reader(BufReader::new(File::open(manifest)?))?;
    let engine = platform::create().ocr;
    let mut results = Vec::with_capacity(entries.len());
    for entry in entries {
        let frame = load_png(&entry.image)?;
        let mut masked = frame.clone();
        safety::mask_user_id(&mut masked)?;
        if masked != frame {
            return Err(format!(
                "{}: the User ID isn't masked. Run `npm run fixtures:mask` (docs/fixtures.md)",
                entry.image.display()
            )
            .into());
        }
        let regions = regions::read(&frame, &entry.regions, engine.as_ref())
            .map_err(|e| format!("{}: {e}", entry.image.display()))?;
        results.push(OcrEntry {
            image: entry.image,
            regions,
        });
    }
    serde_json::to_writer_pretty(BufWriter::new(File::create(output)?), &results)?;
    Ok(())
}

/// Decodes an 8-bit PNG (grey, RGB or RGBA, with or without alpha) into a BGRA frame,
/// the pixel order the capture adapters produce.
fn load_png(path: &Path) -> Result<Frame> {
    let file = BufReader::new(File::open(path).map_err(|e| format!("{}: {e}", path.display()))?);
    let mut decoder = png::Decoder::new(file);
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder.read_info()?;
    let size = reader.output_buffer_size().ok_or("image too large")?;
    let mut buf = vec![0; size];
    let info = reader.next_frame(&mut buf)?;
    buf.truncate(info.buffer_size());

    let channels = match info.color_type {
        png::ColorType::Grayscale => 1,
        png::ColorType::GrayscaleAlpha => 2,
        png::ColorType::Rgb => 3,
        png::ColorType::Rgba => 4,
        png::ColorType::Indexed => return Err("indexed PNG left after expansion".into()),
    };
    let mut bgra = Vec::with_capacity(buf.len() / channels * 4);
    for px in buf.chunks_exact(channels) {
        let (r, g, b) = if channels < 3 {
            (px[0], px[0], px[0])
        } else {
            (px[0], px[1], px[2])
        };
        bgra.extend_from_slice(&[b, g, r, 255]);
    }
    Ok(Frame::from_bgra(info.width, info.height, 0, bgra)?)
}

/// Saves a BGRA frame as an RGB PNG (alpha dropped: captures are opaque).
fn save_png(frame: &Frame, path: &Path) -> Result<()> {
    let mut rgb = Vec::with_capacity(frame.pixels().len() / 4 * 3);
    for px in frame.pixels().as_chunks::<4>().0 {
        rgb.extend_from_slice(&[px[2], px[1], px[0]]);
    }
    let mut encoder = png::Encoder::new(
        BufWriter::new(File::create(path)?),
        frame.width(),
        frame.height(),
    );
    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::High);
    let mut writer = encoder.write_header()?;
    writer.write_image_data(&rgb)?;
    writer.finish()?;
    Ok(())
}
