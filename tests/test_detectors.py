#!/usr/bin/env python3
"""Score the detectors against a clip whose effects we know exactly.

Run:  python3 tests/test_detectors.py
Exits non-zero if any required detection regresses.
"""

from __future__ import annotations

import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.make_fixture import build  # noqa: E402
from vfxscan import metrics  # noqa: E402
from vfxscan.cli import run  # noqa: E402

FIXTURE = "tests/fixture_known_effects.mp4"
OUT = "/tmp/vfxscan_selftest"

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


class Score:
    def __init__(self) -> None:
        self.rows: list[tuple[str, str, str, bool]] = []
        self.failed = 0

    def check(self, name: str, expected: str, got: str, ok: bool, required: bool = True) -> None:
        self.rows.append((name, expected, got, ok))
        if not ok and required:
            self.failed += 1

    def report(self) -> int:
        w = max(len(r[0]) for r in self.rows) + 2
        print(f"\n{'':<{w}}{'expected':<34}{'measured':<34}")
        print("-" * (w + 70))
        for name, exp, got, ok in self.rows:
            mark = f"{GREEN}PASS{RESET}" if ok else f"{RED}FAIL{RESET}"
            print(f"{name:<{w}}{exp:<34}{got:<34}{mark}")
        print("-" * (w + 70))
        total = len(self.rows)
        passed = sum(1 for r in self.rows if r[3])
        print(f"{passed}/{total} checks passed")
        return 1 if self.failed else 0


def near(a: float, b: float, tol: float) -> bool:
    return abs(a - b) <= tol


def main() -> int:
    s = Score()

    # ---------- unit: sub-pixel channel shift recovery ----------
    if not os.path.exists(FIXTURE):
        build(FIXTURE)
    cap = cv2.VideoCapture(FIXTURE)
    cap.set(cv2.CAP_PROP_POS_MSEC, 2000)
    ok, frame = cap.read()
    cap.release()
    if ok:
        patch = frame[:, :512].astype(np.float32)
        g = metrics._norm_grad(patch[:, :, 1])
        errs = []
        for truth in (0, 2, -3, 4, 7):
            r = metrics._norm_grad(np.roll(patch[:, :, 2], truth, axis=1))
            errs.append(abs(metrics._best_shift(g, r, 10) - truth))
        worst = max(errs)
        s.check("channel-shift unit", "recover 0/±2/±3/4/7px", f"max error {worst:.2f}px",
                worst < 0.8)

    # ---------- end-to-end ----------
    data = run(FIXTURE, OUT, quiet=True)
    ev = data["events"]
    names = {f["name"] for f in data["findings"]}
    where = {f["name"]: f["where"] for f in data["findings"]}

    def find(kind: str) -> list[dict]:
        return [e for e in ev if e["kind"] == kind]

    # --- transitions (ground truth: cut 5.0, dissolve 8-9, fade 13-14) ---
    cuts = find("hard_cut")
    s.check("hard cut", "1 @ 5.00s",
            f"{len(cuts)} @ " + (f"{cuts[0]['t_end']:.2f}s" if cuts else "-"),
            len(cuts) == 1 and near(cuts[0]["t_end"], 5.0, 0.15))

    dis = find("dissolve")
    s.check("dissolve", "1 @ 8.00-9.00s",
            f"{len(dis)} @ " + (f"{dis[0]['t_start']:.2f}-{dis[0]['t_end']:.2f}s" if dis else "-"),
            len(dis) == 1 and near(dis[0]["t_start"], 8.0, 0.2) and near(dis[0]["t_end"], 9.0, 0.2))

    fades = find("fade_black")
    s.check("fade to black", "1 @ 13.00-14.00s",
            f"{len(fades)} @ " + (f"{fades[0]['t_start']:.2f}-{fades[0]['t_end']:.2f}s" if fades else "-"),
            len(fades) == 1 and near(fades[0]["t_start"], 13.0, 0.2))

    shots = data["shots"]
    s.check("shot count", "3", str(len(shots)), len(shots) == 3)

    # --- effects, with the shot they belong to ---
    def has(substr: str) -> str | None:
        for n in names:
            if substr.lower() in n.lower():
                return n
        return None

    checks = [
        ("lifted blacks", "lifted blacks", "0:00.1"),
        ("vignette", "vignette", "0:00.1"),
        ("film grain", "film grain", None),
        ("letterbox", "letterbox", "0:05.1"),
        ("RGB split", "rgb channel split", "0:05.1"),
        ("cool cast (shot B)", "cool white balance", "0:05.1"),
        ("slow zoom", "ken burns", "0:00.1"),
        ("text overlay", "persistent overlay", None),
    ]
    for label, needle, shot_hint in checks:
        n = has(needle)
        got = "not detected" if not n else (where[n][:32])
        ok = n is not None and (shot_hint is None or shot_hint in where[n])
        s.check(label, f"found{f' in shot @{shot_hint}' if shot_hint else ''}", got, ok)

    # --- things that must NOT be reported ---
    fps_hit = [f for f in data["probe"]["fingerprints"] if "Final Cut" in f]
    s.check("no bogus editor", "no Final Cut Pro", str(fps_hit or "clean"), not fps_hit)

    vig_shot3 = "0:09.1" in where.get(has("vignette") or "", "")
    s.check("no vignette on shot C", "absent from 0:09.1", "present" if vig_shot3 else "absent",
            not vig_shot3)

    return s.report()


if __name__ == "__main__":
    raise SystemExit(main())
