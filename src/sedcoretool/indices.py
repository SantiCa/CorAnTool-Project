"""Semi-quantitative bioturbation indices derived from percentage.

Schemes are data, so users can add or modify them without touching code.
Each tier is a half-open interval [lower, upper) in percent.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class IndexScheme:
    name: str
    tiers: tuple[tuple[float, float, int], ...]  # (lower, upper, value)
    reference: str = ""

    def classify(self, percentage: np.ndarray) -> np.ndarray:
        p = np.asarray(percentage, dtype=float)
        out = np.full(p.shape, -1, dtype=int)
        for lo, hi, value in self.tiers:
            out[(p >= lo) & (p < hi)] = value
        return out


# Tiers identical to IchAnTool v2.1 (legacy/v2.1_console).
BI_TAYLOR_GOLDRING = IndexScheme(
    name="BI",
    tiers=((0, 1, 0), (1, 5, 1), (5, 31, 2), (31, 61, 3), (61, 91, 4), (91, 100, 5), (100, 101, 6)),
    reference="Reineck (1963); Taylor & Goldring (1993)",
)

II_DROSER_BOTTJER = IndexScheme(
    name="ii",
    tiers=((0, 1, 1), (1, 10, 2), (10, 40, 3), (40, 60, 4), (60, 100, 5), (100, 101, 6)),
    reference="Droser & Bottjer (1986)",
)

DEFAULT_SCHEMES = (BI_TAYLOR_GOLDRING, II_DROSER_BOTTJER)
