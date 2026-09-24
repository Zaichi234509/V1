"""Interpretation layer: turn measurements into named, human-readable effects.

Each detector returns a Finding with a confidence and the evidence that
produced it, so nothing in the final report is an unsupported assertion.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

import cv2
import numpy as np

from .metrics import Track


@dataclass
class Finding:
    name: str
    category: str
    confidence: float
    evidence: str
    where: str = "whole video"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def color_findings(tr: Track) -> list[Finding]:
    out: list[Finding] = []
    p01 = tr.arr("luma_p01")
    p99 = tr.arr("luma_p99")
    lstd = tr.arr("luma_std")
    sat = tr.arr("sat_mean")
    cf = tr.arr("colorfulness")
    s_rb = tr.arr("shadow_rb")
    h_rb = tr.arr("highlight_rb")
    warm = tr.arr("warm_ratio")
    clip_hi = tr.arr("clip_high")
    clip_lo = tr.arr("clip_low")

    black = float(np.median(p01))
    white = float(np.median(p99))

    # --- lifted blacks / matte-film look ---
    if black > 26:
        out.append(Finding(
            "Lifted blacks (matte / faded film curve)", "Color grade",
            min(0.95, 0.55 + black / 90),
            f"1st-percentile luma sits at {black:.0f}/255 instead of ~0 — the shadows "
            f"are floated, the classic 'faded film' or S-curve-with-lifted-toe look"))
    elif black < 3 and float(np.median(clip_lo)) > 0.02:
        out.append(Finding(
            "Crushed blacks", "Color grade", 0.7,
            f"{_pct(float(np.median(clip_lo)))} of pixels sit at pure black — "
            f"contrast pushed until the toe clips"))

    if white < 228:
        out.append(Finding(
            "Rolled-off / compressed highlights", "Color grade", 0.65,
            f"99th-percentile luma only reaches {white:.0f}/255 — highlights pulled "
            f"down, low-contrast or 'log-ish' finish"))
    elif float(np.median(clip_hi)) > 0.03:
        out.append(Finding(
            "Blown highlights", "Color grade", 0.6,
            f"{_pct(float(np.median(clip_hi)))} of pixels clipped at white"))

    dr = white - black
    if dr < 150:
        out.append(Finding(
            "Low-contrast / flat grade", "Color grade", 0.7,
            f"usable luma range is only {dr:.0f}/255 (median frame contrast σ={np.median(lstd):.0f})"))
    elif dr > 235 and float(np.median(lstd)) > 62:
        out.append(Finding(
            "High-contrast / punchy grade", "Color grade", 0.6,
            f"luma spans {dr:.0f}/255 with high per-frame σ={np.median(lstd):.0f}"))

    msat = float(np.median(sat))
    if msat < 32:
        out.append(Finding(
            "Desaturated / near-monochrome", "Color grade", 0.8,
            f"median HSV saturation {msat:.0f}/255"))
    elif msat > 120:
        out.append(Finding(
            "Heavily saturated / vibrance push", "Color grade", 0.75,
            f"median HSV saturation {msat:.0f}/255, colorfulness index {np.median(cf):.0f}"))

    # --- split toning ---
    ds = float(np.median(s_rb))
    dh = float(np.median(h_rb))
    if ds < -6 and dh > 6:
        out.append(Finding(
            "Teal-and-orange split tone", "Color grade", 0.85,
            f"shadows lean blue (R−B = {ds:+.1f}) while highlights lean warm "
            f"(R−B = {dh:+.1f}) — the standard blockbuster/creator split-tone"))
    elif ds > 6 and dh < -6:
        out.append(Finding(
            "Inverted split tone (warm shadows, cool highlights)", "Color grade", 0.75,
            f"shadows R−B = {ds:+.1f}, highlights R−B = {dh:+.1f}"))
    elif abs(ds - dh) > 10:
        out.append(Finding(
            "Split toning present", "Color grade", 0.55,
            f"shadow/highlight colour separation of {abs(ds - dh):.1f} in R−B"))

    mw = float(np.median(warm))
    if mw > 1.11:
        out.append(Finding(
            "Warm white balance / orange cast", "Color grade", 0.7,
            f"mean R/B ratio {mw:.2f} across the video"))
    elif mw < 0.90:
        out.append(Finding(
            "Cool white balance / blue cast", "Color grade", 0.7,
            f"mean R/B ratio {mw:.2f} across the video"))

    return out


def texture_findings(tr: Track, height: int) -> list[Finding]:
    out: list[Finding] = []
    noise = tr.arr("noise")
    halo = tr.arr("halo")
    glow = tr.arr("glow")
    ca = tr.arr("ca")
    vig = tr.arr("vignette")

    mn = float(np.median(noise))
    if mn > 3.4:
        strength = "heavy" if mn > 7 else "moderate"
        out.append(Finding(
            "Film grain / added noise", "Texture",
            min(0.9, 0.5 + mn / 20),
            f"{strength} — Immerkaer noise estimate σ={mn:.1f} on native-resolution "
            f"centre crops (clean digital footage is typically < 2.5)"))
    elif mn < 0.9:
        out.append(Finding(
            "Denoised / very clean image", "Texture", 0.6,
            f"noise estimate σ={mn:.2f} — heavy noise reduction, or a synthetic/"
            f"graphics source"))

    # Grain inflates the edge-ringing statistic, so only trust it on clean-ish
    # footage — otherwise we report "sharpening" on every noisy clip.
    # Genuine unsharp-mask ringing lands roughly in 1.8-4.0x. Beyond that the
    # statistic is being driven by dense natural texture, not by a filter.
    med_edge = float(np.median(tr.arr("edge_density"))) if tr.edge_density else 0.0
    mh = float(np.median(halo))
    if 1.85 < mh < 4.0 and mn < 4.0 and med_edge < 0.11:
        out.append(Finding(
            "Sharpening halos", "Texture", min(0.8, 0.35 + (mh - 1.8)),
            f"edge-adjacent detail energy is {mh:.2f}x the frame average — ringing "
            f"typical of an unsharp-mask / 'clarity' pass or aggressive re-encode"))

    mg = float(np.median(glow))
    if mg > 1.38:
        out.append(Finding(
            "Bloom / glow on highlights", "Texture", min(0.8, 0.3 + (mg - 1.35) * 1.5),
            f"pixels ringing bright highlights are {mg:.2f}x brighter than the "
            f"surrounding field — diffusion filter, bloom, or 'dreamy' glow effect"))

    # Uniform shift  = deliberate RGB-split / glitch / anamorphic filter.
    # Radial shift   = real lens chromatic aberration.
    radial = tr.arr("ca_radial") if tr.ca_radial else np.zeros(1)
    mc = float(np.median(ca))
    mr = float(np.median(radial))
    if mc > 0.45 and mc >= mr:
        out.append(Finding(
            "RGB channel split (glitch / chroma-shift effect)", "Texture",
            min(0.85, 0.35 + mc / 2),
            f"red and blue planes sit {mc:.2f}px apart in the same direction across "
            f"the whole frame — a deliberate chroma-shift, not lens behaviour"))
    elif mr > 0.45:
        out.append(Finding(
            "Chromatic aberration (lens or simulated lens)", "Texture",
            min(0.8, 0.3 + mr / 2),
            f"R/B separation reverses between the left and right of frame "
            f"({mr:.2f}px radial) — the radial signature of real glass or a lens-sim filter"))

    mv = float(np.median(vig))
    if mv < 0.82:
        out.append(Finding(
            "Vignette", "Texture", min(0.9, 0.4 + (0.85 - mv) * 3),
            f"corners are {(1 - mv) * 100:.0f}% darker than frame centre"))
    elif mv > 1.14:
        out.append(Finding(
            "Inverse vignette / centre darkening", "Texture", 0.5,
            f"corners are {(mv - 1) * 100:.0f}% brighter than centre"))

    return out


def framing_findings(tr: Track, width: int, height: int, analysis_width: int) -> list[Finding]:
    out: list[Finding] = []
    n = len(tr)
    if n == 0:
        return out
    sx = width / float(analysis_width)
    ah = int(round(height / sx))

    bt = np.asarray(tr.bar_top, dtype=float)
    bb = np.asarray(tr.bar_bottom, dtype=float)
    bl = np.asarray(tr.bar_left, dtype=float)
    br = np.asarray(tr.bar_right, dtype=float)

    top, bot = float(np.median(bt)), float(np.median(bb))
    left, right = float(np.median(bl)), float(np.median(br))

    if top + bot > 0.04 * ah and abs(top - bot) < max(3.0, 0.02 * ah):
        frac = (top + bot) / ah
        inner = height * (1 - frac)
        ar = width / inner if inner > 1 else 0
        out.append(Finding(
            "Letterbox bars (cinematic crop)", "Framing", 0.85,
            f"matching black bars top & bottom covering {_pct(frac)} of frame height — "
            f"effective aspect ratio ≈ {ar:.2f}:1"))
    if left + right > 0.04 * analysis_width and abs(left - right) < max(3.0, 0.02 * analysis_width):
        frac = (left + right) / analysis_width
        out.append(Finding(
            "Pillarbox bars", "Framing", 0.8,
            f"matching black bars left & right covering {_pct(frac)} of frame width — "
            f"horizontal source placed in a vertical/square canvas"))

    dx = tr.arr("dx")
    dy = tr.arr("dy")
    zoom = tr.arr("zoom")
    mot = tr.arr("motion")

    zsteady = float((np.abs(zoom - 1.0) < 0.0015).mean())
    still = float((mot < 0.25).mean())
    if still > 0.85 and zsteady > 0.7:
        out.append(Finding(
            "Locked-off / static camera", "Camera", 0.75,
            f"{_pct(still)} of frames show < 0.25px global motion and no scale change"))

    zdev = np.abs(zoom - 1.0)
    slow_zoom = float((zdev > 0.0006).mean())
    if slow_zoom > 0.55 and float(np.median(zdev)) < 0.01:
        direction = "in" if float(np.mean(zoom - 1.0)) > 0 else "out"
        out.append(Finding(
            f"Continuous slow zoom / Ken Burns push-{direction}", "Camera", 0.65,
            f"{_pct(slow_zoom)} of frames carry a sub-1% scale change in a "
            f"consistent direction"))

    # handheld shake: high-frequency, low-bias translation
    if n > 20:
        hf = np.abs(np.diff(dx)) + np.abs(np.diff(dy))
        bias = np.hypot(float(np.mean(dx)), float(np.mean(dy)))
        if float(np.median(hf)) > 0.8 and bias < 0.6:
            out.append(Finding(
                "Handheld shake (or added camera-shake effect)", "Camera", 0.6,
                f"median frame-to-frame jitter {np.median(hf):.2f}px with no net drift"))
        elif float(np.median(hf)) < 0.12 and float(np.median(mot)) > 0.4:
            out.append(Finding(
                "Stabilised or keyframed camera move", "Camera", 0.55,
                f"steady motion ({np.median(mot):.2f}px/frame) with almost no jitter "
                f"({np.median(hf):.2f}px) — warp-stabilised or animated in the timeline"))

    return out


def overlay_findings(thumbs: list[np.ndarray], times: list[float]) -> list[Finding]:
    """Static graphics, watermarks and burned-in text via temporal variance."""
    out: list[Finding] = []
    if len(thumbs) < 6:
        return out
    h = min(t.shape[0] for t in thumbs)
    w = min(t.shape[1] for t in thumbs)
    stack = np.stack([cv2.cvtColor(t[:h, :w], cv2.COLOR_BGR2GRAY) for t in thumbs]).astype(np.float32)

    std = stack.std(axis=0)
    mean = stack.mean(axis=0)
    static = std < 6.0
    edges = cv2.Canny(mean.astype(np.uint8), 60, 180) > 0
    static_edges = static & edges

    if static_edges.sum() < 12:
        return out

    num, labels, stats, _ = cv2.connectedComponentsWithStats(
        cv2.dilate(static_edges.astype(np.uint8), np.ones((3, 3), np.uint8)), 8)

    thirds = {"top": 0, "middle": 0, "bottom": 0}
    blobs = 0
    for k in range(1, num):
        x, y, bw, bh, area = stats[k]
        if area < 8 or bw > 0.9 * w or bh > 0.9 * h:
            continue
        blobs += 1
        cy = y + bh / 2
        if cy < h / 3:
            thirds["top"] += 1
        elif cy < 2 * h / 3:
            thirds["middle"] += 1
        else:
            thirds["bottom"] += 1

    if blobs >= 3:
        zone = max(thirds, key=thirds.get)
        cover = float(static_edges.mean())
        out.append(Finding(
            "Persistent overlay (burned-in text, caption bar, logo or watermark)",
            "Graphics", min(0.85, 0.35 + blobs / 40),
            f"{blobs} edge clusters hold still for the whole video (temporal σ < 6), "
            f"concentrated in the {zone} third, covering {_pct(cover)} of the frame"))

    # busy, changing graphics => captions / motion text
    ed = np.array([float((cv2.Canny(cv2.cvtColor(t[:h, :w], cv2.COLOR_BGR2GRAY), 60, 180) > 0).mean())
                   for t in thumbs])
    if ed.mean() > 0.075 and ed.std() > 0.012:
        out.append(Finding(
            "On-screen text / motion graphics that change over time", "Graphics", 0.55,
            f"edge density averages {_pct(float(ed.mean()))} of pixels and swings "
            f"±{_pct(float(ed.std()))} — text or graphic elements appearing and leaving"))

    return out


def consolidate(per_shot: list[tuple[tuple[float, float], list[Finding]]],
                n_shots: int) -> list[Finding]:
    """Fold per-shot findings into one list, remembering *where* each applies.

    Whole-video medians hide anything that only happens in one shot — a teal
    grade on shot 2, letterbox bars on shot 5. Analysing each shot separately
    and then consolidating keeps those visible.
    """
    def _ts(x: float) -> str:
        m, s = divmod(max(0.0, x), 60)
        return f"{int(m)}:{s:04.1f}"

    buckets: dict[str, list[tuple[tuple[float, float], Finding]]] = {}
    for span, flist in per_shot:
        for f in flist:
            buckets.setdefault(f.name, []).append((span, f))

    out: list[Finding] = []
    for name, entries in buckets.items():
        spans = [e[0] for e in entries]
        fs = [e[1] for e in entries]
        best = max(fs, key=lambda f: f.confidence)
        coverage = len(entries) / max(1, n_shots)
        if n_shots <= 1 or coverage >= 0.8:
            where = "whole video"
            conf = best.confidence
        else:
            shown = ", ".join(f"{_ts(a)}–{_ts(b)}" for a, b in spans[:4])
            if len(spans) > 4:
                shown += f" (+{len(spans) - 4} more)"
            where = f"{len(spans)}/{n_shots} shots: {shown}"
            conf = best.confidence * (0.82 + 0.18 * coverage)
        out.append(Finding(name, best.category, round(conf, 2), best.evidence, where))
    return out


def pacing_findings(events: list, duration: float) -> list[Finding]:
    out: list[Finding] = []
    cuts = sorted(e.t_end for e in events if e.kind == "hard_cut")
    softs = [e for e in events if e.kind in {"dissolve", "fade_black", "fade_white"}]
    total_transitions = len(cuts) + len(softs)
    if duration <= 0:
        return out

    per_min = total_transitions / (duration / 60.0)
    if total_transitions >= 2:
        shots = np.diff([0.0] + cuts + [duration])
        med = float(np.median(shots))
        if per_min > 40:
            label, conf = "Rapid-fire cutting", 0.8
        elif per_min > 15:
            label, conf = "Fast-paced editing", 0.7
        else:
            label, conf = "Measured / long-take editing", 0.6
        out.append(Finding(
            label, "Editing", conf,
            f"{total_transitions} transitions in {duration:.1f}s "
            f"({per_min:.0f}/min), median shot length {med:.2f}s"))

    if softs:
        kinds = {}
        for s in softs:
            kinds[s.kind] = kinds.get(s.kind, 0) + 1
        desc = ", ".join(f"{v}x {k.replace('_', ' ')}" for k, v in kinds.items())
        out.append(Finding(
            "Soft transitions in use", "Editing", 0.75,
            f"{desc} — the editor is blending shots, not only butt-cutting"))

    return out
