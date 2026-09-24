"""Report rendering: markdown, charts, contact sheet, reference stills."""

from __future__ import annotations

import os
from typing import Any

import cv2
import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

plt.rcParams.update({
    "figure.facecolor": "#12141a",
    "axes.facecolor": "#12141a",
    "savefig.facecolor": "#12141a",
    "text.color": "#e8e8ec",
    "axes.labelcolor": "#e8e8ec",
    "axes.edgecolor": "#3a3f4b",
    "xtick.color": "#a8adb8",
    "ytick.color": "#a8adb8",
    "grid.color": "#262a33",
    "font.size": 9,
})


def _ts(t: float) -> str:
    m, s = divmod(max(0.0, t), 60)
    return f"{int(m):d}:{s:05.2f}"


def timeline_chart(tr, events, out_png: str, duration: float) -> str:
    t = tr.arr("t")
    fig, axes = plt.subplots(4, 1, figsize=(12, 9), sharex=True)

    cuts = [e.t_end for e in events if e.kind == "hard_cut"]
    softs = [e for e in events if e.kind in {"dissolve", "fade_black", "fade_white"}]

    ax = axes[0]
    ax.plot(t, tr.arr("luma_mean"), lw=1.1, color="#f2c14e", label="mean luma")
    ax.fill_between(t, tr.arr("luma_p01"), tr.arr("luma_p99"), color="#f2c14e", alpha=0.16,
                    label="1st–99th pct")
    ax.set_ylabel("luma 0–255")
    ax.set_ylim(-5, 260)
    ax.legend(loc="upper right", fontsize=7, framealpha=0.2)
    ax.set_title("Exposure & contrast over time", loc="left", fontsize=10)

    ax = axes[1]
    ax.plot(t, tr.arr("sat_mean"), lw=1.1, color="#4ec9b0", label="saturation")
    ax.plot(t, tr.arr("colorfulness"), lw=1.0, color="#c586c0", label="colorfulness")
    ax.set_ylabel("colour")
    ax.legend(loc="upper right", fontsize=7, framealpha=0.2)
    ax.set_title("Colour intensity", loc="left", fontsize=10)

    ax = axes[2]
    ax.plot(t, tr.arr("motion"), lw=1.0, color="#6aa9ff", label="global motion px/f")
    ax.plot(t, (tr.arr("zoom") - 1.0) * 500, lw=1.0, color="#ff8c6a", alpha=0.85,
            label="zoom rate (x500)")
    ax.set_ylabel("motion")
    ax.legend(loc="upper right", fontsize=7, framealpha=0.2)
    ax.set_title("Camera / subject movement", loc="left", fontsize=10)

    ax = axes[3]
    ax.plot(t, tr.arr("hist_dist"), lw=1.0, color="#ff6b6b", label="frame-to-frame Δ")
    ax.set_ylabel("Δ histogram")
    ax.set_xlabel("time (s)")
    ax.legend(loc="upper right", fontsize=7, framealpha=0.2)
    ax.set_title("Shot-change signal", loc="left", fontsize=10)

    for ax in axes:
        ax.grid(alpha=0.25, lw=0.5)
        for c in cuts:
            ax.axvline(c, color="#ffffff", alpha=0.35, lw=0.8)
        for s in softs:
            ax.axvspan(s.t_start, s.t_end, color="#6aa9ff", alpha=0.18)
        ax.set_xlim(0, max(duration, float(t[-1]) if len(t) else 1))

    fig.tight_layout()
    fig.savefig(out_png, dpi=110)
    plt.close(fig)
    return out_png


def scopes_chart(frames: list[np.ndarray], labels: list[str], out_png: str) -> str | None:
    if not frames:
        return None
    n = min(len(frames), 5)
    fig, axes = plt.subplots(2, n, figsize=(3.1 * n, 5.2))
    if n == 1:
        axes = np.array([[axes[0]], [axes[1]]])
    for k in range(n):
        f = frames[k]
        axes[0, k].imshow(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
        axes[0, k].set_title(labels[k], fontsize=8)
        axes[0, k].axis("off")
        ax = axes[1, k]
        for ch, col in zip(range(3), ("#6aa9ff", "#4ec9b0", "#ff6b6b")):  # B,G,R
            h = cv2.calcHist([f], [ch], None, [64], [0, 256]).ravel()
            h = h / (h.sum() + 1e-9)
            ax.plot(np.linspace(0, 255, 64), h, color=col, lw=1.1)
        ax.set_yticks([])
        ax.grid(alpha=0.2, lw=0.5)
        ax.set_xlabel("RGB histogram", fontsize=7)
    fig.tight_layout()
    fig.savefig(out_png, dpi=110)
    plt.close(fig)
    return out_png


def contact_sheet(thumbs: list[np.ndarray], times: list[float], out_png: str,
                  cols: int = 8, max_tiles: int = 48) -> str | None:
    if not thumbs:
        return None
    step = max(1, len(thumbs) // max_tiles)
    sel = list(zip(thumbs, times))[::step][:max_tiles]
    h = max(t.shape[0] for t, _ in sel)
    w = max(t.shape[1] for t, _ in sel)
    rows = (len(sel) + cols - 1) // cols
    pad = 4
    sheet = np.full((rows * (h + 18 + pad) + pad, cols * (w + pad) + pad, 3), 18, np.uint8)
    for k, (img, tt) in enumerate(sel):
        r, c = divmod(k, cols)
        y = pad + r * (h + 18 + pad)
        x = pad + c * (w + pad)
        ih, iw = img.shape[:2]
        sheet[y:y + ih, x:x + iw] = img
        cv2.putText(sheet, _ts(tt), (x + 2, y + h + 13), cv2.FONT_HERSHEY_SIMPLEX,
                    0.38, (200, 205, 215), 1, cv2.LINE_AA)
    cv2.imwrite(out_png, sheet)
    return out_png


CATEGORY_ORDER = ["Color grade", "Texture", "Framing", "Camera", "Graphics",
                  "Editing", "Audio", "Pipeline"]

EVENT_LABEL = {
    "hard_cut": "Hard cut",
    "dissolve": "Dissolve / crossfade",
    "fade_black": "Fade through black",
    "fade_white": "Fade through white",
    "flash": "Flash / light-leak hit",
    "whip_pan": "Whip pan / motion-blur transition",
    "zoom_in": "Zoom / punch in",
    "zoom_out": "Zoom out",
    "freeze_frame": "Freeze frame",
    "frame_padding": "Duplicate-frame padding",
}


def render_markdown(ctx: dict[str, Any]) -> str:
    p = ctx["probe"]
    findings = ctx["findings"]
    events = ctx["events"]
    audio = ctx["audio"]
    dur = p.duration_s or ctx["track_duration"]

    L: list[str] = []
    A = L.append

    A(f"# Video effects analysis — `{os.path.basename(p.path)}`")
    A("")
    A(f"*{dur:.2f}s · {p.video.width}×{p.video.height} · {p.video.fps or p.video.tbr:.2f} fps · "
      f"{p.video.codec} · {p.filesize_mb:.1f} MB*")
    A("")

    # ---------- headline ----------
    A("## What's on this video")
    A("")
    if not findings:
        A("No strong effect signatures detected — this reads as unprocessed footage.")
    else:
        by_cat: dict[str, list] = {}
        for f in findings:
            by_cat.setdefault(f.category, []).append(f)
        for cat in CATEGORY_ORDER:
            if cat not in by_cat:
                continue
            A(f"### {cat}")
            A("")
            A("| Effect | Confidence | Where | Evidence |")
            A("|---|---|---|---|")
            for f in sorted(by_cat[cat], key=lambda x: -x.confidence):
                n = int(round(f.confidence * 5))
                bar = "●" * n + "○" * (5 - n)
                A(f"| **{f.name}** | {bar} {f.confidence:.0%} | {f.where} | {f.evidence} |")
            A("")

    # ---------- timeline ----------
    shots = ctx.get("shots") or []
    if len(shots) > 1:
        A(f"## Shot breakdown ({len(shots)} shots)")
        A("")
        A("| # | In | Out | Length |")
        A("|---|---|---|---|")
        for k, (a, b) in enumerate(shots, 1):
            A(f"| {k} | `{_ts(a)}` | `{_ts(b)}` | {b - a:.2f}s |")
        A("")

    A("## Effect timeline")
    A("")
    if events:
        A("| Time | Event | Duration | Detail |")
        A("|---|---|---|---|")
        for e in events:
            label = EVENT_LABEL.get(e.kind, e.kind)
            span = _ts(e.t_start) if e.duration < 0.12 else f"{_ts(e.t_start)} → {_ts(e.t_end)}"
            A(f"| `{span}` | {label} | {e.duration:.2f}s | {e.detail} |")
        A("")
    else:
        A("No cuts or transitions detected — single continuous shot.")
        A("")

    # ---------- audio ----------
    A("## Audio")
    A("")
    if audio and audio.has_audio:
        A(f"- Mean level **{audio.rms_db_mean:.1f} dBFS**, peak **{audio.peak_db:.1f} dBFS**, "
          f"crest factor **{audio.crest_db:.1f} dB**")
        if audio.tempo_bpm:
            A(f"- Rhythmic pulse ≈ **{audio.tempo_bpm:.0f} BPM**")
        if ctx.get("beat_sync") is not None:
            A(f"- **{ctx['beat_sync']:.0%}** of cuts land within 120 ms of an audio onset "
              f"{'— the edit is cut to the beat' if ctx['beat_sync'] > 0.55 else ''}")
        if audio.whoosh_times:
            A(f"- {len(audio.whoosh_times)} whoosh/riser-style bursts at "
              f"{', '.join(_ts(x) for x in audio.whoosh_times[:10])}"
              f"{' …' if len(audio.whoosh_times) > 10 else ''}")
        for note in audio.notes:
            A(f"- {note}")
    else:
        A("No usable audio track.")
    A("")

    # ---------- pipeline ----------
    A("## Source & export pipeline")
    A("")
    A(f"- Container: `{p.format_name}`, video `{p.video.codec}"
      f"{(' ' + p.video.profile) if p.video.profile else ''}`, "
      f"pixel format `{p.video.pix_fmt}`")
    if p.video.color_space or p.video.color_range:
        A(f"- Colour: `{p.video.color_space or 'unspecified'}` / range `{p.video.color_range or 'unspecified'}`"
          + (f" / **{p.video.color_transfer}**" if p.video.color_transfer else ""))
    if p.video.bitrate_kbps:
        bpp = (p.video.bitrate_kbps * 1000) / max(1.0, p.video.width * p.video.height *
                                                  (p.video.fps or 30))
        A(f"- Video bitrate **{p.video.bitrate_kbps:.0f} kb/s** ({bpp:.3f} bits/pixel/frame"
          f"{' — heavily compressed, expect macroblocking' if bpp < 0.045 else ''})")
    if p.audio:
        A(f"- Audio: `{p.audio.codec}` {p.audio.sample_rate} Hz {p.audio.layout}"
          + (f" @ {p.audio.bitrate_kbps:.0f} kb/s" if p.audio.bitrate_kbps else ""))
    if p.video.rotation:
        A(f"- Rotation metadata: {p.video.rotation:g}°")
    if p.fingerprints:
        A(f"- **Toolchain fingerprints in the container: {', '.join(p.fingerprints)}**")
    else:
        A("- No editor fingerprints found in container metadata")
    interesting = {k: v for k, v in p.tags.items()
                   if k.lower() in {"encoder", "handler_name", "comment", "title", "artist",
                                    "creation_time", "com.android.version", "major_brand",
                                    "compatible_brands", "software", "make", "model"}}
    if interesting:
        A("")
        A("<details><summary>Container metadata tags</summary>")
        A("")
        for k, v in interesting.items():
            A(f"- `{k}`: {v}")
        A("")
        A("</details>")
    A("")

    if ctx.get("assets"):
        A("## Generated artefacts")
        A("")
        for name, path in ctx["assets"].items():
            A(f"- **{name}** — `{os.path.relpath(path, ctx['out_dir'])}`")
        A("")

    A("---")
    A("")
    A("*Method: every sampled frame is measured for exposure, contrast, saturation, "
      "split-toning, grain (Immerkaer estimator at native resolution), sharpening halos, "
      "bloom, chromatic aberration, vignetting and letterboxing; motion is recovered by "
      "phase correlation (translation) and log-polar phase correlation (scale); shot "
      "changes come from Bhattacharyya distance between HSV histograms, with transitions "
      "classified by the shape of the signal. Confidences are heuristic — treat them as "
      "'how strongly the pixels support this', not as ground truth about the editor's "
      "intent.*")
    return "\n".join(L)
