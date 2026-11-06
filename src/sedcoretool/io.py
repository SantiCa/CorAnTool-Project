"""Image input. Images are oriented with the core top at row 0."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

SUPPORTED = {".png", ".tif", ".tiff", ".jpg", ".jpeg", ".bmp"}
LOSSY = {".jpg", ".jpeg"}


def load_image(path: str | Path, mode: str | None = None) -> np.ndarray:
    """Load an image as a numpy array.

    mode: optional PIL mode ("L" grayscale, "RGB"). None keeps the original.
    Lossy formats (JPEG) are accepted but discouraged for masks, because
    compression alters the pixel values the analysis relies on.
    """
    path = Path(path)
    if path.suffix.lower() not in SUPPORTED:
        raise ValueError(f"Unsupported format {path.suffix!r}; use one of {sorted(SUPPORTED)}")
    with Image.open(path) as im:
        if mode is not None:
            im = im.convert(mode)
        elif im.mode not in ("L", "RGB", "RGBA", "I", "I;16"):
            im = im.convert("RGB")
        return np.asarray(im)


def load_mask(path: str | Path) -> np.ndarray:
    """Load a label mask (0 = background, 1..n = classes) saved as PNG/TIFF."""
    arr = load_image(path)
    if arr.ndim != 2:
        raise ValueError("A label mask must be single-channel (2-D). "
                         "For colour-coded masks use segmentation.mask_from_palette.")
    return arr.astype(np.int32)


def to_gray(img: np.ndarray) -> np.ndarray:
    """Luminance conversion (same weights as v2.1: 0.30, 0.56, 0.11)."""
    if img.ndim == 2:
        return img.astype(np.float64)
    rgb = img[..., :3].astype(np.float64)
    return rgb @ np.array([0.30, 0.56, 0.11])
