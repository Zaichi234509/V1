# vfxscan

Point it at a video; it tells you what effects are on it — and shows the
measurements behind every claim.

```bash
python3 -m vfxscan.cli myclip.mp4 -o analysis_out
open analysis_out/REPORT.md
```

## What it detects

| Category | Examples |
|---|---|
| **Colour grade** | lifted / crushed blacks, rolled-off highlights, flat vs punchy contrast, desaturation, vibrance push, teal-and-orange split tone, warm / cool casts |
| **Texture** | film grain & added noise, sharpening halos, bloom / glow, RGB channel split (glitch) vs radial lens chromatic aberration, vignette |
| **Framing** | letterbox / pillarbox bars and the effective aspect ratio |
| **Camera** | locked-off, handheld shake, Ken Burns push, stabilised / keyframed moves, whip pans |
| **Editing** | hard cuts, dissolves, fades to black/white, flashes, freeze frames, duplicate-frame padding, shot rhythm, cuts synced to the beat |
| **Graphics** | burned-in captions, logos, watermarks, changing on-screen text |
| **Audio** | loudness & crest factor, limiting, tempo, whoosh / riser SFX, silence |
| **Pipeline** | codec, colour space, bitrate, editor fingerprints in container metadata |

Every finding carries a **confidence**, the **shot(s) it applies to**, and the
**evidence** — the actual number that triggered it.

## Why it analyses per shot

Real videos are graded shot by shot. A whole-video median hides everything
interesting: a teal grade on one shot and a warm grade on another average out
to neutral. `vfxscan` segments the timeline at every cut, dissolve and fade,
measures each shot alone, then consolidates — so the report says *"letterbox
bars, 1/3 shots: 0:05.1–0:07.9"* instead of missing them entirely.

## Outputs

```
analysis_out/
├── REPORT.md          human-readable findings, timeline, shot breakdown
├── analysis.json      same data, machine-readable
├── timeline.png       exposure / colour / motion / shot-change signals
├── contact_sheet.png  timestamped thumbnail grid
├── scopes.png         key frames with RGB histograms
└── frames/            full-resolution stills, one per shot
```

## How the measurements work

* **Exposure / colour** — per-frame luma percentiles, HSV saturation,
  Hasler–Süsstrunk colorfulness, and R−B separation measured *separately in
  shadows and highlights* (that difference is what split-toning actually is).
* **Grain** — Immerkaer's 3×3 noise estimator, run on a **native-resolution
  crop of the active picture area**. Measuring grain after downscaling filters
  away the signal you're looking for.
* **RGB split vs lens CA** — the horizontal offset that best aligns each
  channel's *normalised gradient map* (raw channels are different pictures, so
  matching them directly measures content, not misalignment). Measured on the
  left and right halves separately: a uniform offset is a deliberate
  chroma-shift effect, an offset that reverses across frame is real glass.
* **Motion** — phase correlation for translation, log-polar phase correlation
  for scale.
* **Shot changes** — Bhattacharyya distance between HSV histograms, then
  classified by signal shape: an isolated spike is a cut, a sustained hump
  whose middle frames blend monotonically from one endpoint to the other is a
  dissolve, a collapse in both luma and contrast is a fade.
* **Bars** are located before anything else, because black letterbox corners
  otherwise fake a heavy vignette and their hard edges fake sharpening halos.

## Self-test

`tests/make_fixture.py` renders a clip with known effects baked in
(documented ground truth: cut at 5.00s, 1s dissolve at 8.00s, 1s fade at
13.00s, plus per-shot grades, grain, vignette, letterbox, an 8px RGB split and
a burned-in caption). `tests/test_detectors.py` scores the detectors against it.

```bash
python3 tests/test_detectors.py     # 15/15 checks
```

The fixture is generated, not committed — it's ~31 MB.

## Limitations

Read them before trusting a number:

* Confidences are **heuristic**. They say how strongly the pixels support a
  reading, not what the editor intended.
* It cannot name a specific LUT, plugin or preset — only the *look* the pixels
  show. Container fingerprints can suggest the app, when the exporter left them.
* Heavy platform compression (TikTok/Reels/YouTube re-encodes) adds banding and
  mosquito noise that can read as intentional grain or sharpening. The report
  flags low bits-per-pixel so you can discount accordingly.
* Dense natural texture (foliage, fractals, fabric) inflates the edge-ringing
  statistic; the sharpening detector is gated but not immune.
* Effects that are purely semantic — rotoscoped masks, object removal,
  face retouching, AI generation — are out of scope.

## Install

```bash
pip install numpy opencv-python-headless matplotlib
```

Plus an `ffmpeg` binary on `PATH` (`pip install imageio-ffmpeg` provides a
static one). Audio analysis is skipped gracefully if ffmpeg is missing.

## Options

```
-o, --out DIR        output directory (default: analysis_out)
-w, --width PX       analysis width, default 384 (higher = slower, more sensitive)
-s, --stride N       analyse every Nth frame — use 2-3 for long videos
    --max-seconds S  stop after S seconds
    --sensitivity F  >1 finds more cuts, <1 fewer
    --no-audio       skip the audio pass
```
