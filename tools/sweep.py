#!/usr/bin/env python3
"""Robustness sweep: every engine x every continuous parameter at 0 and 1 (+ shapes, palettes, seeds).
Flags frames that are pure black, pure white, or contain NaN-looking artefacts (uniform frames)."""
import os
import sys
import itertools
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_shader as G   # noqa: E402
import preview as V      # noqa: E402

W, H = 128, 72
bad, total = [], 0
cont = [n for n, k, _ in G.PARAMS if k == "range"]


def check(label, **kw):
    global total
    total += 1
    img = V.render(W, H, **kw).astype(np.float32)
    m, s = img.mean(), img.std()
    if m < 1.0 or m > 253.0 or s < 0.8:
        bad.append((label, round(float(m), 1), round(float(s), 2)))


for e, (en, _) in enumerate(G.ENGINES):
    check("%s default" % en, Engine=e)
    for n in cont:
        for v in (0.0, 1.0):
            check("%s %s=%.0f" % (en, n, v), Engine=e, **{n: v})
    for s in range(len(G.SHAPES)):
        check("%s shape=%d" % (en, s), Engine=e, Shape=s)
    for pi in range(len(G.PALETTES) + 1):
        check("%s palette=%d" % (en, pi), Engine=e, Palette=pi)
    for sd in (0.0, 0.0001, 0.37, 0.9999):
        check("%s seed=%.4f" % (en, sd), Engine=e, Seed=sd)
    for t in (0.0, 1.0, 600.0, 36000.0):
        check("%s t=%g" % (en, t), Engine=e, t=t)
    check("%s Invert" % en, Engine=e, Invert=1.0)
    check("%s Reverse+Pulse" % en, Engine=e, Pulse=1.0, Reverse=1.0)

print("frames rendered:", total)
print("suspicious frames:", len(bad))
for b in bad:
    print("  ", b)
