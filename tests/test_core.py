import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from ichantool import (BI_TAYLOR_GOLDRING, II_DROSER_BOTTJER, analyze_image, analyze_mask,
                       mask_from_palette, mask_from_threshold)
from ichantool.cli import main
from ichantool.depth import depth_to_age, pixel_depths

EXAMPLE = Path(__file__).parents[1] / "examples" / "data" / "idealized_core_0-500cm.jpg"


def test_indices_match_v21_tiers():
    p = np.array([0, 0.5, 3, 20, 50, 80, 95, 100])
    assert BI_TAYLOR_GOLDRING.classify(p).tolist() == [0, 0, 1, 2, 3, 4, 5, 6]
    assert II_DROSER_BOTTJER.classify(p).tolist() == [1, 1, 2, 3, 4, 5, 5, 6]


def test_percentage_and_bins():
    mask = np.zeros((10, 10), int)
    mask[:5, :4] = 1  # 40 % in the upper half
    s = analyze_mask(mask, 0, 10, bin_px=5)
    assert s.data["bioturbation_pct"].tolist() == [40.0, 0.0]
    assert s.data["depth"].tolist() == [2.5, 7.5]
    assert s.data["BI"].tolist() == [3, 0]


def test_partial_last_bin_is_kept_or_dropped():
    mask = np.ones((11, 4), int)
    assert len(analyze_mask(mask, 0, 11, bin_px=5).data) == 3
    assert len(analyze_mask(mask, 0, 11, bin_px=5, keep_partial=False).data) == 2


def test_multiclass_palette():
    img = np.full((4, 4, 3), 200, np.uint8)
    img[0, :2] = (255, 0, 0)
    img[0, 2] = (0, 0, 255)
    mask, names = mask_from_palette(img, {"Zoophycos": "#ff0000", "Chondrites": (0, 0, 255)})
    s = analyze_mask(mask, 0, 4, class_names=names)
    row = s.data.iloc[0]
    assert row["bioturbation_pct"] == 75 and row["Zoophycos_pct"] == 50 and row["Chondrites_pct"] == 25


def test_threshold_works_on_gray_and_rgb():
    gray = np.full((2, 2), 255, np.uint8)
    gray[0, 0] = 0
    assert mask_from_threshold(gray)[0].sum() == 1
    assert mask_from_threshold(np.stack([gray] * 3, -1))[0].sum() == 1


def test_depth_and_age():
    assert pixel_depths(4, 0, 4).tolist() == [0.5, 1.5, 2.5, 3.5]
    age = depth_to_age([0, 5, 20], [0, 10], [0, 100])
    assert age[1] == 50 and np.isnan(age[2])
    with pytest.raises(ValueError):
        pixel_depths(4, 5, 5)


def test_example_image_runs():
    s = analyze_image(EXAMPLE, 0, 500, bin_px=100)
    assert len(s.data) == 168
    assert s.data["bioturbation_pct"].between(0, 100).all()


def test_regression_against_published_v21_output():
    """v3 must reproduce the v2.1 CSV used in Casanova-Arenillas et al. (2020)."""
    import pandas as pd
    legacy = pd.read_csv(Path(__file__).parents[1] / "legacy" / "v2.1_console" / "example_output.csv")
    new = analyze_image(EXAMPLE, 0, 500, bin_px=150).data.iloc[: len(legacy)]
    np.testing.assert_allclose(new["depth"], legacy["Depth"])
    np.testing.assert_allclose(new["bioturbation_pct"], legacy["Bioturbation Percentage"])
    assert (new["BI"].to_numpy() == legacy["BI"].to_numpy()).all()
    assert (new["ii"].to_numpy() == legacy["II"].to_numpy()).all()


def test_cli(tmp_path):
    img = np.full((20, 10), 255, np.uint8)
    img[:10, :5] = 0
    p = tmp_path / "core.png"
    Image.fromarray(img).save(p)
    out = tmp_path / "out.csv"
    assert main(["analyze", str(p), "--top", "0", "--bottom", "20", "--bin-px", "10", "-o", str(out)]) == 0
    assert "bioturbation_pct" in out.read_text()
    pal = tmp_path / "pal.json"
    pal.write_text(json.dumps({"A": "#000000"}))
    assert main(["analyze", str(p), "--top", "0", "--bottom", "20", "--palette", str(pal),
                 "-o", str(tmp_path / "o.xlsx")]) == 0


def test_bin_cm_fractional_edges_match_web_app():
    """V0.1: interval in cm → fractional rows per bin with the same edges as binRows in the web app."""
    from ichantool.pipeline import bin_edges
    assert bin_edges(100, 12.5) == [(0, 13), (13, 25), (25, 38), (38, 50), (50, 63), (63, 75), (75, 88), (88, 100)]
    assert bin_edges(100, 30) == [(0, 30), (30, 60), (60, 90), (90, 100)]
    assert bin_edges(100, 30, keep_partial=False) == [(0, 30), (30, 60), (60, 90)]
    mask = np.zeros((100, 4), dtype=int)
    mask[:50, :2] = 1
    sec = analyze_mask(mask, 0, 10, units="cm", bin_cm=1.25)   # 10 px/cm → 12.5 rows per interval
    assert len(sec.data) == 8
    assert sec.data["bioturbation_pct"].iloc[0] == 50


def test_overlapping_class_layers_v020():
    """V0.20: per-class layers may overlap; the total counts the union, each class its full area."""
    import numpy as np
    from ichantool.pipeline import analyze_mask
    a = np.zeros((2, 1, 4), bool)
    a[0, 0, :2] = True   # class 1: px 0-1
    a[1, 0, 1:3] = True  # class 2: px 1-2 (overlaps px 1)
    r = analyze_mask(a, 0, 1, bin_px=1, class_names=["A", "B"]).data
    assert r["bioturbation_pct"].iloc[0] == 75
    assert r["A_pct"].iloc[0] == 50 and r["B_pct"].iloc[0] == 50
