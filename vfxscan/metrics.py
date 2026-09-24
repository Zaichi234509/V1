"""Per-frame measurement pass.

One sequential decode. For every sampled frame we compute two families of
numbers:

* **global / low-frequency** on a downscaled copy — exposure, contrast,
  saturation, colour balance, split-toning, vignette, letterbox bars.
* **high-frequency** on a native-resolution centre crop — grain, sharpening
  halos, chromatic aberration. These MUST be measured before downscaling or
  the very signal we are looking for is filtered away.

Plus inter-frame motion (pan / zoom / shake / cut distance) via phase
correlation, which is fast and robust to exposure changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

# Immerkaer 3x3 noise-estimation kernel.
_NOISE_K = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], dtype=np.float32)


@dataclass
class Track:
    """Column-oriented store of per-frame measurements."""

    t: list[float] = field(default_factory=list)
    idx: list[int] = field(default_factory=list)

    luma_mean: list[float] = field(default_factory=list)
    luma_std: list[float] = field(default_factory=list)
    luma_p01: list[float] = field(default_factory=list)
    luma_p50: list[float] = field(default_factory=list)
    luma_p99: list[float] = field(default_factory=list)
    clip_low: list[float] = field(default_factory=list)
    clip_high: list[float] = field(default_factory=list)

    sat_mean: list[float] = field(default_factory=list)
    colorfulness: list[float] = field(default_factory=list)
    r_mean: list[float] = field(default_factory=list)
    g_mean: list[float] = field(default_factory=list)
    b_mean: list[float] = field(default_factory=list)
    shadow_rb: list[float] = field(default_factory=list)   # R-B in shadows
    highlight_rb: list[float] = field(default_factory=list)  # R-B in highlights
    warm_ratio: list[float] = field(default_factory=list)

    sharp: list[float] = field(default_factory=list)
    noise: list[float] = field(default_factory=list)
    edge_density: list[float] = field(default_factory=list)
    halo: list[float] = field(default_factory=list)
    glow: list[float] = field(default_factory=list)
    ca: list[float] = field(default_factory=list)          # uniform RGB split
    ca_radial: list[float] = field(default_factory=list)   # radial lens CA
    vignette: list[float] = field(default_factory=list)

    bar_top: list[int] = field(default_factory=list)
    bar_bottom: list[int] = field(default_factory=list)
    bar_left: list[int] = field(default_factory=list)
    bar_right: list[int] = field(default_factory=list)

    mad: list[float] = field(default_factory=list)
    hist_dist: list[float] = field(default_factory=list)
    dx: list[float] = field(default_factory=list)
    dy: list[float] = field(default_factory=list)
    zoom: list[float] = field(default_factory=list)
    motion: list[float] = field(default_factory=list)
    dup: list[bool] = field(default_factory=list)

    def arr(self, name: str) -> np.ndarray:
        return np.asarray(getattr(self, name), dtype=np.float64)

    def __len__(self) -> int:
        return len(self.t)

    def slice(self, i: int, j: int) -> "Track":
        """View of frames [i, j) as a new Track — used for per-shot analysis."""
        sub = Track()
        for name in self.__dataclass_fields__:
            setattr(sub, name, list(getattr(self, name))[i:j])
        return sub

    def index_at(self, t: float) -> int:
        return int(np.searchsorted(np.asarray(self.t), t))


def _colorfulness(bgr: np.ndarray) -> float:
    b, g, r = (bgr[:, :, i].astype(np.float32) for i in range(3))
    rg = r - g
    yb = 0.5 * (r + g) - b
    return float(
        np.sqrt(rg.std() ** 2 + yb.std() ** 2)
        + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2)
    )


def _noise_sigma(gray: np.ndarray) -> float:
    """Immerkaer fast noise variance estimate (robust to smooth content)."""
    h, w = gray.shape
    if h < 4 or w < 4:
        return 0.0
    conv = cv2.filter2D(gray.astype(np.float32), -1, _NOISE_K)
    return float(np.sqrt(np.pi / 2) * np.abs(conv).sum() / (6.0 * (w - 2) * (h - 2)))


def _halo_score(gray: np.ndarray) -> float:
    """Over-sharpening leaves bright/dark ringing hugging strong edges."""
    g = gray.astype(np.float32)
    blur = cv2.GaussianBlur(g, (0, 0), 1.2)
    detail = g - blur
    edges = cv2.Canny(gray, 60, 180) > 0
    if edges.sum() < 50:
        return 0.0
    ring = cv2.dilate(edges.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    ring &= ~edges
    if ring.sum() < 50:
        return 0.0
    return float(np.abs(detail[ring]).mean() / (np.abs(detail).mean() + 1e-6))


def _glow_score(gray: np.ndarray) -> float:
    """Bloom = highlights bleeding a soft halo into their surroundings."""
    g = gray.astype(np.float32)
    thr = max(200.0, float(np.percentile(g, 99.0)))
    hi = (g >= thr).astype(np.uint8)
    if hi.sum() < 20:
        return 0.0
    near = cv2.dilate(hi, np.ones((15, 15), np.uint8))
    far = cv2.dilate(hi, np.ones((41, 41), np.uint8))
    ring = (near - hi).astype(bool)
    outer = (far - near).astype(bool)
    if ring.sum() < 20 or outer.sum() < 20:
        return 0.0
    return float((g[ring].mean() + 1e-6) / (g[outer].mean() + 1e-6))


def _norm_grad(ch: np.ndarray) -> np.ndarray:
    """Zero-mean unit-variance gradient magnitude.

    Raw colour channels of a colourful scene are *different pictures*, so
    matching them directly measures content difference, not misalignment.
    Edge structure, by contrast, is common to all three channels — that is what
    actually shifts under chromatic aberration or an RGB-split effect.
    """
    gx = cv2.Sobel(ch, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(ch, cv2.CV_32F, 0, 1, ksize=3)
    m = np.hypot(gx, gy)
    return (m - m.mean()) / (m.std() + 1e-6)


def _best_shift(ref: np.ndarray, mov: np.ndarray, rng: int = 5) -> float:
    """Sub-pixel horizontal offset of `mov` relative to `ref`.

    Inputs must already be normalised gradient maps (see _norm_grad).
    Verified against injected shifts: recovers 0/±2/±3/±4/±7 px to <0.1 px.
    """
    costs = []
    for d in range(-rng, rng + 1):
        shifted = np.roll(mov, d, axis=1)
        inner = shifted[:, rng:-rng] if rng else shifted
        base = ref[:, rng:-rng] if rng else ref
        costs.append(float(np.mean((inner - base) ** 2)))
    c = np.asarray(costs)
    k = int(c.argmin())
    # A minimum pinned to the edge of the search window means "no match found",
    # not "shifted by the maximum" — without this guard, noisy footage reports
    # a saturated ±rng split on every frame.
    if k == 0 or k == len(c) - 1:
        return 0.0
    # Require the match to be meaningfully better than no shift at all.
    if c[k] > 0.92 * c[rng]:
        return 0.0
    denom = c[k - 1] - 2 * c[k] + c[k + 1]
    delta = 0.5 * (c[k - 1] - c[k + 1]) / denom if abs(denom) > 1e-12 else 0.0
    # np.roll(+d) moves content right, so a minimum at +d means `mov` sits d px
    # to the LEFT of `ref`; negate so the sign reads as a normal offset.
    return float(-((k - rng) + np.clip(delta, -1, 1)))


def _rgb_split(bgr: np.ndarray) -> tuple[float, float]:
    """Return (uniform_split_px, radial_ca_px).

    Measured by finding how far the R and B channels must slide horizontally to
    best match G, separately on the left and right halves of the crop.

    * A deliberate RGB-split / glitch / anamorphic filter shifts the whole
      frame the same way  -> large `uniform`, small `radial`.
    * Real lens chromatic aberration is radial, so the left and right halves
      shift in *opposite* directions -> large `radial`.
    """
    # Keep close to native resolution — an aggressive downscale divides the very
    # offset we are trying to measure. We only shrink enough to bound the cost,
    # then convert the answer back into source pixels.
    h, w = bgr.shape[:2]
    if w < 32 or h < 16:
        return 0.0, 0.0
    target = 320
    if w > target:
        k = target / float(w)
        bgr = cv2.resize(bgr, (target, max(16, int(round(h * k)))),
                         interpolation=cv2.INTER_AREA)
    else:
        k = 1.0

    work = bgr.astype(np.float32)
    if work[:, :, 1].std() < 2.0:
        return 0.0, 0.0
    # One Sobel pass per channel, then slice — not per half.
    gb, gg_, gr = (_norm_grad(work[:, :, i]) for i in range(3))

    # +/-10 px at 320 wide covers the range real chroma-split effects live in.
    rng = 10
    half = work.shape[1] // 2
    if half <= 2 * rng + 4:
        return 0.0, 0.0
    out = []
    for sl in (slice(0, half), slice(half, work.shape[1])):
        ref = gg_[:, sl]
        out.append(_best_shift(ref, gr[:, sl], rng) - _best_shift(ref, gb[:, sl], rng))
    left, right = out
    uniform = abs((left + right) / 2.0) / k    # back to source pixels
    radial = abs(right - left) / 2.0 / k
    return float(uniform), float(radial)


def _vignette(gray: np.ndarray) -> float:
    """<1 means corners darker than centre. Caller must pass the ACTIVE area:
    letterbox bars are black corners and would fake a heavy vignette."""
    h, w = gray.shape
    if h < 8 or w < 8:
        return 1.0
    ch, cw = h // 4, w // 4
    centre = gray[ch: 3 * ch, cw: 3 * cw].astype(np.float32).mean()
    k = max(4, min(h, w) // 8)
    corners = np.concatenate([
        gray[:k, :k].ravel(), gray[:k, -k:].ravel(),
        gray[-k:, :k].ravel(), gray[-k:, -k:].ravel(),
    ]).astype(np.float32).mean()
    return float((corners + 1e-6) / (centre + 1e-6))


def _bars(gray: np.ndarray, thr: int = 18) -> tuple[int, int, int, int]:
    rowmax = gray.max(axis=1)
    colmax = gray.max(axis=0)
    h, w = gray.shape

    def lead(v: np.ndarray) -> int:
        n = 0
        for x in v:
            if x <= thr:
                n += 1
            else:
                break
        return n

    top, bottom = lead(rowmax), lead(rowmax[::-1])
    left, right = lead(colmax), lead(colmax[::-1])
    if top + bottom >= h:
        top = bottom = 0
    if left + right >= w:
        left = right = 0
    return top, bottom, left, right


def _split_tone(bgr: np.ndarray, gray: np.ndarray) -> tuple[float, float]:
    b, g, r = (bgr[:, :, i].astype(np.float32) for i in range(3))
    lo = np.percentile(gray, 25)
    hi = np.percentile(gray, 75)
    sm = gray <= lo
    hm = gray >= hi
    s_rb = float((r[sm] - b[sm]).mean()) if sm.sum() > 10 else 0.0
    h_rb = float((r[hm] - b[hm]).mean()) if hm.sum() > 10 else 0.0
    return s_rb, h_rb


def _global_motion(prev: np.ndarray, cur: np.ndarray) -> tuple[float, float, float]:
    """Translation via phase correlation + scale via log-polar phase correlation."""
    p = prev.astype(np.float32)
    c = cur.astype(np.float32)
    win = cv2.createHanningWindow((p.shape[1], p.shape[0]), cv2.CV_32F)
    try:
        (dx, dy), _ = cv2.phaseCorrelate(p, c, win)
    except cv2.error:
        dx = dy = 0.0

    zoom = 1.0
    try:
        h, w = p.shape
        centre = (w / 2.0, h / 2.0)
        maxr = min(w, h) / 2.0
        flags = cv2.INTER_LINEAR + cv2.WARP_FILL_OUTLIERS + cv2.WARP_POLAR_LOG
        lp_p = cv2.warpPolar(p, (w, h), centre, maxr, flags)
        lp_c = cv2.warpPolar(c, (w, h), centre, maxr, flags)
        (sx, _sy), _ = cv2.phaseCorrelate(
            np.ascontiguousarray(lp_p), np.ascontiguousarray(lp_c)
        )
        klog = w / np.log(maxr) if maxr > 1 else 1.0
        zoom = float(np.exp(sx / klog)) if klog else 1.0
        if not (0.5 < zoom < 2.0):
            zoom = 1.0
    except cv2.error:
        zoom = 1.0

    return float(dx), float(dy), zoom


def _hsv_hist(bgr: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, [8, 8, 8], [0, 180, 0, 256, 0, 256])
    hist = hist / (hist.sum() + 1e-9)   # L1 -> a real probability distribution
    return hist.flatten().astype(np.float32)


def analyze_frames(
    path: str,
    analysis_width: int = 384,
    crop: int = 512,
    max_frames: int | None = None,
    stride: int = 1,
    thumb_count: int = 240,
    progress: bool = True,
) -> tuple[Track, np.ndarray, list[np.ndarray], list[float]]:
    """Decode once, measure everything.

    Returns (track, hist_matrix, thumbnails, thumbnail_times).
    """
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {path}")

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0

    tr = Track()
    hists: list[np.ndarray] = []
    thumbs: list[np.ndarray] = []
    thumb_t: list[float] = []
    planned = (total // stride) if total else 0
    thumb_every = max(1, planned // thumb_count) if planned else 30

    prev_small_gray: np.ndarray | None = None
    kept = 0
    i = -1

    while True:
        ok = cap.grab()
        if not ok:
            break
        i += 1
        if i % stride:
            continue
        ok, frame = cap.retrieve()
        if not ok or frame is None:
            break

        pos_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
        t = pos_ms / 1000.0 if pos_ms and pos_ms > 0 else (i / fps if fps else float(i))

        H, W = frame.shape[:2]
        scale = analysis_width / float(W)
        small = cv2.resize(frame, (analysis_width, max(2, int(round(H * scale)))),
                           interpolation=cv2.INTER_AREA)
        small_gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        smallf = small_gray.astype(np.float32)

        # --- locate letterbox/pillarbox bars BEFORE any other measurement ---
        bt, bb, bl, br = _bars(small_gray)
        inv = 1.0 / scale
        ay0, ay1 = int(bt * inv), H - int(bb * inv)
        ax0, ax1 = int(bl * inv), W - int(br * inv)
        if ay1 - ay0 < 16 or ax1 - ax0 < 16:
            ay0, ay1, ax0, ax1 = 0, H, 0, W
        active = frame[ay0:ay1, ax0:ax1]
        aH, aW = active.shape[:2]

        # active-area copy of the downscaled frame, for vignette
        active_small_gray = small_gray[bt: small_gray.shape[0] - bb if bb else None,
                                       bl: small_gray.shape[1] - br if br else None]
        if active_small_gray.size < 64:
            active_small_gray = small_gray

        # --- native-res centre crop of the ACTIVE picture for high-frequency work ---
        cw = min(crop, aW)
        chh = min(crop, aH)
        x0 = (aW - cw) // 2
        y0 = (aH - chh) // 2
        patch = active[y0:y0 + chh, x0:x0 + cw]
        patch_gray = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)

        # --- exposure / contrast ---
        tr.luma_mean.append(float(smallf.mean()))
        tr.luma_std.append(float(smallf.std()))
        p01, p50, p99 = np.percentile(smallf, [1, 50, 99])
        tr.luma_p01.append(float(p01))
        tr.luma_p50.append(float(p50))
        tr.luma_p99.append(float(p99))
        tr.clip_low.append(float((smallf <= 2).mean()))
        tr.clip_high.append(float((smallf >= 253).mean()))

        # --- colour ---
        hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
        tr.sat_mean.append(float(hsv[:, :, 1].mean()))
        tr.colorfulness.append(_colorfulness(small))
        bm, gm, rm = (float(small[:, :, k].mean()) for k in range(3))
        tr.b_mean.append(bm)
        tr.g_mean.append(gm)
        tr.r_mean.append(rm)
        tr.warm_ratio.append((rm + 1e-6) / (bm + 1e-6))
        s_rb, h_rb = _split_tone(small, small_gray)
        tr.shadow_rb.append(s_rb)
        tr.highlight_rb.append(h_rb)

        # --- texture / optics ---
        tr.sharp.append(float(cv2.Laplacian(small_gray, cv2.CV_32F).var()))
        tr.noise.append(_noise_sigma(patch_gray))
        tr.edge_density.append(float((cv2.Canny(small_gray, 60, 180) > 0).mean()))
        tr.halo.append(_halo_score(patch_gray))
        tr.glow.append(_glow_score(small_gray))
        ca_u, ca_r = _rgb_split(patch)
        tr.ca.append(ca_u)
        tr.ca_radial.append(ca_r)
        tr.vignette.append(_vignette(active_small_gray))

        tr.bar_top.append(bt)
        tr.bar_bottom.append(bb)
        tr.bar_left.append(bl)
        tr.bar_right.append(br)

        # --- temporal ---
        hists.append(_hsv_hist(small))
        if prev_small_gray is None:
            tr.mad.append(0.0)
            tr.hist_dist.append(0.0)
            tr.dx.append(0.0)
            tr.dy.append(0.0)
            tr.zoom.append(1.0)
            tr.motion.append(0.0)
            tr.dup.append(False)
        else:
            mad = float(np.abs(smallf - prev_small_gray).mean())
            tr.mad.append(mad)
            d = float(cv2.compareHist(hists[-2], hists[-1], cv2.HISTCMP_BHATTACHARYYA))
            tr.hist_dist.append(d)
            dx, dy, zoom = _global_motion(prev_small_gray, smallf)
            tr.dx.append(dx)
            tr.dy.append(dy)
            tr.zoom.append(zoom)
            tr.motion.append(float(np.hypot(dx, dy)))
            tr.dup.append(mad < 0.35)

        tr.t.append(t)
        tr.idx.append(i)
        prev_small_gray = smallf

        if kept % thumb_every == 0 and len(thumbs) < thumb_count * 2:
            th = cv2.resize(frame, (160, max(2, int(round(H * 160.0 / W)))),
                            interpolation=cv2.INTER_AREA)
            thumbs.append(th)
            thumb_t.append(t)

        kept += 1
        if max_frames and kept >= max_frames:
            break
        if progress and kept % 300 == 0:
            print(f"  ... {kept} frames analysed ({t:6.1f}s)", flush=True)

    cap.release()
    return tr, np.asarray(hists, dtype=np.float32), thumbs, thumb_t


def grab_frames(path: str, times: list[float], max_width: int = 1280) -> list[np.ndarray]:
    """Second pass: pull full-resolution frames at given timestamps."""
    out: list[np.ndarray] = []
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return out
    for t in times:
        cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, t) * 1000.0)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        h, w = frame.shape[:2]
        if w > max_width:
            frame = cv2.resize(frame, (max_width, int(round(h * max_width / w))),
                               interpolation=cv2.INTER_AREA)
        out.append(frame)
    cap.release()
    return out
