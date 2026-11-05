"""Learned segmentation of bioturbation with a U-Net (V0.15).

Workflow: app export (*U-Net training data*) → ``prepare_dataset`` (tiles, split by core) → ``train``
(PyTorch, optional dependency) → ``model.onnx`` + ``model.json`` → app (*Detection → U-Net*) or
``OnnxUnet`` / ``mask_from_unet`` in Python → ``evaluate`` on independent cores.
"""

from .dataset import load_export, prepare_dataset, split_cores
from .metrics import bin_scores, pixel_scores, score
from .tiling import IGNORE, UnetConfig, blend_window, predict_proba, resample_bilinear, tile_starts

__all__ = ["IGNORE", "UnetConfig", "bin_scores", "blend_window", "load_export", "pixel_scores", "predict_proba",
           "prepare_dataset", "resample_bilinear", "score", "split_cores", "tile_starts"]
