"""Quick-look plots (optional dependency: matplotlib)."""

from __future__ import annotations

from .pipeline import CoreSection


def plot_section(section: CoreSection, ax=None, show_indices: bool = True):
    import matplotlib.pyplot as plt

    df = section.data
    index_cols = [c for c in ("BI", "ii") if c in df] if show_indices else []
    if ax is None:
        _, axes = plt.subplots(1, 1 + len(index_cols), sharey=True,
                               figsize=(3 + 1.5 * len(index_cols), 8))
        axes = list(axes) if index_cols else [axes]
    else:
        axes = [ax]
    axes[0].plot(df["bioturbation_pct"], df["depth"])
    axes[0].set_xlim(0, 100)
    axes[0].set_xlabel("Bioturbation (%)")
    axes[0].set_ylabel(f"Depth ({section.units})")
    axes[0].invert_yaxis()
    for a, col in zip(axes[1:], index_cols):
        a.step(df[col], df["depth"], where="mid")
        a.set_xlabel(col)
    return axes
