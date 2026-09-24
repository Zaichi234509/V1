"""vfxscan — tell me what effects are on this video."""

from __future__ import annotations

import argparse
import json
import os
import sys

import cv2
import numpy as np

from . import audio as audio_mod
from . import effects, metrics, probe as probe_mod, report, scenes


def _fmt(t: float) -> str:
    m, s = divmod(max(0.0, t), 60)
    return f"{int(m):d}:{s:05.2f}"


def run(video: str, out_dir: str, analysis_width: int = 384, stride: int = 1,
        max_seconds: float | None = None, sensitivity: float = 1.0,
        skip_audio: bool = False, quiet: bool = False) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    frames_dir = os.path.join(out_dir, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    def log(msg: str) -> None:
        if not quiet:
            print(msg, flush=True)

    log(f"[1/6] probing container: {os.path.basename(video)}")
    p = probe_mod.probe(video)

    fps = p.video.fps or p.video.tbr or 30.0
    max_frames = int(max_seconds * fps / max(1, stride)) if max_seconds else None

    log(f"[2/6] decoding + measuring frames (analysis width {analysis_width}px, stride {stride})")
    tr, hists, thumbs, thumb_t, proxy = metrics.analyze_frames(
        video, analysis_width=analysis_width, stride=stride,
        max_frames=max_frames, progress=not quiet)
    if len(tr) < 2:
        raise RuntimeError("could not decode enough frames to analyse")
    track_duration = float(tr.t[-1])
    eff_fps = len(tr) / max(track_duration, 1e-6)

    log(f"[3/6] detecting cuts and transitions ({len(tr)} frames analysed)")
    ev = scenes.merge_events([
        scenes.detect_cuts(tr, hists, sensitivity),
        scenes.detect_dissolves(tr, hists),
        scenes.detect_fades(tr),
        scenes.detect_flashes(tr),
        scenes.detect_whips(tr),
        scenes.detect_zoom_moves(tr, eff_fps),
        scenes.detect_speed_anomalies(tr, fps),
    ])
    ev = scenes.reclassify_wipes(ev, tr, proxy)
    duration = p.duration_s or track_duration
    shots = scenes.shot_ranges(ev, duration)
    if not shots:
        shots = [(0.0, duration)]
    ev = scenes.clip_events_to_shots(ev, shots)
    ev.sort(key=lambda e: (e.t_start, e.kind))

    log(f"[4/6] classifying effects across {len(shots)} shot(s)")
    W = p.video.width or 1920
    H = p.video.height or 1080

    # Per-shot pass: a grade or a crop that only exists in one shot would be
    # washed out by a whole-video median, so each shot is measured alone.
    per_shot: list[tuple[tuple[float, float], list[effects.Finding]]] = []
    for (a, b) in shots:
        i0, i1 = tr.index_at(a), tr.index_at(b)
        if i1 - i0 < 4:
            continue
        sub = tr.slice(i0, i1)
        sub_thumbs = [th for th, tt in zip(thumbs, thumb_t) if a <= tt <= b]
        sub_times = [tt for tt in thumb_t if a <= tt <= b]
        fl = []
        fl += effects.color_findings(sub)
        fl += effects.texture_findings(sub, H)
        fl += effects.framing_findings(sub, W, H, analysis_width)
        if len(sub_thumbs) >= 5:
            fl += effects.overlay_findings(sub_thumbs, sub_times)
        per_shot.append(((a, b), fl))

    findings = effects.consolidate(per_shot, len(per_shot) or 1)
    # Overlays that persist across the *whole* timeline (watermarks) only show
    # up when the full run of thumbnails is compared.
    for f in effects.overlay_findings(thumbs, thumb_t):
        if not any(x.name == f.name for x in findings):
            findings.append(f)
    findings += effects.pacing_findings(ev, duration)

    # pipeline-level findings
    if p.fingerprints:
        findings.append(effects.Finding(
            "Editor / device fingerprint in container", "Pipeline", 0.8,
            ", ".join(p.fingerprints)))
    if p.video.bitrate_kbps and p.video.width:
        bpp = (p.video.bitrate_kbps * 1000) / max(
            1.0, p.video.width * p.video.height * (p.video.fps or 30))
        if bpp < 0.045:
            findings.append(effects.Finding(
                "Heavy compression (social-platform re-encode)", "Pipeline", 0.7,
                f"only {bpp:.3f} bits per pixel per frame — expect macroblocking and "
                f"banding that can masquerade as intentional texture"))

    aud = None
    beat_sync = None
    if not skip_audio:
        log("[5/6] analysing audio")
        aud = audio_mod.analyze_audio(video, out_dir)
        if aud.has_audio:
            cuts = [e.t_end for e in ev if e.kind == "hard_cut"]
            beat_sync = audio_mod.beat_sync_score(cuts, aud.onset_times or [])
            if beat_sync is not None and beat_sync > 0.55 and len(cuts) >= 4:
                findings.append(effects.Finding(
                    "Cuts synced to the music", "Editing", min(0.9, beat_sync),
                    f"{beat_sync:.0%} of hard cuts land within 120 ms of an audio onset"))
            for note in aud.notes:
                findings.append(effects.Finding(
                    note.split(" — ")[0][:70], "Audio", 0.6, note))
    else:
        log("[5/6] audio skipped")

    log("[6/6] rendering report")
    assets: dict[str, str] = {}

    chart = report.timeline_chart(tr, ev, os.path.join(out_dir, "timeline.png"), duration)
    assets["Signal timeline"] = chart

    sheet = report.contact_sheet(thumbs, thumb_t, os.path.join(out_dir, "contact_sheet.png"))
    if sheet:
        assets["Contact sheet"] = sheet

    # representative stills: one per shot, else evenly spaced
    if len(shots) >= 2:
        picks = [(a + b) / 2 for a, b in shots][:12]
    else:
        picks = list(np.linspace(0.05 * track_duration, 0.95 * track_duration, 6))
    stills = metrics.grab_frames(video, picks)
    still_paths = []
    for k, (img, tt) in enumerate(zip(stills, picks)):
        fp = os.path.join(frames_dir, f"still_{k:02d}_{tt:07.2f}s.png")
        cv2.imwrite(fp, img)
        still_paths.append(fp)
    if still_paths:
        assets["Reference stills"] = frames_dir

    scope = report.scopes_chart(stills[:5], [f"t={_fmt(x)}" for x in picks[:5]],
                                os.path.join(out_dir, "scopes.png"))
    if scope:
        assets["RGB scopes"] = scope

    ctx = {
        "probe": p, "findings": findings, "events": ev, "audio": aud,
        "beat_sync": beat_sync, "assets": assets, "out_dir": out_dir,
        "track_duration": track_duration, "shots": shots,
    }
    md = report.render_markdown(ctx)
    md_path = os.path.join(out_dir, "REPORT.md")
    with open(md_path, "w") as fh:
        fh.write(md)

    data = {
        "probe": p.to_dict(),
        "analysis": {
            "frames_analysed": len(tr),
            "effective_fps": round(eff_fps, 3),
            "duration_s": round(track_duration, 3),
        },
        "shots": [{"start": round(a, 3), "end": round(b, 3)} for a, b in shots],
        "findings": [f.to_dict() for f in findings],
        "events": [e.to_dict() for e in ev],
        "audio": aud.to_dict() if aud else None,
        "beat_sync": beat_sync,
        "stills": still_paths,
    }
    with open(os.path.join(out_dir, "analysis.json"), "w") as fh:
        json.dump(data, fh, indent=2)

    log(f"\n✔ report: {md_path}")
    return data


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="vfxscan", description=__doc__)
    ap.add_argument("video")
    ap.add_argument("-o", "--out", default="analysis_out")
    ap.add_argument("-w", "--width", type=int, default=384,
                    help="analysis width in px (default 384)")
    ap.add_argument("-s", "--stride", type=int, default=1,
                    help="analyse every Nth frame (default 1)")
    ap.add_argument("--max-seconds", type=float, default=None)
    ap.add_argument("--sensitivity", type=float, default=1.0,
                    help=">1 finds more cuts, <1 finds fewer")
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("-q", "--quiet", action="store_true")
    a = ap.parse_args(argv)

    if not os.path.exists(a.video):
        print(f"no such file: {a.video}", file=sys.stderr)
        return 2
    run(a.video, a.out, a.width, a.stride, a.max_seconds, a.sensitivity,
        a.no_audio, a.quiet)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
