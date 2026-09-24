"""Audio-side effect detection.

Sound design is half of "what effects are on this video": whooshes on
transitions, beat-synced cutting, ducking under voiceover, heavy loudness
normalisation. All of it is measurable from the waveform.
"""

from __future__ import annotations

import shutil
import subprocess
import wave
from dataclasses import dataclass, asdict
from typing import Any

import numpy as np

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"


@dataclass
class AudioReport:
    has_audio: bool = False
    sample_rate: int = 0
    duration_s: float = 0.0
    rms_db_mean: float = 0.0
    rms_db_p95: float = 0.0
    peak_db: float = 0.0
    crest_db: float = 0.0
    silence_ratio: float = 0.0
    tempo_bpm: float | None = None
    onset_times: list[float] = None
    whoosh_times: list[float] = None
    notes: list[str] = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        for k in ("onset_times", "whoosh_times"):
            if d.get(k):
                d[k] = [round(x, 2) for x in d[k][:200]]
        return d


def extract_wav(video: str, out_wav: str, sr: int = 22050) -> bool:
    proc = subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", video,
         "-vn", "-ac", "1", "-ar", str(sr), "-f", "wav", out_wav],
        capture_output=True, text=True, timeout=600)
    return proc.returncode == 0


def _read_wav(path: str) -> tuple[np.ndarray, int]:
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        n = w.getnframes()
        raw = w.readframes(n)
        width = w.getsampwidth()
    dtype = {1: np.uint8, 2: np.int16, 4: np.int32}.get(width, np.int16)
    x = np.frombuffer(raw, dtype=dtype).astype(np.float32)
    if dtype == np.uint8:
        x = (x - 128) / 128.0
    else:
        x = x / float(np.iinfo(dtype).max)
    return x, sr


def _db(x: float) -> float:
    return float(20 * np.log10(max(x, 1e-9)))


def analyze_audio(video: str, workdir: str) -> AudioReport:
    import os

    rep = AudioReport(onset_times=[], whoosh_times=[], notes=[])
    wav = os.path.join(workdir, "_audio.wav")
    if not extract_wav(video, wav):
        rep.notes.append("no decodable audio stream")
        return rep
    try:
        x, sr = _read_wav(wav)
    except Exception as exc:  # noqa: BLE001
        rep.notes.append(f"audio read failed: {exc}")
        return rep
    if x.size < sr // 10:
        rep.notes.append("audio stream is empty or extremely short")
        return rep

    rep.has_audio = True
    rep.sample_rate = sr
    rep.duration_s = x.size / sr

    hop = max(1, sr // 100)          # 10 ms
    frame = max(hop, sr // 50)       # 20 ms
    nf = max(1, (x.size - frame) // hop)
    idx = np.arange(nf) * hop
    win = np.stack([x[i:i + frame] for i in idx]) if nf < 200000 else None
    if win is None:
        step = max(1, nf // 200000)
        idx = idx[::step]
        win = np.stack([x[i:i + frame] for i in idx])
    rms = np.sqrt((win ** 2).mean(axis=1) + 1e-12)
    times = idx / sr

    rep.rms_db_mean = _db(float(rms.mean()))
    rep.rms_db_p95 = _db(float(np.percentile(rms, 95)))
    rep.peak_db = _db(float(np.abs(x).max()))
    rep.crest_db = round(rep.peak_db - rep.rms_db_mean, 2)
    rep.silence_ratio = float((rms < 10 ** (-50 / 20)).mean())

    if rep.crest_db < 9:
        rep.notes.append(
            f"crest factor only {rep.crest_db:.1f} dB — audio is heavily compressed / "
            f"limited / loudness-normalised (music-bed style mastering)")
    elif rep.crest_db > 20:
        rep.notes.append(
            f"crest factor {rep.crest_db:.1f} dB — dynamic, largely unprocessed audio")
    if rep.peak_db > -0.3:
        rep.notes.append("peaks reach 0 dBFS — brickwall limiting or clipping on export")

    # --- spectral flux onsets ---
    nfft = 1024
    hop2 = 512
    nseg = max(1, (x.size - nfft) // hop2)
    if nseg > 4:
        step = max(1, nseg // 60000)
        starts = (np.arange(nseg)[::step]) * hop2
        window = np.hanning(nfft).astype(np.float32)
        spec = np.abs(np.fft.rfft(np.stack([x[s:s + nfft] for s in starts]) * window, axis=1))
        flux = np.maximum(0.0, np.diff(spec, axis=0)).sum(axis=1)
        ftimes = starts[1:] / sr
        if flux.size > 10:
            f = flux / (flux.max() + 1e-9)
            k = 21
            pad = np.pad(f, (k // 2, k // 2), mode="edge")
            local = np.array([np.median(pad[i:i + k]) for i in range(f.size)])
            peaks = np.where((f > local * 2.2 + 0.04) &
                             (f > np.r_[f[1:], 0]) & (f > np.r_[0, f[:-1]]))[0]
            rep.onset_times = [float(ftimes[p]) for p in peaks]

            if len(rep.onset_times) > 6:
                iois = np.diff(rep.onset_times)
                iois = iois[(iois > 0.18) & (iois < 2.0)]
                if iois.size > 4:
                    hist, edges = np.histogram(iois, bins=40, range=(0.18, 2.0))
                    period = float((edges[hist.argmax()] + edges[hist.argmax() + 1]) / 2)
                    bpm = 60.0 / period
                    while bpm < 70:
                        bpm *= 2
                    while bpm > 190:
                        bpm /= 2
                    consistency = float(hist.max() / max(1, hist.sum()))
                    if consistency > 0.12:
                        rep.tempo_bpm = round(bpm, 1)
                        rep.notes.append(
                            f"steady rhythmic pulse ≈ {rep.tempo_bpm:.0f} BPM — a music "
                            f"bed is driving the edit")

            # --- whooshes: broadband, fast-attack bursts weighted to highs ---
            hi = spec[:, spec.shape[1] // 3:].sum(axis=1)
            lo = spec[:, : spec.shape[1] // 3].sum(axis=1) + 1e-9
            bright = hi / lo
            b = bright[1:]
            if b.size > 20:
                thr = float(np.median(b) + 4 * (np.median(np.abs(b - np.median(b))) * 1.4826))
                cand = np.where((b > thr) & (f > 0.15))[0]
                merged: list[float] = []
                for c in cand:
                    tt = float(ftimes[c])
                    if not merged or tt - merged[-1] > 0.35:
                        merged.append(tt)
                rep.whoosh_times = merged[:200]
                if len(merged) >= 2:
                    rep.notes.append(
                        f"{len(merged)} broadband high-frequency bursts detected — "
                        f"whoosh / riser / transition SFX")

    if rep.silence_ratio > 0.4:
        rep.notes.append(
            f"{rep.silence_ratio * 100:.0f}% of the timeline is near-silent — "
            f"hard-cut audio edits or long gaps")

    try:
        os.remove(wav)
    except OSError:
        pass
    return rep


def beat_sync_score(cut_times: list[float], onsets: list[float], tol: float = 0.12) -> float | None:
    """Fraction of cuts that land on an audio onset."""
    if not cut_times or not onsets:
        return None
    o = np.asarray(onsets)
    hits = sum(1 for c in cut_times if np.min(np.abs(o - c)) <= tol)
    return hits / len(cut_times)
