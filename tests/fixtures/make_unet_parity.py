"""Writes unet_parity.json: reference outputs of the shared U-Net tiling rules (V0.15).
Run from the repository root: python tests/fixtures/make_unet_parity.py. Python and JS tests compare against it."""
import json
from pathlib import Path

import numpy as np

from ichantool.unet.tiling import UnetConfig, blend_window, predict_proba, resample_bilinear, tile_starts

W, H, ROI = 50, 37, (3, 2, 47, 35)  # x0, y0, x1, y1


def image():
    y, x = np.mgrid[0:H, 0:W]
    return np.stack([(x * 37 + y * 11) % 256, (x * 5 + y * 29) % 256, (x * y) % 256], -1).astype(np.uint8)


def run1(t):
    return (t[0] - 0.5 * t[2])[None]


def run3(t):
    return np.stack([t[0], t[1], t[2]])


def compute():
    img = image()
    x0, y0, x1, y1 = ROI
    crop = img[y0:y1, x0:x1]
    cfg = UnetConfig(tile=16, overlap=4)
    p1, _ = predict_proba(run1, crop, cfg, 1.3)
    p3, c3 = predict_proba(run3, crop, cfg, 1.0)
    return {"w": W, "h": H, "roi": ROI, "tile": 16, "overlap": 4,
            "tileStarts": [tile_starts(n, t, o) for n, t, o in [(10, 16, 4), (16, 16, 4), (17, 16, 4), (100, 32, 8), (95, 32, 8)]],
            "blend": [round(float(v), 6) for v in blend_window(8, 3)],
            "resampled": resample_bilinear(img, 23, 31).reshape(-1).tolist(),
            "prob1": [round(float(v), 5) for v in p1.reshape(-1)],
            "prob3": [round(float(v), 5) for v in p3.reshape(-1)], "cls3": c3.reshape(-1).tolist()}


if __name__ == "__main__":
    out = Path(__file__).with_name("unet_parity.json")
    out.write_text(json.dumps(compute(), separators=(",", ":")), encoding="utf-8")
    print(out)
