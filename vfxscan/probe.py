"""Container / codec forensics.

Answers the "what was this made with?" half of the question before a single
pixel is decoded. Editing apps leave fingerprints in the MP4/MOV atoms, and
codec + frame-rate choices narrow down the capture and export pipeline.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Any

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"

# Strings that editors / exporters bake into container metadata.
EDITOR_FINGERPRINTS: list[tuple[str, str]] = [
    (r"capcut|lveditor|bytedance|jianying", "CapCut / JianYing"),
    (r"adobe premiere|premiere pro|pproheader", "Adobe Premiere Pro"),
    (r"after effects|aeheader", "Adobe After Effects"),
    (r"adobe media encoder", "Adobe Media Encoder"),
    (r"davinci|blackmagic|resolve", "DaVinci Resolve"),
    (r"final cut pro|finalcutpro|appleprores|com\.apple\.proapps", "Apple Final Cut Pro"),
    (r"imovie", "Apple iMovie"),
    (r"vegas pro|sony vegas", "VEGAS Pro"),
    (r"filmora|wondershare", "Filmora"),
    (r"kinemaster", "KineMaster"),
    (r"inshot", "InShot"),
    (r"vn video editor|vlogstar", "VN Video Editor"),
    (r"camtasia|techsmith", "Camtasia"),
    (r"obs-studio|libobs", "OBS Studio (screen/stream capture)"),
    (r"handbrake", "HandBrake (re-encode)"),
    (r"shotcut|kdenlive|openshot", "Open-source NLE (Shotcut/Kdenlive/OpenShot)"),
    (r"canva", "Canva"),
    (r"veed|descript|runway|pika|kaiber", "Web/AI video tool"),
    (r"lavf|lavc|libavformat", "FFmpeg (Lavf) — programmatic or re-wrapped export"),
    (r"com\.android\.version|android", "Android camera/app"),
    (r"quicktime|com\.apple\.quicktime", "Apple QuickTime / iOS camera"),
    (r"gopro|gpmf", "GoPro camera"),
    (r"dji ", "DJI camera/drone"),
    (r"insta360", "Insta360"),
]

# Rough "is this a phone / screen grab / pro camera" signal from resolution.
COMMON_FORMATS: dict[tuple[int, int], str] = {
    (1080, 1920): "9:16 vertical 1080p (TikTok/Reels/Shorts native)",
    (720, 1280): "9:16 vertical 720p",
    (1920, 1080): "16:9 1080p",
    (3840, 2160): "16:9 4K UHD",
    (2160, 3840): "9:16 vertical 4K",
    (1080, 1080): "1:1 square 1080",
    (1280, 720): "16:9 720p",
}


@dataclass
class VideoStream:
    codec: str = ""
    profile: str = ""
    pix_fmt: str = ""
    width: int = 0
    height: int = 0
    fps: float = 0.0
    tbr: float = 0.0
    bitrate_kbps: float | None = None
    color_space: str = ""
    color_range: str = ""
    color_primaries: str = ""
    color_transfer: str = ""
    rotation: float | None = None
    sar: str = ""
    dar: str = ""


@dataclass
class AudioStream:
    codec: str = ""
    sample_rate: int = 0
    layout: str = ""
    bitrate_kbps: float | None = None


@dataclass
class Probe:
    path: str = ""
    filesize_mb: float = 0.0
    duration_s: float = 0.0
    bitrate_kbps: float | None = None
    format_name: str = ""
    video: VideoStream = field(default_factory=VideoStream)
    audio: AudioStream | None = None
    tags: dict[str, str] = field(default_factory=dict)
    fingerprints: list[str] = field(default_factory=list)
    raw: str = ""

    def to_dict(self) -> dict[str, Any]:
        def conv(o: Any) -> Any:
            if hasattr(o, "__dataclass_fields__"):
                return {k: conv(getattr(o, k)) for k in o.__dataclass_fields__}
            return o

        d = conv(self)
        d.pop("raw", None)
        return d


def _run_ffmpeg_info(path: str) -> str:
    """ffmpeg prints stream info to stderr; -f null decodes nothing."""
    proc = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", path, "-f", "null", "-"],
        capture_output=True,
        text=True,
        errors="replace",
        timeout=300,
    )
    return proc.stderr


def _parse_time(ts: str) -> float:
    h, m, s = ts.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


_ASCII_RUN = re.compile(rb"[\x20-\x7e]{4,}")


def _scan_container_strings(path: str, window: int = 4 * 1024 * 1024) -> list[str]:
    """Editor names live in the moov atom, usually at the head or tail.

    Compressed video payload is full of bytes that happen to spell short words
    ("fcp", "dji", ...), so we only consider runs of >= 4 printable characters
    and require the pattern to match on a token boundary. Without this the
    scanner confidently reports editors that were never involved.
    """
    hits: list[str] = []
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as fh:
            blob = fh.read(min(window, size))
            if size > window:
                fh.seek(max(0, size - window))
                blob += fh.read(window)
    except OSError:
        return hits

    runs = [m.group().decode("ascii", "ignore").lower() for m in _ASCII_RUN.finditer(blob)]
    text = "\n".join(runs)
    for pattern, label in EDITOR_FINGERPRINTS:
        if re.search(rf"(?<![a-z0-9])(?:{pattern})(?![a-z0-9])", text) and label not in hits:
            hits.append(label)
    return hits


def probe(path: str) -> Probe:
    info = _run_ffmpeg_info(path)
    p = Probe(path=path, raw=info)
    p.filesize_mb = round(os.path.getsize(path) / 1e6, 2)

    m = re.search(r"Input #0,\s*([^,]+),", info)
    if m:
        p.format_name = m.group(1).strip()

    m = re.search(r"Duration:\s*(\d+:\d+:[\d.]+)", info)
    if m:
        p.duration_s = _parse_time(m.group(1))
    m = re.search(r"Duration:.*?bitrate:\s*([\d.]+)\s*kb/s", info)
    if m:
        p.bitrate_kbps = float(m.group(1))

    # ---- metadata tags (before the first Stream line of each block) ----
    for key, val in re.findall(r"^\s{4,}(\w[\w.\- ]*?)\s*:\s*(.+)$", info, re.M):
        k = key.strip()
        if k and k not in p.tags:
            p.tags[k] = val.strip()

    # ---- video stream ----
    vm = re.search(r"Stream #\d+:\d+.*?: Video: (.+)$", info, re.M)
    if vm:
        line = vm.group(1)
        v = p.video
        cm = re.match(r"([\w\d]+)(?:\s*\(([^)]*)\))?", line)
        if cm:
            v.codec = cm.group(1)
            prof = cm.group(2) or ""
            if prof and "/" not in prof:
                v.profile = prof

        dm = re.search(r"(\d{2,5})x(\d{2,5})", line)
        if dm:
            v.width, v.height = int(dm.group(1)), int(dm.group(2))

        pm = re.search(r"\b(yuv\w+|gbr\w+|rgb\w+|gray\w*|nv\d+|p010\w*)\b", line)
        if pm:
            v.pix_fmt = pm.group(1)

        # colour block e.g. yuv420p(tv, bt709, progressive)
        cb = re.search(r"\((\s*(?:tv|pc|full|limited)[^)]*)\)", line)
        if cb:
            parts = [x.strip() for x in cb.group(1).split(",")]
            if parts:
                v.color_range = parts[0]
            for part in parts[1:]:
                if part.startswith("bt") or part.startswith("smpte") or "709" in part or "2020" in part:
                    v.color_space = part
                if "progressive" in part or "interlac" in part:
                    v.color_transfer = v.color_transfer or ""
        for token, attr in (("bt709", "color_space"), ("bt2020", "color_space"), ("smpte170m", "color_space")):
            if token in line and not getattr(v, attr):
                setattr(v, attr, token)
        if "arib-std-b67" in line or "smpte2084" in line or "pq" in line.split():
            v.color_transfer = "HDR (PQ/HLG)"

        fm = re.search(r"([\d.]+)\s*fps", line)
        if fm:
            v.fps = float(fm.group(1))
        tm = re.search(r"([\d.]+)\s*tbr", line)
        if tm:
            v.tbr = float(tm.group(1))
        bm = re.search(r"([\d.]+)\s*kb/s", line)
        if bm:
            v.bitrate_kbps = float(bm.group(1))
        sm = re.search(r"SAR (\S+) DAR (\S+)\]", line)
        if sm:
            v.sar, v.dar = sm.group(1), sm.group(2)

    rm = re.search(r"rotate\s*:\s*(-?[\d.]+)", info)
    if rm:
        p.video.rotation = float(rm.group(1))
    dm = re.search(r"displaymatrix: rotation of (-?[\d.]+)", info)
    if dm:
        p.video.rotation = float(dm.group(1))

    # ---- audio stream ----
    am = re.search(r"Stream #\d+:\d+.*?: Audio: (.+)$", info, re.M)
    if am:
        line = am.group(1)
        a = AudioStream()
        cm = re.match(r"([\w\d]+)", line)
        if cm:
            a.codec = cm.group(1)
        sm = re.search(r"(\d+)\s*Hz", line)
        if sm:
            a.sample_rate = int(sm.group(1))
        lm = re.search(r"Hz,\s*([\w.() ]+?),", line)
        if lm:
            a.layout = lm.group(1).strip()
        bm = re.search(r"([\d.]+)\s*kb/s", line)
        if bm:
            a.bitrate_kbps = float(bm.group(1))
        p.audio = a

    p.fingerprints = _scan_container_strings(path)
    tagblob = " ".join(f"{k} {v}" for k, v in p.tags.items()).lower()
    for pattern, label in EDITOR_FINGERPRINTS:
        if re.search(pattern, tagblob) and label not in p.fingerprints:
            p.fingerprints.append(label)

    return p


def format_label(width: int, height: int) -> str:
    return COMMON_FORMATS.get((width, height), f"{width}x{height}")
