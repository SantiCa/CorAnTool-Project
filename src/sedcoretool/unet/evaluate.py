"""Scoring a trained U-Net on whole images of independent cores (V0.15).

Tiles are only for training: evaluation predicts each complete analysis area, as the app does, and
compares it with the expert mask (pixels labelled 255 are ignored). Scores are given per image and
pooled (TP, FP and FN summed over all images before computing IoU and Dice).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .dataset import load_export
from .metrics import pixel_scores, score
from .predict import OnnxUnet


def evaluate(export: str | Path, model: str | Path, cores: list[str] | None = None, threshold: float = 0.5,
             bin_cm: float = 1.0, dataset: str | Path | None = None) -> dict:
    """Scores on the images of ``cores`` (default: the test cores recorded in ``dataset``/dataset.json)."""
    if cores is None and dataset is not None:
        cores = json.loads((Path(dataset) / "dataset.json").read_text(encoding="utf-8"))["split"]["test"]["cores"]
    items, _ = load_export(export)
    if cores is not None:
        items = [it for it in items if it.core in set(cores)]
    if not items:
        raise ValueError("no images to evaluate (check the core names)")
    net = OnnxUnet(model)
    rows, tp = [], np.zeros(3, int)
    for it in items:
        prob, _ = net.predict(it.image, it.px_per_cm)
        pred = (prob >= threshold).astype(np.uint8)
        s = score(pred, it.mask, bin_cm * it.px_per_cm)
        tp += [s["tp"], s["fp"], s["fn"]]
        rows.append({"core": it.core, "section": it.section, **s})
    t, f, n = tp
    pooled = {"tp": int(t), "fp": int(f), "fn": int(n), "iou": t / (t + f + n) if t + f + n else float("nan"),
              "dice": 2 * t / (2 * t + f + n) if t + f + n else float("nan")}
    return {"threshold": threshold, "bin_cm": bin_cm, "cores": sorted({r["core"] for r in rows}), "pooled": pooled, "images": rows}


__all__ = ["evaluate", "pixel_scores"]
