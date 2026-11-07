"""V0.60: exclusion layer, --bin-cm, batch manifests, multi-section cores and LAS export."""

import numpy as np
import pandas as pd
import pytest
from PIL import Image

from sedcoretool import analyze_mask
from sedcoretool.batch import read_manifest, run_manifest, write_manifest_template
from sedcoretool.cli import main
from sedcoretool.export import join_sections, to_las


def test_exclusion_is_ratio_of_valid_pixels():
    mask = np.zeros((4, 10), int)
    mask[:2, :2] = 1                       # 2 of 10 bioturbated in rows 0-1
    ex = np.zeros_like(mask, bool)
    ex[:2, 5:] = True                      # half of rows 0-1 excluded -> 2 of 5 valid
    ex[2:, :9] = True                      # rows 2-3: 10 % valid -> no data with min_valid 0.2
    s = analyze_mask(mask, 0, 4, bin_px=2, exclude=ex).data
    assert s["bioturbation_pct"].iloc[0] == pytest.approx(40)
    assert s["valid_pct"].tolist() == pytest.approx([50, 10])
    assert np.isnan(s["bioturbation_pct"].iloc[1]) and pd.isna(s["BI"].iloc[1])
    assert analyze_mask(mask, 0, 4, bin_px=2, exclude=ex, min_valid=0).data["bioturbation_pct"].iloc[1] == 0
    with pytest.raises(ValueError, match="does not match"):
        analyze_mask(mask, 0, 4, exclude=ex[:2])


def test_interval_limits_columns():
    s = analyze_mask(np.zeros((10, 2), int), 100, 110, bin_px=4).data
    assert s["depth_top"].tolist() == [100, 104, 108] and s["depth_bottom"].tolist() == [104, 108, 110]


def _write(path, arr):
    Image.fromarray(arr.astype(np.uint8)).save(path)


@pytest.fixture
def core(tmp_path):
    """Two cores: A with two sections (gap 100-110 cm, then an overlap in m), B with one section."""
    m = np.zeros((100, 20), np.uint8)
    m[:50, :10] = 1                        # 50 % in the upper half
    _write(tmp_path / "a1.png", m)
    _write(tmp_path / "a2.png", np.full((50, 20), 2))
    _write(tmp_path / "b1.png", m)
    ex = np.zeros((100, 20), np.uint8)
    ex[:, 10:] = 255
    _write(tmp_path / "a1_excl.png", ex)
    pd.DataFrame({"image": ["a2.png", "a1.png", "b1.png"], "core": ["A", "A", "B"], "top": [1.1, 0, 0],
                  "bottom": [1.6, 100, 100], "units": ["m", "cm", "cm"], "name": ["", "A-1", ""],
                  "exclude": ["", "a1_excl.png", ""]}).to_csv(tmp_path / "sections.csv", index=False)
    return tmp_path


def test_manifest_and_multisection(core):
    m = read_manifest(core / "sections.csv")
    assert m["name"].tolist() == ["a2", "A-1", "b1"]
    cores = run_manifest(core / "sections.csv", bin_cm=10)
    assert list(cores) == ["A", "B"] and [s.name for s in cores["A"]] == ["A-1", "a2"]
    a1 = cores["A"][0].data
    assert a1["bioturbation_pct"].iloc[0] == 100      # only the left (bioturbated) half is valid
    j = join_sections(cores["A"])
    assert j.attrs["units"] == "cm" and j["depth"].is_monotonic_increasing
    assert j["depth_top"].iloc[10] == pytest.approx(110)   # gap kept, metres converted to cm


def test_overlap_modes(core):
    s1 = analyze_mask(np.zeros((10, 2), int), 0, 10, bin_px=2, name="up")
    s2 = analyze_mask(np.ones((10, 2), int), 6, 16, bin_px=2, name="down")
    assert len(join_sections([s1, s2])) == 10
    up = join_sections([s2, s1], overlap="upper")
    assert up["section"].tolist() == ["up"] * 5 + ["down"] * 3
    with pytest.raises(ValueError, match="overlaps"):
        join_sections([s1, s2], overlap="error")


def test_las_export(core, tmp_path):
    cores = run_manifest(core / "sections.csv", bin_cm=10)
    f = to_las(cores["A"], tmp_path / "a.las", well="A")
    text = f.read_text()
    assert "VERS    .       2.0" in text and "WELL    .       A" in text
    assert "STEP    .CM     0.0000" in text          # gap -> irregular
    head, data = text.split("~A ")
    assert data.split("\n")[0].split() == ["DEPT", "DTOP", "DBOT", "VALID", "BIOT", "CLASS_1_PCT", "CLASS_2_PCT",
                                          "BI", "II"]   # a2 has two classes; a1 has no per-class columns -> null
    rows = np.loadtxt(data.split("\n", 1)[1].splitlines())
    assert rows.shape == (15, 9) and rows[0, 0] == pytest.approx(5) and rows[0, 4] == pytest.approx(100)
    assert rows[0, 5] == -999.25 and rows[-1, 6] == pytest.approx(100)
    regular = to_las(cores["B"], tmp_path / "b.las")
    assert "STEP    .CM     10.0000" in regular.read_text()


def test_cli_batch_manifest_and_bin_cm(core, tmp_path, capsys):
    assert main(["batch", str(core / "sections.csv"), "--label-mask", "--bin-cm", "10", "-o", str(tmp_path / "x.las")]) == 0
    assert (tmp_path / "x_A.las").exists() and (tmp_path / "x_B.las").exists()
    assert main(["batch", str(core / "sections.csv"), "--label-mask", "--bin-cm", "5", "-o", str(tmp_path / "x.csv")]) == 0
    out = pd.read_csv(tmp_path / "x.csv")
    assert set(out["core"]) == {"A", "B"} and len(out) == 20 + 10 + 20
    assert main(["analyze", str(core / "a1.png"), "--top", "0", "--bottom", "100", "--label-mask",
                 "--bin-cm", "25", "--exclude", str(core / "a1_excl.png"), "-o", str(tmp_path / "one.csv")]) == 0
    assert pd.read_csv(tmp_path / "one.csv")["bioturbation_pct"].tolist() == [100, 100, 0, 0]
    lab = np.ones((10, 4), np.uint8)
    lab[:, 2:] = 255
    _write(tmp_path / "lab.png", lab)
    main(["analyze", str(tmp_path / "lab.png"), "--top", "0", "--bottom", "10", "--label-mask",
          "--exclude-value", "255", "--bin-cm", "10", "-o", str(tmp_path / "lab.csv")])
    r = pd.read_csv(tmp_path / "lab.csv").iloc[0]
    assert r["bioturbation_pct"] == 100 and r["valid_pct"] == 50


def test_manifest_template(core):
    f = write_manifest_template(core, core / "t.csv")
    t = pd.read_csv(f)
    assert t["image"].tolist() == ["a1.png", "a2.png", "b1.png"] and t["exclude"].iloc[0] == "a1_excl.png"
    with pytest.raises(ValueError, match="empty 'top'"):
        read_manifest(f)
