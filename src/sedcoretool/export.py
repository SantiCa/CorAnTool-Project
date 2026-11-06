"""Export results for correlation with other core data."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

import pandas as pd

from .pipeline import CoreSection


def combine(sections: Iterable[CoreSection]) -> pd.DataFrame:
    return pd.concat([s.data for s in sections], ignore_index=True)


def to_csv(sections: Iterable[CoreSection], path: str | Path) -> Path:
    path = Path(path)
    combine(sections).to_csv(path, index=False)
    return path


def to_excel(sections: Iterable[CoreSection], path: str | Path) -> Path:
    """One sheet with all data plus one sheet per section (needs openpyxl)."""
    sections = list(sections)
    path = Path(path)
    with pd.ExcelWriter(path) as xw:
        combine(sections).to_excel(xw, sheet_name="all", index=False)
        for s in sections:
            s.data.to_excel(xw, sheet_name=s.name[:31], index=False)
    return path
