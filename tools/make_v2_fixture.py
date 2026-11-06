#!/usr/bin/env python3
"""V0.49: fixture for the automatic web–V2 comparison (tests/app/v2.test.mjs).

Decodes examples/data/idealized_core_0-500cm.jpg with Pillow (as the Python package does) and stores the V2.1 mask
(grey = 0.30 R + 0.56 G + 0.11 B ≤ 5, legacy/v2.1_console) run-length encoded
(`[value, run, value, run, …]`, row-major, as core.js::rleDecode reads it). With this decoder the web app's criterion
(L = 0.299 R + 0.587 G + 0.114 B < 6) selects exactly the same pixels, which the script checks.
Run again only if the image changes.
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from ichantool.io import load_image, to_gray  # noqa: E402


def rle(mask: np.ndarray) -> list[int]:
    flat = mask.astype(np.int8).ravel()
    edges = np.flatnonzero(np.diff(flat)) + 1
    starts = np.concatenate(([0], edges))
    runs = np.diff(np.concatenate((starts, [flat.size])))
    out = np.empty(2 * len(starts), dtype=np.int64)
    out[0::2] = flat[starts]
    out[1::2] = runs
    return out.tolist()


raw = load_image(ROOT / "examples" / "data" / "idealized_core_0-500cm.jpg")
img = raw.astype(np.float64)
h, w = img.shape[:2]
v2 = to_gray(raw) <= 5   # same call as mask_from_threshold (pipeline.analyze_image)
lum = 0.299 * img[..., 0] + 0.587 * img[..., 1] + 0.114 * img[..., 2]
web = lum < 6
assert (v2 == web).all(), "V2 and web criteria differ on the Pillow-decoded image"
out = {"source": "examples/data/idealized_core_0-500cm.jpg", "decoder": "Pillow", "w": w, "h": h, "top": 0, "bottom": 500,
       "binPx": 150, "mask": rle(v2)}
dst = ROOT / "tests" / "app" / "fixtures" / "v2_idealized_masks.json"
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
print(dst, dst.stat().st_size, "bytes;", int(v2.sum()), "bioturbated px")
