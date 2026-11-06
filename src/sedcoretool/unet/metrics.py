"""Scores of a predicted mask against an expert mask (V0.15). Pixels equal to 255 in the truth are ignored.

Pixel scores (bioturbation = any class > 0): IoU = TP / (TP + FP + FN), Dice = 2TP / (2TP + FP + FN),
precision = TP / (TP + FP), recall = TP / (TP + FN).
Per bin of ``bin_px`` rows (same bins as ``analyze_mask``): bioturbation % = 100 · positives / valid pixels;
reported as mean absolute error (percentage points), bias (prediction − truth) and the share of bins whose
BI (Taylor & Goldring) and ii (Droser & Bottjer) class is the same.
"""

from __future__ import annotations

import numpy as np

from ..indices import BI_TAYLOR_GOLDRING, II_DROSER_BOTTJER
from ..pipeline import bin_edges
from .tiling import IGNORE


def pixel_scores(pred: np.ndarray, truth: np.ndarray) -> dict:
    valid = truth != IGNORE
    p, t = (pred > 0) & valid, (truth > 0) & valid
    tp, fp, fn = int((p & t).sum()), int((p & ~t).sum()), int((~p & t & valid).sum())
    div = lambda a, b: a / b if b else float("nan")
    return {"tp": tp, "fp": fp, "fn": fn, "valid": int(valid.sum()), "iou": div(tp, tp + fp + fn),
            "dice": div(2 * tp, 2 * tp + fp + fn), "precision": div(tp, tp + fp), "recall": div(tp, tp + fn)}


def bin_percentages(mask: np.ndarray, truth: np.ndarray, bin_px: float) -> np.ndarray:
    """Bioturbation % of ``mask`` in each bin of rows, counting only pixels that are valid in ``truth``."""
    valid = truth != IGNORE
    pos = ((mask > 0) & valid).sum(axis=1).astype(float)
    n = valid.sum(axis=1).astype(float)
    out = []
    for a, b in bin_edges(mask.shape[0], bin_px):
        v = n[a:b].sum()
        out.append(100 * pos[a:b].sum() / v if v else np.nan)
    return np.array(out)


def bin_scores(pred: np.ndarray, truth: np.ndarray, bin_px: float) -> dict:
    pp, tp = bin_percentages(pred, truth, bin_px), bin_percentages(truth, truth, bin_px)
    ok = ~np.isnan(tp)
    pp, tp = pp[ok], tp[ok]
    if not len(tp):
        return {"bins": 0}
    return {"bins": int(len(tp)), "mae_pct": float(np.abs(pp - tp).mean()), "bias_pct": float((pp - tp).mean()),
            "bi_agreement": float((BI_TAYLOR_GOLDRING.classify(pp) == BI_TAYLOR_GOLDRING.classify(tp)).mean()),
            "ii_agreement": float((II_DROSER_BOTTJER.classify(pp) == II_DROSER_BOTTJER.classify(tp)).mean())}


def score(pred: np.ndarray, truth: np.ndarray, bin_px: float) -> dict:
    return {**pixel_scores(pred, truth), **bin_scores(pred, truth, bin_px)}
