"""Cut & transition detection and classification.

A hard cut is an isolated one-frame spike in histogram distance. Everything
else worth naming is a *shape* in the signal over several frames:

* dissolve / crossfade — sustained mid-level distance, and the middle frames
  are a monotonic blend between the endpoints
* fade to / from black or white — luma collapses to a floor/ceiling while
  contrast collapses too
* flash / light leak — 1-4 frame luma spike with the shot unchanged either side
* whip pan / motion blur transition — huge translation plus a sharpness crash
* zoom punch — sudden scale step
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

import cv2
import numpy as np

from .metrics import Track


@dataclass
class Event:
    kind: str
    t_start: float
    t_end: float
    confidence: float
    detail: str = ""

    @property
    def duration(self) -> float:
        return max(0.0, self.t_end - self.t_start)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["duration"] = round(self.duration, 3)
        return d


def _mad_sigma(x: np.ndarray) -> float:
    med = np.median(x)
    return float(1.4826 * np.median(np.abs(x - med)) + 1e-9)


def _spearman(y: np.ndarray) -> float:
    """Rank correlation of y against its own index order (numpy only)."""
    n = y.size
    if n < 3:
        return 0.0
    ry = np.empty(n, dtype=np.float64)
    ry[np.argsort(y, kind="stable")] = np.arange(n, dtype=np.float64)
    rx = np.arange(n, dtype=np.float64)
    rx -= rx.mean()
    ry -= ry.mean()
    denom = np.sqrt((rx ** 2).sum() * (ry ** 2).sum())
    return float((rx * ry).sum() / denom) if denom > 0 else 0.0


def detect_cuts(tr: Track, hists: np.ndarray, sensitivity: float = 1.0) -> list[Event]:
    n = len(tr)
    if n < 5:
        return []
    t = tr.arr("t")
    d = tr.arr("hist_dist")
    mad = tr.arr("mad")

    base = np.median(d)
    sigma = _mad_sigma(d)
    thr = max(base + (6.0 / sensitivity) * sigma, 0.22)

    mad_thr = max(np.median(mad) + (6.0 / sensitivity) * _mad_sigma(mad), 6.0)

    events: list[Event] = []
    for i in range(1, n - 1):
        if d[i] < thr or mad[i] < mad_thr:
            continue
        # isolated spike => hard cut; broad hump handled by dissolve pass
        neigh = max(d[i - 1], d[i + 1])
        if neigh > 0.75 * d[i]:
            continue
        conf = float(min(1.0, (d[i] - thr) / (thr + 1e-6) + 0.55))
        events.append(Event("hard_cut", float(t[i - 1]), float(t[i]), round(conf, 2),
                            f"hist Δ={d[i]:.3f}, pixel Δ={mad[i]:.1f}"))
    return events


def detect_fades(tr: Track) -> list[Event]:
    n = len(tr)
    if n < 6:
        return []
    t = tr.arr("t")
    lm = tr.arr("luma_mean")
    ls = tr.arr("luma_std")
    out: list[Event] = []

    dark = (lm < 14) & (ls < 12)
    bright = (lm > 240) & (ls < 14)

    for mask, name, word in ((dark, "fade_black", "black"), (bright, "fade_white", "white")):
        i = 0
        while i < n:
            if not mask[i]:
                i += 1
                continue
            j = i
            while j + 1 < n and mask[j + 1]:
                j += 1
            # walk outwards while luma is monotonically ramping
            a = i
            while a - 1 >= 0 and (
                (lm[a - 1] > lm[a] if name == "fade_black" else lm[a - 1] < lm[a])
            ) and (a - i) > -45:
                a -= 1
                if abs(a - i) > 45:
                    break
            b = j
            while b + 1 < n and (
                (lm[b + 1] > lm[b] if name == "fade_black" else lm[b + 1] < lm[b])
            ) and (b - j) < 45:
                b += 1
            span = float(t[b] - t[a])
            if span >= 0.08:
                out.append(Event(name, float(t[a]), float(t[b]), 0.85,
                                 f"luma ramps through {word} over {span:.2f}s"))
            i = j + 1
    return out


def detect_dissolves(tr: Track, hists: np.ndarray, min_len: int = 3,
                     max_len: int = 60) -> list[Event]:
    """Sustained change where the middle is a blend of the two endpoints."""
    n = len(tr)
    if n < min_len + 4:
        return []
    t = tr.arr("t")
    d = tr.arr("hist_dist")
    base = np.median(d)
    sigma = _mad_sigma(d)
    lo = base + 2.0 * sigma
    if lo <= 0:
        return []

    out: list[Event] = []
    i = 1
    while i < n:
        if d[i] <= lo:
            i += 1
            continue
        j = i
        while j + 1 < n and d[j + 1] > lo:
            j += 1
        span = j - i + 1
        if min_len <= span <= max_len:
            a, b = max(0, i - 1), min(n - 1, j + 1)
            ha, hb = hists[a], hists[b]
            # For a real dissolve, distance-to-start rises and distance-to-end
            # falls, both roughly monotonically, across the window.
            # cv2.compareHist normalises internally; hand-rolling the
            # Bhattacharyya sum on L2-normalised histograms silently returns 0.
            def _bhat(u: np.ndarray, v: np.ndarray) -> float:
                return float(cv2.compareHist(u, v, cv2.HISTCMP_BHATTACHARYYA))

            da = np.array([_bhat(hists[k], ha) for k in range(a, b + 1)])
            db = np.array([_bhat(hists[k], hb) for k in range(a, b + 1)])
            if len(da) >= 3 and da[-1] > 0.12 and db[0] > 0.12:
                # Rank correlation against frame order is far more robust to
                # grain than testing every consecutive difference: a dissolve
                # must walk *away* from the outgoing shot and *towards* the
                # incoming one, even if it does so unevenly.
                rho_a = _spearman(da)
                rho_b = _spearman(db)
                score = 0.5 * (max(0.0, rho_a) + max(0.0, -rho_b))
                peak_ratio = float(d[i:j + 1].max() / (d[i:j + 1].mean() + 1e-6))
                if rho_a > 0.55 and rho_b < -0.55 and peak_ratio < 3.2:
                    out.append(Event(
                        "dissolve", float(t[a]), float(t[b]),
                        round(min(0.95, 0.45 + score / 2), 2),
                        f"{(t[b] - t[a]):.2f}s cross-blend "
                        f"(ρ to outgoing {rho_a:+.2f}, to incoming {rho_b:+.2f})"))
        i = j + 1
    return out


def _wipe_scores(proxy: np.ndarray, a: int, b: int) -> tuple[float, float]:
    """How spatially *partitioned* is the change across a transition?

    During a dissolve every pixel blends at the same rate, so the fraction of
    the total change completed so far is uniform across the frame. During a
    wipe it is ~1 where the new shot has arrived and ~0 where it hasn't, so
    that fraction varies enormously from row to row (or column to column).
    Returns (row_score, col_score); larger means more wipe-like.
    """
    if b - a < 2:
        return 0.0, 0.0
    A = proxy[a].astype(np.float32)
    B = proxy[b].astype(np.float32)
    drow = np.abs(B - A).mean(axis=1)
    dcol = np.abs(B - A).mean(axis=0)
    # Only meaningful where the two endpoints actually differ.
    rmask = drow > max(3.0, 0.25 * drow.max())
    cmask = dcol > max(3.0, 0.25 * dcol.max())
    if rmask.sum() < 6 or cmask.sum() < 6:
        return 0.0, 0.0
    rs, cs = [], []
    for k in range(a + 1, b):
        P = proxy[k].astype(np.float32)
        pr = np.clip(np.abs(P - A).mean(axis=1)[rmask] / drow[rmask], 0.0, 1.5)
        pc = np.clip(np.abs(P - A).mean(axis=0)[cmask] / dcol[cmask], 0.0, 1.5)
        rs.append(float(pr.std()))
        cs.append(float(pc.std()))
    return (float(np.mean(rs)) if rs else 0.0, float(np.mean(cs)) if cs else 0.0)


def reclassify_wipes(events: list[Event], tr: Track, proxy: np.ndarray,
                     threshold: float = 0.22) -> list[Event]:
    """Promote dissolves/fades that are actually wipes to their own kind."""
    if proxy is None or len(proxy) == 0:
        return events
    times = np.asarray(tr.t)
    out: list[Event] = []
    for e in events:
        if e.kind not in {"dissolve", "fade_white", "fade_black"}:
            out.append(e)
            continue
        a = int(np.searchsorted(times, e.t_start))
        b = min(len(proxy) - 1, int(np.searchsorted(times, e.t_end)))
        rscore, cscore = _wipe_scores(proxy, a, b)
        best = max(rscore, cscore)
        if best > threshold:
            axis = "horizontal band / vertical travel" if rscore >= cscore else "vertical edge / horizontal travel"
            out.append(Event(
                "wipe", e.t_start, e.t_end, round(min(0.9, 0.4 + best), 2),
                f"{axis} — change is spatially partitioned, not uniform "
                f"(row σ={rscore:.2f}, col σ={cscore:.2f}); reads as a wipe/slice "
                f"reveal rather than a {e.kind.replace('_', ' ')}"))
        else:
            out.append(e)
    return out


def detect_flashes(tr: Track) -> list[Event]:
    n = len(tr)
    if n < 9:
        return []
    t = tr.arr("t")
    lm = tr.arr("luma_mean")
    k = 9
    pad = np.pad(lm, (k // 2, k // 2), mode="edge")
    med = np.array([np.median(pad[i:i + k]) for i in range(n)])
    resid = lm - med
    sigma = _mad_sigma(resid)
    out: list[Event] = []
    i = 0
    while i < n:
        if resid[i] > max(5.0 * sigma, 14.0):
            j = i
            while j + 1 < n and resid[j + 1] > max(3.0 * sigma, 8.0):
                j += 1
            if (j - i) <= 6:
                out.append(Event("flash", float(t[i]), float(t[min(j, n - 1)]), 0.7,
                                 f"+{resid[i:j + 1].max():.0f} luma spike"))
            i = j + 1
        else:
            i += 1
    return out


def detect_whips(tr: Track) -> list[Event]:
    n = len(tr)
    if n < 6:
        return []
    t = tr.arr("t")
    mot = tr.arr("motion")
    sharp = tr.arr("sharp")
    sig = _mad_sigma(mot)
    med = np.median(mot)
    smed = np.median(sharp)
    out: list[Event] = []
    i = 1
    while i < n:
        if mot[i] > max(med + 6.0 * sig, 12.0) and sharp[i] < 0.6 * smed:
            j = i
            while j + 1 < n and mot[j + 1] > med + 3.0 * sig:
                j += 1
            out.append(Event("whip_pan", float(t[i]), float(t[min(j, n - 1)]), 0.65,
                             f"|motion|={mot[i:j + 1].max():.1f}px/frame with sharpness drop"))
            i = j + 1
        else:
            i += 1
    return out


def detect_zoom_moves(tr: Track, fps: float) -> list[Event]:
    n = len(tr)
    if n < 10:
        return []
    t = tr.arr("t")
    z = tr.arr("zoom")
    dev = z - 1.0
    win = max(3, int(round(fps * 0.4)))
    kern = np.ones(win) / win
    sm = np.convolve(dev, kern, mode="same")
    out: list[Event] = []
    i = 0
    thr = 0.004
    while i < n:
        if abs(sm[i]) > thr:
            j = i
            while j + 1 < n and abs(sm[j + 1]) > thr * 0.6 and np.sign(sm[j + 1]) == np.sign(sm[i]):
                j += 1
            dur = float(t[min(j, n - 1)] - t[i])
            cumulative = float(np.prod(z[i:j + 1]))
            if dur >= 0.25 and abs(cumulative - 1.0) > 0.03:
                kind = "zoom_in" if cumulative > 1 else "zoom_out"
                out.append(Event(kind, float(t[i]), float(t[min(j, n - 1)]), 0.6,
                                 f"scale x{cumulative:.2f} over {dur:.2f}s"))
            i = j + 1
        else:
            i += 1
    return out


def detect_speed_anomalies(tr: Track, fps: float) -> list[Event]:
    """Duplicate-frame runs (frame holds / slow-mo) and freeze frames."""
    n = len(tr)
    if n < 6:
        return []
    t = tr.arr("t")
    dup = np.asarray(tr.dup, dtype=bool)
    out: list[Event] = []
    i = 0
    while i < n:
        if dup[i]:
            j = i
            while j + 1 < n and dup[j + 1]:
                j += 1
            run = j - i + 1
            dur = float(t[min(j, n - 1)] - t[i])
            if dur >= 0.4:
                out.append(Event("freeze_frame", float(t[i]), float(t[min(j, n - 1)]), 0.8,
                                 f"{run} identical frames ({dur:.2f}s hold)"))
            i = j + 1
        else:
            i += 1

    # scattered short dup runs across the file => frame-rate padding or slow-mo
    ratio = float(dup.mean())
    if ratio > 0.12 and not any(e.kind == "freeze_frame" and e.duration > 0.8 for e in out):
        out.append(Event("frame_padding", float(t[0]), float(t[-1]), 0.6,
                         f"{ratio * 100:.0f}% of frames duplicate the previous one — "
                         f"source is slower than the {fps:.0f}fps container "
                         f"(slow-motion, frame-hold, or upsampled export)"))
    return out


def _overlaps(a: Event, b: Event, pad: float = 0.12) -> bool:
    return a.t_start <= b.t_end + pad and b.t_start <= a.t_end + pad


def merge_events(groups: list[list[Event]]) -> list[Event]:
    allev = [e for g in groups for e in g]
    allev.sort(key=lambda e: (e.t_start, e.kind))

    fades = [e for e in allev if e.kind in {"fade_black", "fade_white"}]
    soft = [e for e in allev if e.kind in {"dissolve", "fade_black", "fade_white"}]

    kept: list[Event] = []
    for e in allev:
        # a fade *is* a dissolve to a flat colour — don't report both
        if e.kind == "dissolve" and any(_overlaps(e, f) for f in fades):
            continue
        # a cut detected inside a soft transition is an artefact of the blend
        if e.kind == "hard_cut" and any(
            s.t_start - 0.05 <= e.t_start <= s.t_end + 0.05 for s in soft
        ):
            continue
        # flashes inside a fade/dissolve are the transition itself
        if e.kind == "flash" and any(_overlaps(e, s) for s in soft):
            continue
        kept.append(e)
    return kept


# Events that end one shot and begin another.
BOUNDARY_KINDS = {"hard_cut", "dissolve", "fade_black", "fade_white", "wipe", "whip_pan"}


def shot_ranges(events: list[Event], duration: float, guard: float = 0.10,
                min_len: float = 0.30) -> list[tuple[float, float]]:
    """Stable content spans, with transition frames excluded.

    Measuring colour or framing *through* a dissolve mixes two grades together,
    so the shot list deliberately carves those frames out.
    """
    excl: list[list[float]] = []
    for e in events:
        if e.kind in BOUNDARY_KINDS:
            excl.append([max(0.0, e.t_start - 1e-3), e.t_end + 1e-3])
    excl.sort()

    merged: list[list[float]] = []
    for a, b in excl:
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])

    shots: list[tuple[float, float]] = []
    cur = 0.0
    for a, b in merged:
        if a - cur > min_len:
            shots.append((cur + guard, a - guard))
        cur = max(cur, b)
    if duration - cur > min_len:
        shots.append((min(cur + guard, duration), duration))
    return [(a, b) for a, b in shots if b - a > min_len]


def clip_events_to_shots(events: list[Event], shots: list[tuple[float, float]]) -> list[Event]:
    """Trim camera-move events so they never span a shot boundary."""
    if not shots:
        return events
    out: list[Event] = []
    for e in events:
        if e.kind not in {"zoom_in", "zoom_out"}:
            out.append(e)
            continue
        for a, b in shots:
            lo, hi = max(e.t_start, a), min(e.t_end, b)
            if hi - lo >= 0.25:
                out.append(Event(e.kind, lo, hi, e.confidence, e.detail))
    return out
