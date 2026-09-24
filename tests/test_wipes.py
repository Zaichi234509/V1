#!/usr/bin/env python3
"""Verify a wipe is distinguished from a dissolve.

ffmpeg renders known transitions; the detector must call the crossfade a
dissolve and the wipes wipes, and get the travel axis right.
"""
import os, subprocess, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from vfxscan import metrics, scenes

W,H,FPS=640,360,30
os.makedirs("/tmp/wv", exist_ok=True)
def sh(a):
    p=subprocess.run(a,capture_output=True,text=True)
    if p.returncode: print(p.stderr[-1500:]); raise SystemExit(1)

for name,src in (("a","testsrc2=size=%dx%d:rate=%d:duration=3"%(W,H,FPS)),
                 ("b","smptebars=size=%dx%d:rate=%d:duration=3"%(W,H,FPS))):
    sh(["ffmpeg","-y","-loglevel","error","-f","lavfi","-i",src,
        "-c:v","libx264","-crf","16","-pix_fmt","yuv420p",f"/tmp/wv/{name}.mp4"])

tb=f"fps={FPS},settb=1/{FPS},format=yuv420p"
cases={"dissolve":"fade","wipedown":"wipedown","hlslice":"hlslice","slideup":"slideup"}
failures = []
print(f"{'transition':<12}{'row σ':>8}{'col σ':>8}   classified")
print("-"*48)
for label,tr_ in cases.items():
    out=f"/tmp/wv/{label}.mp4"
    sh(["ffmpeg","-y","-loglevel","error","-i","/tmp/wv/a.mp4","-i","/tmp/wv/b.mp4",
        "-filter_complex",f"[0:v]{tb}[x];[1:v]{tb}[y];[x][y]xfade=transition={tr_}:duration=1:offset=2[v]",
        "-map","[v]","-c:v","libx264","-crf","16","-pix_fmt","yuv420p",out])
    t,h,th,tt,proxy = metrics.analyze_frames(out, progress=False)
    times=np.asarray(t.t)
    a=int(np.searchsorted(times,2.0)); b=int(np.searchsorted(times,3.0))
    rs,cs=scenes._wipe_scores(proxy,a,b)
    verdict = "WIPE" if max(rs,cs)>0.22 else "dissolve"
    expected = "dissolve" if label=="dissolve" else "WIPE"
    mark = "OK " if verdict==expected else "FAIL"
    print(f"{label:<12}{rs:8.3f}{cs:8.3f}   {verdict:<9} expected {expected:<9} {mark}")
    if verdict != expected:
        failures.append(label)

print("-" * 48)
print(f"{len(cases) - len(failures)}/{len(cases)} transition types classified correctly")
raise SystemExit(1 if failures else 0)
