"""Tiling, normalisation, blending and resampling for the U-Net (V0.15).

Identical rules to ``app/js/unet.js``; tests in both languages check the same values:

* tile starts along an axis: step ``tile - overlap``, last tile flush with the end, one tile if ``len <= tile``;
* edge padding (coordinates clamped) for images smaller than a tile;
* blending weight per axis ``min(1, (i + 0.5) / overlap, (tile - i - 0.5) / overlap)``, 2-D weight = product;
* bilinear resampling with aligned pixel centres ``xs = (x + 0.5) * w / W - 0.5`` (clamped);
* sigmoid (one output channel) or softmax (several; channel 0 = matrix) of logits.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

import numpy as np

IGNORE = 255


@dataclass
class UnetConfig:
    """Description of a trained model (the JSON written next to the .onnx file)."""
    tile: int = 512
    overlap: int = 64
    mean: Sequence[float] = (0.485, 0.456, 0.406)
    std: Sequence[float] = (0.229, 0.224, 0.225)
    px_per_cm: float | None = None
    classes: list[str] = field(default_factory=lambda: ["bioturbation"])
    output: str = "logits"  # or "probs"

    def to_json(self) -> dict:
        return {"tile": self.tile, "overlap": self.overlap, "mean": list(self.mean), "std": list(self.std),
                "pxPerCm": self.px_per_cm, "classes": list(self.classes), "output": self.output}

    @classmethod
    def from_json(cls, d: dict) -> "UnetConfig":
        return cls(tile=d.get("tile", 512), overlap=d.get("overlap", 64), mean=d.get("mean", cls.mean),
                   std=d.get("std", cls.std), px_per_cm=d.get("pxPerCm"),
                   classes=d.get("classes", ["bioturbation"]), output=d.get("output", "logits"))


def tile_starts(length: int, tile: int, overlap: int) -> list[int]:
    if length <= tile:
        return [0]
    step = max(1, tile - overlap)
    out, s = [], 0
    while s + tile < length:
        out.append(s)
        s += step
    if out[-1] != length - tile:
        out.append(length - tile)
    return out


def blend_window(tile: int, overlap: int) -> np.ndarray:
    i = np.arange(tile, dtype=np.float64)
    if overlap <= 0:
        return np.ones(tile)
    return np.minimum(1.0, np.minimum((i + 0.5) / overlap, (tile - i - 0.5) / overlap))


def resample_bilinear(img: np.ndarray, out_h: int, out_w: int) -> np.ndarray:
    """Bilinear resampling of an (h, w) or (h, w, c) array; uint8 input is rounded half to even and clipped."""
    h, w = img.shape[:2]
    a = img.astype(np.float64)
    sy, sx = h / out_h, w / out_w  # same operation order as the JS version (exact uint8 parity)
    fy = np.clip((np.arange(out_h) + 0.5) * sy - 0.5, 0, h - 1)
    fx = np.clip((np.arange(out_w) + 0.5) * sx - 0.5, 0, w - 1)
    y0, x0 = np.floor(fy).astype(int), np.floor(fx).astype(int)
    y1, x1 = np.minimum(h - 1, y0 + 1), np.minimum(w - 1, x0 + 1)
    ty, tx = fy - y0, fx - x0
    if a.ndim == 3:
        ty, tx = ty[:, None, None], tx[None, :, None]
    else:
        ty, tx = ty[:, None], tx[None, :]
    top = a[y0][:, x0] * (1 - tx) + a[y0][:, x1] * tx
    bot = a[y1][:, x0] * (1 - tx) + a[y1][:, x1] * tx
    out = top * (1 - ty) + bot * ty
    if img.dtype == np.uint8:
        return np.clip(np.rint(out), 0, 255).astype(np.uint8)
    return out.astype(img.dtype if np.issubdtype(img.dtype, np.floating) else np.float64)


def tile_input(rgb: np.ndarray, x0: int, y0: int, tile: int, mean, std) -> np.ndarray:
    """(3, tile, tile) float32 input for the tile at (x0, y0) of an (h, w, 3) uint8 image, edge padded."""
    h, w = rgb.shape[:2]
    ys = np.minimum(h - 1, y0 + np.arange(tile))
    xs = np.minimum(w - 1, x0 + np.arange(tile))
    t = rgb[ys][:, xs, :3].astype(np.float32) / 255.0
    t = (t - np.asarray(mean, np.float32)) / np.asarray(std, np.float32)
    return np.ascontiguousarray(t.transpose(2, 0, 1))


def to_probs(out: np.ndarray, logits: bool = True) -> np.ndarray:
    """(C, H, W) network output to probabilities."""
    out = out.astype(np.float64)
    if not logits:
        return out
    if out.shape[0] == 1:
        return 1.0 / (1.0 + np.exp(-out))
    e = np.exp(out - out.max(axis=0, keepdims=True))
    return e / e.sum(axis=0, keepdims=True)


def predict_proba(run: Callable[[np.ndarray], np.ndarray], rgb: np.ndarray, cfg: UnetConfig,
                  scale: float = 1.0) -> tuple[np.ndarray, np.ndarray | None]:
    """Probability of bioturbation (h, w) and, for several classes, argmax class 1..C-1 (else None).

    ``run`` takes a (3, tile, tile) float32 array and returns the (C, tile, tile) output.
    ``scale`` = model px/cm / image px/cm (the image is resampled when it differs from 1 by more than 2 %).
    """
    h, w = rgb.shape[:2]
    img, H, W = rgb, h, w
    if abs(scale - 1) > 0.02:
        H, W = max(1, round(h * scale)), max(1, round(w * scale))
        img = resample_bilinear(rgb[..., :3], H, W)
    T = cfg.tile
    xs, ys, win = tile_starts(W, T, cfg.overlap), tile_starts(H, T, cfg.overlap), blend_window(T, cfg.overlap)
    w2 = np.outer(win, win)
    acc, wsum = None, np.zeros((H, W))
    for y0 in ys:
        for x0 in xs:
            p = to_probs(np.asarray(run(tile_input(img, x0, y0, T, cfg.mean, cfg.std))), cfg.output != "probs")
            if acc is None:
                acc = np.zeros((p.shape[0], H, W))
            hh, ww = min(T, H - y0), min(T, W - x0)
            acc[:, y0:y0 + hh, x0:x0 + ww] += w2[:hh, :ww] * p[:, :hh, :ww]
            wsum[y0:y0 + hh, x0:x0 + ww] += w2[:hh, :ww]
    acc /= np.where(wsum > 0, wsum, 1)
    planes = acc if (H, W) == (h, w) else resample_bilinear(acc.transpose(1, 2, 0), h, w).transpose(2, 0, 1)
    if planes.shape[0] == 1:
        return planes[0], None
    cls = 1 + np.argmax(planes[1:], axis=0)
    return 1 - planes[0], cls.astype(np.uint8)
