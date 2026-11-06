"""Training data for the U-Net (V0.15).

Input: the ZIP (or its unpacked folder) exported from the app with *Results → U-Net training data*:
``manifest.json`` + ``images/*.png`` (original analysis area) + ``masks/*.png`` (0 = matrix or artefact,
k = class k, 255 = ignore: excluded zones and traces without a confirmed class).

``prepare_dataset`` resamples every image to a common resolution (px/cm), cuts overlapping tiles and
splits them **by core**: all tiles of a core go to the same set, so the test score measures performance
on cores the model has never seen.
"""

from __future__ import annotations

import io
import json
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from .tiling import IGNORE, resample_bilinear, tile_starts


@dataclass
class Item:
    core: str
    section: str
    image: np.ndarray  # (h, w, 3) uint8
    mask: np.ndarray   # (h, w) uint8
    px_per_cm: float


def _reader(src: Path):
    if src.is_dir():
        return lambda name: (src / name).read_bytes()
    z = zipfile.ZipFile(src)
    return z.read


def load_export(src: str | Path) -> tuple[list[Item], list[dict]]:
    """Items and classes of an exported training set (ZIP file or folder)."""
    read = _reader(Path(src))
    man = json.loads(read("manifest.json"))
    if man.get("kind") != "segmentation-dataset":
        raise ValueError("not a SedCoreTool (or CorAnTool) segmentation dataset (manifest kind)")
    items = []
    for it in man["items"]:
        img = np.asarray(Image.open(io.BytesIO(read(it["image"]))).convert("RGB"))
        msk = np.asarray(Image.open(io.BytesIO(read(it["mask"]))).convert("L"))
        if img.shape[:2] != msk.shape:
            raise ValueError(f"image and mask sizes differ: {it['image']}")
        items.append(Item(it["core"], it["section"], img, msk, float(it["pxPerCm"])))
    return items, man["classes"]


def resample_mask(mask: np.ndarray, out_h: int, out_w: int) -> np.ndarray:
    """Nearest-neighbour resampling (labels must not be averaged), same pixel-centre rule as the images."""
    h, w = mask.shape
    ys = np.clip(np.floor((np.arange(out_h) + 0.5) * h / out_h), 0, h - 1).astype(int)
    xs = np.clip(np.floor((np.arange(out_w) + 0.5) * w / out_w), 0, w - 1).astype(int)
    return mask[ys][:, xs]


def binary_mask(mask: np.ndarray) -> np.ndarray:
    """All classes merged into bioturbation (1); matrix 0; ignore kept."""
    out = (mask > 0).astype(np.uint8)
    out[mask == IGNORE] = IGNORE
    return out


def split_cores(cores: list[str], val: list[str] | None = None, test: list[str] | None = None,
                val_frac: float = 0.2, test_frac: float = 0.2, seed: int = 42) -> dict[str, str]:
    """Core -> 'train' | 'val' | 'test'. Named cores are used as given; the rest are shuffled with ``seed``."""
    val, test = list(val or []), list(test or [])
    unknown = [c for c in val + test if c not in cores]
    if unknown:
        raise ValueError(f"unknown cores: {unknown}")
    rest = sorted(c for c in set(cores) if c not in val and c not in test)
    rng = np.random.default_rng(seed)
    rng.shuffle(rest)
    n = len(set(cores))
    if not test and n >= 3:
        test = rest[:max(1, round(test_frac * n))]
        rest = rest[len(test):]
    if not val and len(rest) >= 2:
        val = rest[:max(1, round(val_frac * n))]
        rest = rest[len(val):]
    out = {c: "train" for c in rest}
    out.update({c: "val" for c in val})
    out.update({c: "test" for c in test})
    return out


def tiles_of(item: Item, tile: int, overlap: int, px_per_cm: float | None, min_valid: float = 0.5):
    """Yield (y0, x0, image tile, mask tile) for tiles with at least ``min_valid`` non-ignored pixels."""
    img, msk = item.image, item.mask
    if px_per_cm:
        s = px_per_cm / item.px_per_cm
        if abs(s - 1) > 0.02:
            H, W = max(1, round(img.shape[0] * s)), max(1, round(img.shape[1] * s))
            img, msk = resample_bilinear(img, H, W), resample_mask(msk, H, W)
    h, w = msk.shape
    for y0 in tile_starts(h, tile, overlap):
        for x0 in tile_starts(w, tile, overlap):
            ys = np.minimum(h - 1, y0 + np.arange(tile))
            xs = np.minimum(w - 1, x0 + np.arange(tile))
            m = msk[ys][:, xs].copy()
            # padding outside the image is ignored, not matrix
            m[(y0 + np.arange(tile)) >= h, :] = IGNORE
            m[:, (x0 + np.arange(tile)) >= w] = IGNORE
            if (m != IGNORE).mean() < min_valid:
                continue
            yield y0, x0, img[ys][:, xs], m


def prepare_dataset(src: str | Path, out: str | Path, tile: int = 512, overlap: int = 64,
                    px_per_cm: float | None = None, binary: bool = True, val_cores=None, test_cores=None,
                    seed: int = 42, min_valid: float = 0.5) -> dict:
    """Write ``out/{train,val,test}/{images,masks}/*.png`` and ``out/dataset.json``; return the summary."""
    items, classes = load_export(src)
    if not items:
        raise ValueError("the export has no images")
    if px_per_cm is None:
        px_per_cm = float(np.median([it.px_per_cm for it in items]))
    split = split_cores([it.core for it in items], val_cores, test_cores, seed=seed)
    out = Path(out)
    counts = {k: {"tiles": 0, "cores": sorted({c for c, v in split.items() if v == k})} for k in ("train", "val", "test")}
    for k in counts:
        for d in ("images", "masks"):
            (out / k / d).mkdir(parents=True, exist_ok=True)
    for it in items:
        part = split[it.core]
        stem = f"{it.core}__{it.section}".replace("/", "_")
        for y0, x0, im, m in tiles_of(it, tile, overlap, px_per_cm, min_valid):
            if binary:
                m = binary_mask(m)
            name = f"{stem}__y{y0}_x{x0}.png"
            Image.fromarray(im).save(out / part / "images" / name)
            Image.fromarray(m).save(out / part / "masks" / name)
            counts[part]["tiles"] += 1
    names = ["bioturbation"] if binary else [c["name"] for c in classes]
    summary = {"tile": tile, "overlap": overlap, "pxPerCm": px_per_cm, "binary": binary, "classes": names,
               "ignore": IGNORE, "seed": seed, "split": counts}
    (out / "dataset.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary
