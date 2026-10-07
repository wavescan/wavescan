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
use wavescan_lib::traits::OcrEngine;
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
        [command, rest @ ..] if command == "experiment" => experiment(rest),
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

// ---- TEMPORARY EXPERIMENT (branch exp/winocr-hp, never merged) ----

/// Pads with `pad` pixels of the crop's top-left colour on every side.
fn exp_pad(f: &Frame, pad: u32) -> Result<Frame> {
    let (w, h) = (f.width() + 2 * pad, f.height() + 2 * pad);
    let bg = f.pixel(0, 0).ok_or("empty")?;
    let mut out = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            let px = if x >= pad && y >= pad && x < pad + f.width() && y < pad + f.height() {
                f.pixel(x - pad, y - pad).ok_or("oob")?
            } else {
                bg
            };
            out.extend_from_slice(&px);
        }
    }
    Ok(Frame::from_bgra(w, h, 0, out)?)
}

/// Nearest-neighbour scale by num/den.
fn exp_scale(f: &Frame, num: u32, den: u32) -> Result<Frame> {
    let (w, h) = (f.width() * num / den, f.height() * num / den);
    let mut out = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            out.extend_from_slice(&f.pixel(x * den / num, y * den / num).ok_or("oob")?);
        }
    }
    Ok(Frame::from_bgra(w, h, 0, out)?)
}

/// `experiment <png> <x> <y> <w> <h>`: OCRs one region with several variants and prints
/// one GitHub annotation line.
#[allow(clippy::print_stdout, reason = "temporary experiment")]
pub fn experiment(args: &[String]) -> Result<()> {
    let [image, x, y, w, h] = args else { return Err("args".into()) };
    let frame = load_png(Path::new(image))?;
    let region = wavescan_lib::geometry::FracRect::new(x.parse()?, y.parse()?, w.parse()?, h.parse()?);
    let crop = frame.crop(region)?;
    let engine = platform::create().ocr;
    let variants: Vec<(&str, Frame)> = vec![
        ("raw", crop.clone()),
        ("pad8", exp_pad(&crop, 8)?),
        ("pad24", exp_pad(&crop, 24)?),
        ("x2", exp_scale(&crop, 2, 1)?),
        ("pad24x2", exp_scale(&exp_pad(&crop, 24)?, 2, 1)?),
        ("half", exp_scale(&crop, 1, 2)?),
        ("pad24half", exp_scale(&exp_pad(&crop, 24)?, 1, 2)?),
    ];
    let mut msg = String::new();
    for (name, v) in variants {
        let lines = engine.recognize(&v)?;
        let texts: Vec<String> = lines.iter().map(|l| l.text.clone()).collect();
        msg.push_str(&format!("{name}: {texts:?} %0A"));
    }
    let base = Path::new(image).file_name().and_then(|s| s.to_str()).unwrap_or("?");
    println!("::warning title=OCR {base} {x},{y}::{msg}");
    Ok(())
}
