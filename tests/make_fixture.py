#!/usr/bin/env python3
"""Build a test clip whose effects we know exactly, to validate the detectors.

Ground truth baked into the fixture
-----------------------------------
Shot A  0.0 –  5.0s : warm grade, lifted blacks, vignette, film grain, slow zoom-in
HARD CUT at 5.0s
Shot B  5.0 –  8.0s : cool/teal grade, letterbox bars, static camera, RGB split
DISSOLVE 8.0 –  9.0s (1.0s crossfade)
Shot C  9.0 – 13.0s : desaturated, burned-in text overlay + corner watermark, heavy grain
FADE TO BLACK 13.0 – 14.0s
Audio: 110 BPM pulse + a pink-noise whoosh at 7.5-8.1s, just before the dissolve
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

W, H, FPS = 854, 480, 30


def sh(args: list[str]) -> None:
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr[-4000:])
        raise SystemExit(f"ffmpeg failed: {' '.join(args[:6])} ...")


def _make_text_png(path: str, text: str, w: int, h: int) -> None:
    """Caption bar + logo mark as a transparent PNG (stands in for drawtext)."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(FONT, 38)
        small = ImageFont.truetype(FONT, 20)
    except OSError:
        font = small = ImageFont.load_default()

    box = d.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    x, y = (w - tw) // 2, h - th - 60
    d.rectangle([x - 18, y - 14, x + tw + 18, y + th + 16], fill=(0, 0, 0, 150))
    d.text((x, y), text, font=font, fill=(255, 255, 255, 255))
    # static "watermark" in the corner, present the whole shot
    d.text((w - 150, 22), "@fixture", font=small, fill=(255, 255, 255, 190))
    img.save(path)


def build(out: str = "tests/fixture_known_effects.mp4") -> str:
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    tmp = os.path.join(os.path.dirname(out) or ".", "_tmp")
    os.makedirs(tmp, exist_ok=True)

    a = os.path.join(tmp, "a.mp4")
    b = os.path.join(tmp, "b.mp4")
    c = os.path.join(tmp, "c.mp4")

    # ---- Shot A: warm, lifted blacks, vignette, grain, slow zoom in ----
    sh([FFMPEG, "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", f"testsrc2=size={W*2}x{H*2}:rate={FPS}:duration=5",
        "-vf", (
            f"zoompan=z='min(zoom+0.0012,1.35)':d=1:s={W}x{H}:fps={FPS},"
            "eq=contrast=0.85:brightness=0.06:saturation=1.25,"
            "colorchannelmixer=rr=1.10:bb=0.88,"
            "curves=all='0/0.13 0.5/0.55 1/0.95',"
            "vignette=angle=PI/4.2,"
            "noise=alls=16:allf=t+u"
        ),
        "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", a])

    # ---- Shot B: cool/teal, letterbox, RGB split, static ----
    sh([FFMPEG, "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", f"mandelbrot=size={W}x{int(H*0.78)}:rate={FPS}",
        "-t", "4",
        "-vf", (
            "eq=contrast=1.25:saturation=0.8,"
            "colorchannelmixer=rr=0.85:gg=1.02:bb=1.22,"
            "rgbashift=rh=4:bh=-4,"
            f"pad={W}:{H}:0:(oh-ih)/2:black"
        ),
        "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", b])

    # ---- Shot C: desaturated, text overlay, heavy grain ----
    # This ffmpeg build has no drawtext, so render the caption with PIL and
    # composite it as an RGBA overlay.
    overlay_png = os.path.join(tmp, "overlay.png")
    _make_text_png(overlay_png, "GROUND TRUTH OVERLAY", W, H)
    sh([FFMPEG, "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", f"testsrc=size={W}x{H}:rate={FPS}:duration=6",
        "-i", overlay_png,
        "-filter_complex", (
            "[0:v]eq=saturation=0.12:contrast=1.1[base];"
            "[base][1:v]overlay=0:0[ov];"
            "[ov]noise=alls=26:allf=t+u[v]"
        ),
        "-map", "[v]", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", c])

    # ---- assemble: A |hard cut| B |1s dissolve| C |1s fade to black| ----
    # xfade demands identical timebases on both pads -> normalise first.
    tb = f"fps={FPS},settb=1/{FPS},format=yuv420p"
    filt = (
        f"[0:v]{tb}[a0];[1:v]{tb}[a1];[2:v]{tb}[a2];"
        "[a0][a1]concat=n=2:v=1:a=0[ab];"
        f"[ab]{tb}[abt];"
        "[abt][a2]xfade=transition=fade:duration=1:offset=8[v0];"
        "[v0]fade=t=out:st=13:d=1[v]"
    )
    # 110 BPM click + whoosh at 8.4s
    aexpr = (
        "sine=frequency=220:duration=14[t1];"
        "sine=frequency=55:duration=14[t2];"
        "[t1][t2]amix=inputs=2[tone];"
        "anoisesrc=d=14:c=pink:a=0.28[nz];"
        "[nz]volume='if(between(t,7.5,8.1),1,0)':eval=frame[wh];"
        "[tone]volume='0.35*(1+0.9*sin(2*PI*t*110/60))':eval=frame[clk];"
        "[clk][wh]amix=inputs=2:normalize=0[a]"
    )
    sh([FFMPEG, "-y", "-loglevel", "error",
        "-i", a, "-i", b, "-i", c,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-filter_complex", filt + ";" + aexpr,
        "-map", "[v]", "-map", "[a]", "-t", "14",
        "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-metadata", "comment=made with vfxscan fixture generator",
        out])

    shutil.rmtree(tmp, ignore_errors=True)
    return out


GROUND_TRUTH = {
    "hard_cut": [5.0],
    "dissolve": [(8.0, 9.0)],
    "fade_black": [(13.0, 14.0)],
    "effects": [
        "warm grade", "lifted blacks", "vignette", "film grain", "slow zoom in",
        "cool/teal grade", "letterbox bars", "RGB split (rgbashift rh=4 bh=-4, i.e. 8px R-B separation)",
        "desaturation", "burned-in text overlay",
    ],
}


if __name__ == "__main__":
    path = build(sys.argv[1] if len(sys.argv) > 1 else "tests/fixture_known_effects.mp4")
    print(f"wrote {path} ({os.path.getsize(path) / 1e6:.2f} MB)")
    print("ground truth:", GROUND_TRUTH)
