"""Depth and age handling."""

from __future__ import annotations

import numpy as np


def pixel_depths(n_rows: int, top: float, bottom: float) -> np.ndarray:
    """Depth at the centre of every pixel row (row 0 = top)."""
    if bottom <= top:
        raise ValueError("bottom depth must be greater than top depth")
    step = (bottom - top) / n_rows
    return top + (np.arange(n_rows) + 0.5) * step


def depth_to_age(depth: np.ndarray, model_depth: np.ndarray, model_age: np.ndarray,
                 extrapolate: bool = False) -> np.ndarray:
    """Linear interpolation of an age model (replaces v2.1 AgeConverter).

    Outside the model range returns NaN unless ``extrapolate`` is True.
    """
    md = np.asarray(model_depth, dtype=float)
    ma = np.asarray(model_age, dtype=float)
    if md.ndim != 1 or ma.ndim != 1 or len(md) < 2 or len(md) != len(ma) or not np.isfinite(md).all() or not np.isfinite(ma).all():
        raise ValueError("age model requires at least two finite depth-age pairs")
    order = np.lexsort((ma, md))
    md, ma = md[order], ma[order]
    keep = np.ones(len(md), dtype=bool)
    keep[1:] = (np.diff(md) != 0) | (np.diff(ma) != 0)  # identical repeated rows are merged
    md, ma = md[keep], ma[keep]
    if np.any(np.diff(md) == 0):
        raise ValueError("one depth has two different ages; write a hiatus as two depths a small distance apart")
    if len(md) < 2:
        raise ValueError("age model requires at least two finite depth-age pairs")
    d = np.asarray(depth, dtype=float)
    age = np.interp(d, md, ma)
    if extrapolate:
        lo = (ma[1] - ma[0]) / (md[1] - md[0])
        hi = (ma[-1] - ma[-2]) / (md[-1] - md[-2])
        age = np.where(d < md[0], ma[0] + (d - md[0]) * lo, age)
        age = np.where(d > md[-1], ma[-1] + (d - md[-1]) * hi, age)
    else:
        age = np.where((d < md[0]) | (d > md[-1]), np.nan, age)
    return age
