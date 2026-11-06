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
    order = np.argsort(md)
    md, ma = md[order], ma[order]
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
