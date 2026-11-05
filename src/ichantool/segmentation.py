"""Building label masks from treated images.

A label mask is a 2-D integer array: 0 = non-bioturbated matrix,
1..n = bioturbation classes (e.g. ichnotaxa).

Current methods reproduce the published workflow (features painted on
the image). Future learned segmenters (e.g. U-Net) should expose the
same output: ``(mask, class_names)``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np

from .io import to_gray


def mask_from_threshold(img: np.ndarray, threshold: float = 5,
                        class_name: str = "bioturbation") -> tuple[np.ndarray, list[str]]:
    """Binary mask: pixels with gray value <= threshold are bioturbation.

    This is the v2.1 behaviour (features painted black, threshold 5).
    """
    mask = (to_gray(img) <= threshold).astype(np.int32)
    return mask, [class_name]


def _hex_to_rgb(color: str | Sequence[int]) -> np.ndarray:
    if isinstance(color, str):
        c = color.lstrip("#")
        return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.int32)
    return np.asarray(color[:3], dtype=np.int32)


def mask_from_palette(img: np.ndarray, palette: Mapping[str, str | Sequence[int]],
                      tolerance: int = 10) -> tuple[np.ndarray, list[str]]:
    """Multi-class mask from a colour-coded image.

    palette: {"Zoophycos": "#ff0000", "Chondrites": (0, 0, 255), ...}
    A pixel belongs to a class when every RGB channel is within
    ``tolerance`` of the class colour. Unmatched pixels are background.
    """
    if img.ndim != 3:
        raise ValueError("Palette masks need an RGB image.")
    rgb = img[..., :3].astype(np.int32)
    mask = np.zeros(rgb.shape[:2], dtype=np.int32)
    names = list(palette)
    for label, name in enumerate(names, start=1):
        ref = _hex_to_rgb(palette[name])
        hit = np.all(np.abs(rgb - ref) <= tolerance, axis=-1) & (mask == 0)
        mask[hit] = label
    return mask, names


def mask_from_unet(img: np.ndarray, model, px_per_cm: float | None = None,
                   threshold: float = 0.5) -> tuple[np.ndarray, list[str]]:
    """Label mask from a trained U-Net (V0.15).

    ``model``: path to the .onnx file (its .json next to it) or an ``ichantool.unet.predict.OnnxUnet``.
    ``px_per_cm`` of the image, so it is resampled to the training resolution. Pixels with probability of
    bioturbation >= ``threshold`` get class 1 (binary model) or the most probable class (multi-class model).
    """
    from .unet.predict import OnnxUnet

    net = model if isinstance(model, OnnxUnet) else OnnxUnet(model)
    rgb = img if img.ndim == 3 else np.repeat(img[..., None], 3, axis=2)
    prob, cls = net.predict(rgb[..., :3].astype(np.uint8), px_per_cm)
    on = prob >= threshold
    mask = np.where(on, cls if cls is not None else 1, 0).astype(np.int32)
    return mask, list(net.config.classes)
