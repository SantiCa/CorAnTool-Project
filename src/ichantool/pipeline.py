"""Core analysis: label mask -> continuous series per depth bin."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .depth import depth_to_age, pixel_depths
from .indices import DEFAULT_SCHEMES, IndexScheme
from .io import load_image
from .segmentation import mask_from_threshold


@dataclass
class CoreSection:
    """Result for one core section. ``data`` has one row per depth bin."""
    name: str
    top: float
    bottom: float
    units: str
    bin_px: int
    class_names: list[str]
    data: pd.DataFrame
    metadata: dict = field(default_factory=dict)

    def add_age(self, model_depth, model_age, extrapolate: bool = False) -> "CoreSection":
        self.data["age"] = depth_to_age(self.data["depth"], model_depth, model_age, extrapolate)
        return self


def _edge(j: int, bin_px: float) -> int:
    return int(np.floor(j * bin_px + 0.5))


def bin_edges(n: int, bin_px: float, keep_partial: bool = True) -> list[tuple[int, int]]:
    """Row ranges of the bins: bin j spans [floor(j*bin_px + 0.5), floor((j+1)*bin_px + 0.5)).

    Same rule as ``binRows`` in the web app (V0.1). bin_px may be fractional (interval in cm × px/cm);
    an integer bin_px gives the classic fixed-size bins. The last bin is clipped at n (dropped if
    keep_partial is False).
    """
    out, j = [], 0
    while _edge(j, bin_px) < n:
        end = _edge(j + 1, bin_px)
        if end > n and not keep_partial:
            break
        out.append((_edge(j, bin_px), min(n, end)))
        j += 1
    return out


def _binned_mean(values: np.ndarray, bin_px: float, keep_partial: bool) -> np.ndarray:
    rng = bin_edges(values.shape[0], bin_px, keep_partial)
    return np.array([values[a:b].mean(axis=0) for a, b in rng]).reshape(len(rng), *values.shape[1:])


def analyze_mask(mask: np.ndarray, top: float, bottom: float, *, units: str = "cm",
                 bin_px: float = 1, bin_cm: float | None = None, class_names: Sequence[str] | None = None,
                 schemes: Sequence[IndexScheme] = DEFAULT_SCHEMES,
                 keep_partial: bool = True, name: str = "section_1") -> CoreSection:
    """Compute bioturbation percentage (total and per class) along depth.

    mask: 2-D int array, 0 = matrix, 1..n = bioturbation classes; row 0 = top.
    bin_px: number of pixel rows averaged into each data point (may be fractional).
    bin_cm: interval thickness in cm; if given, bin_px = bin_cm × pixel rows per cm (as in the web app).
    """
    mask = np.asarray(mask)
    if mask.ndim != 2:
        raise ValueError("mask must be 2-D")
    if bin_cm is not None:
        span_cm = (bottom - top) * {"mm": 0.1, "cm": 1.0, "m": 100.0}[units]
        bin_px = bin_cm * mask.shape[0] / span_cm
    if bin_px < 1:
        raise ValueError("bin_px must be >= 1")
    n_rows, n_cols = mask.shape
    n_classes = int(mask.max()) if mask.size else 0
    names = list(class_names) if class_names else [f"class_{i}" for i in range(1, n_classes + 1)]
    if len(names) < n_classes:
        raise ValueError("fewer class_names than classes present in the mask")

    row_total = (mask > 0).mean(axis=1) * 100
    depths = pixel_depths(n_rows, top, bottom)

    cols = {
        "depth": _binned_mean(depths, bin_px, keep_partial),
        "bioturbation_pct": _binned_mean(row_total, bin_px, keep_partial),
    }
    if len(names) > 1:
        for label, cname in enumerate(names, start=1):
            row_c = (mask == label).mean(axis=1) * 100
            cols[f"{cname}_pct"] = _binned_mean(row_c, bin_px, keep_partial)
    df = pd.DataFrame(cols)
    for scheme in schemes:
        df[scheme.name] = scheme.classify(df["bioturbation_pct"].to_numpy())
    df.insert(0, "section", name)

    return CoreSection(name=name, top=top, bottom=bottom, units=units, bin_px=bin_px,
                       class_names=names, data=df,
                       metadata={"image_rows": n_rows, "image_cols": n_cols,
                                 "px_per_unit": n_rows / (bottom - top)})


def analyze_image(path, top: float, bottom: float, *, threshold: float = 5, **kwargs) -> CoreSection:
    """v2.1-compatible entry point: treated image with bioturbation painted black."""
    mask, names = mask_from_threshold(load_image(path), threshold)
    return analyze_mask(mask, top, bottom, class_names=names, **kwargs)
