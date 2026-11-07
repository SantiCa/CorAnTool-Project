"""Core analysis: label mask -> continuous series per depth bin."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .depth import depth_to_age
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


def _bin_sums(values: np.ndarray, rng: list[tuple[int, int]]) -> np.ndarray:
    return np.array([values[a:b].sum(axis=0) for a, b in rng], dtype=float).reshape(len(rng), *values.shape[1:])


UNIT_TO_CM = {"mm": 0.1, "cm": 1.0, "m": 100.0}


def _unit_factor(units: str) -> float:
    try:
        return UNIT_TO_CM[units]
    except KeyError:
        raise ValueError(f"units must be one of {sorted(UNIT_TO_CM)}, not {units!r}") from None


def analyze_mask(mask: np.ndarray, top: float, bottom: float, *, units: str = "cm",
                 bin_px: float = 1, bin_cm: float | None = None, class_names: Sequence[str] | None = None,
                 schemes: Sequence[IndexScheme] = DEFAULT_SCHEMES, exclude: np.ndarray | None = None,
                 min_valid: float = 0.2, keep_partial: bool = True, name: str = "section_1") -> CoreSection:
    """Compute bioturbation percentage (total and per class) along depth.

    mask: 2-D int array, 0 = matrix, 1..n = bioturbation classes; row 0 = top.
    bin_px: number of pixel rows averaged into each data point (may be fractional).
    bin_cm: interval thickness in cm; if given, bin_px = bin_cm × pixel rows per cm (as in the web app).
    exclude: optional 2-D boolean array of the same size; True = excluded pixel (crack, gap, sample), as the
    program's exclusion layer. Percentages are 100 · Σ bioturbated / Σ valid pixels of each interval.
    min_valid: an interval with less than this fraction of valid pixels has no data (NaN, indices empty).

    Overlapping traces (V0.20, as in the web app): mask may instead be a 3-D boolean stack
    (n_classes, rows, cols), one layer per class. A pixel is bioturbated once if any layer is set, and
    counts for every class whose layer is set, so the class percentages may add up to more than the total.
    """
    mask = np.asarray(mask)
    layers = None
    if mask.ndim == 3:
        layers = mask.astype(bool)
        mask = layers.any(axis=0).astype(np.int32)
    elif mask.ndim != 2:
        raise ValueError("mask must be 2-D, or 3-D (classes, rows, cols) for overlapping traces")
    if bottom <= top:
        raise ValueError("bottom depth must be greater than top depth")
    if bin_cm is not None:
        if bin_cm <= 0:
            raise ValueError("bin_cm must be positive")
        bin_px = bin_cm * mask.shape[0] / ((bottom - top) * _unit_factor(units))
    if bin_px < 1:
        raise ValueError("bin_px must be >= 1 (interval thinner than one pixel row)")
    n_rows, n_cols = mask.shape
    valid = np.ones(mask.shape, dtype=bool)
    if exclude is not None:
        exclude = np.asarray(exclude, dtype=bool)
        if exclude.shape != mask.shape:
            raise ValueError(f"exclusion layer {exclude.shape} does not match the mask {mask.shape}")
        valid = ~exclude
    n_classes = layers.shape[0] if layers is not None else (int(mask.max()) if mask.size else 0)
    names = list(class_names) if class_names else [f"class_{i}" for i in range(1, n_classes + 1)]
    if len(names) < n_classes:
        raise ValueError("fewer class_names than classes present in the mask")

    rng = bin_edges(n_rows, bin_px, keep_partial)
    r0 = np.array([a for a, _ in rng], dtype=float)
    r1 = np.array([b for _, b in rng], dtype=float)
    step = (bottom - top) / n_rows
    v = _bin_sums(valid.sum(axis=1), rng)
    ok = (v > 0) & (v >= min_valid * (r1 - r0) * n_cols)
    with np.errstate(invalid="ignore", divide="ignore"):
        def pct(hit: np.ndarray) -> np.ndarray:
            return np.where(ok, 100 * _bin_sums((hit & valid).sum(axis=1), rng) / v, np.nan)

        cols = {
            "depth_top": top + r0 * step,
            "depth_bottom": top + r1 * step,
            "depth": top + (r0 + r1) / 2 * step,
            "valid_pct": 100 * v / ((r1 - r0) * n_cols),
            "bioturbation_pct": pct(mask > 0),
        }
        if len(names) > 1:
            for label, cname in enumerate(names, start=1):
                cols[f"{cname}_pct"] = pct(layers[label - 1] if layers is not None else mask == label)
    df = pd.DataFrame(cols)
    for scheme in schemes:
        idx = pd.Series(scheme.classify(df["bioturbation_pct"].to_numpy()), dtype="Int64")
        df[scheme.name] = idx.mask(idx < 0)   # no data -> empty, never 0
    df.insert(0, "section", name)

    return CoreSection(name=name, top=top, bottom=bottom, units=units, bin_px=bin_px,
                       class_names=names, data=df,
                       metadata={"image_rows": n_rows, "image_cols": n_cols,
                                 "px_per_unit": n_rows / (bottom - top),
                                 "excluded_pct": float(100 * (~valid).mean()) if valid.size else 0.0})


def analyze_image(path, top: float, bottom: float, *, threshold: float = 5, **kwargs) -> CoreSection:
    """v2.1-compatible entry point: treated image with bioturbation painted black."""
    mask, names = mask_from_threshold(load_image(path), threshold)
    return analyze_mask(mask, top, bottom, class_names=names, **kwargs)
