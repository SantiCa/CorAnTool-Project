"""Running a trained U-Net (.onnx + .json) with ONNX Runtime, with the same tiling as the app (V0.15)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .tiling import UnetConfig, predict_proba


class OnnxUnet:
    """``OnnxUnet("model.onnx")`` reads ``model.json`` next to it (tile, overlap, normalisation, px/cm, classes)."""

    def __init__(self, path: str | Path, config: UnetConfig | None = None):
        try:
            import onnxruntime as ort
        except ImportError as e:  # pragma: no cover - optional dependency
            raise ImportError("install the optional dependencies: pip install 'sedcoretool[unet]'") from e
        path = Path(path)
        js = path.with_suffix(".json")
        self.config = config or (UnetConfig.from_json(json.loads(js.read_text(encoding="utf-8"))) if js.exists() else UnetConfig())
        self.session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        self._in = self.session.get_inputs()[0].name

    def run_tile(self, x: np.ndarray) -> np.ndarray:
        return self.session.run(None, {self._in: x[None].astype(np.float32)})[0][0]

    def predict(self, rgb: np.ndarray, px_per_cm: float | None = None):
        """(probability of bioturbation, class map or None) for an (h, w, 3) uint8 image."""
        scale = self.config.px_per_cm / px_per_cm if (self.config.px_per_cm and px_per_cm) else 1.0
        return predict_proba(self.run_tile, rgb, self.config, scale)
