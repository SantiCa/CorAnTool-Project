"""Batch processing: many images, and cores made of several sections, from a manifest table.

The manifest is a CSV with one row per section image::

    image,core,top,bottom,units,name,exclude
    U1385_1H_1.png,U1385I,0,150,cm,1H-1,U1385_1H_1_excl.png

``image``, ``top`` and ``bottom`` are required; ``core`` (default: one core named after the manifest), ``units``
(default cm), ``name`` (default: file stem) and ``exclude`` (an exclusion image, white = excluded) are optional.
Relative paths are read from the manifest's folder. Write a starting manifest for a folder with
:func:`write_manifest_template`.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import numpy as np
import pandas as pd

from .io import SUPPORTED, load_image, load_mask
from .pipeline import UNIT_TO_CM, CoreSection, analyze_mask

REQUIRED = ("image", "top", "bottom")


def load_exclusion(path: str | Path) -> np.ndarray:
    """Exclusion image: pixels with grey > 127 (white) are excluded, black pixels are valid."""
    img = load_image(path, "L")
    return img > 127


def read_manifest(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    m = pd.read_csv(path, dtype={"image": str, "core": str, "name": str, "exclude": str, "units": str})
    m.columns = [c.strip().lower() for c in m.columns]
    missing = [c for c in REQUIRED if c not in m]
    if missing:
        raise ValueError(f"manifest {path.name}: missing column(s) {', '.join(missing)}")
    if m.empty:
        raise ValueError(f"manifest {path.name} has no rows")
    for c in ("top", "bottom"):
        if m[c].isna().any():
            rows = ", ".join(str(i + 2) for i in m.index[m[c].isna()])
            raise ValueError(f"manifest {path.name}: empty '{c}' in line(s) {rows}")
    m["core"] = m["core"].fillna(path.stem) if "core" in m else path.stem
    m["units"] = m["units"].fillna("cm") if "units" in m else "cm"
    base = path.parent
    m["image"] = [str((base / p).resolve()) for p in m["image"]]
    if "exclude" in m:
        m["exclude"] = [str((base / p).resolve()) if isinstance(p, str) and p.strip() else None for p in m["exclude"]]
    else:
        m["exclude"] = None
    m["name"] = [n if isinstance(n, str) and n.strip() else Path(i).stem
                 for n, i in zip(m["name"] if "name" in m else [None] * len(m), m["image"])]
    return m


def write_manifest_template(folder: str | Path, out: str | Path | None = None) -> Path:
    """List the images of a folder in a manifest with empty depths, to be filled in by the user."""
    folder = Path(folder)
    imgs = sorted(p for p in folder.iterdir() if p.suffix.lower() in SUPPORTED and not p.stem.endswith("_excl"))
    if not imgs:
        raise ValueError(f"no images ({', '.join(sorted(SUPPORTED))}) in {folder}")
    out = Path(out) if out else folder / "sections.csv"
    rows = [{"image": p.name, "core": folder.name, "top": "", "bottom": "", "units": "cm", "name": p.stem,
             "exclude": (p.stem + "_excl.png") if (folder / (p.stem + "_excl.png")).exists() else ""} for p in imgs]
    pd.DataFrame(rows).to_csv(out, index=False)
    return out


def run_manifest(manifest: str | Path, to_mask: Callable[[Path], tuple] | None = None,
                 **analysis) -> dict[str, list[CoreSection]]:
    """Analyse every section of a manifest. Returns {core: [sections, top to bottom]}.

    to_mask(path) -> (mask, class_names[, exclusion]) turns an image into a label mask (default: an integer label mask, as
    exported by the program or by ``unet predict``). ``analysis`` goes to :func:`analyze_mask` (bin_cm, min_valid…).
    """
    m = read_manifest(manifest)
    to_mask = to_mask or (lambda p: (load_mask(p), None))
    cores: dict[str, list[CoreSection]] = {}
    for r in m.itertuples(index=False):
        mask, names, *rest = to_mask(Path(r.image))
        exclude = rest[0] if rest else None
        if isinstance(r.exclude, str):
            ex = load_exclusion(r.exclude)
            if ex.shape != mask.shape[-2:]:
                raise ValueError(f"{Path(r.exclude).name}: size {exclude.shape[::-1]} differs from "
                                 f"{Path(r.image).name} {mask.shape[-2:][::-1]} (width, height)")
            exclude = ex if exclude is None else (exclude | ex)
        s = analyze_mask(mask, float(r.top), float(r.bottom), units=r.units, class_names=names,
                         exclude=exclude, name=r.name, **analysis)
        s.data.insert(0, "core", r.core)
        s.metadata["core"] = r.core
        cores.setdefault(r.core, []).append(s)
    for secs in cores.values():
        secs.sort(key=lambda s: s.top * UNIT_TO_CM[s.units])
    return cores
