"""V0.15: U-Net data preparation, tiling parity with the app, metrics and inference (no PyTorch needed)."""

import io
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from sedcoretool.unet import IGNORE, prepare_dataset, score, split_cores
from sedcoretool.unet.dataset import binary_mask, load_export, resample_mask

FIX = Path(__file__).parent / "fixtures"
sys.path.insert(0, str(FIX))
from make_unet_parity import compute  # noqa: E402


def test_parity_with_reference_file():
    ref, now = json.loads((FIX / "unet_parity.json").read_text()), compute()
    assert now["tileStarts"] == ref["tileStarts"] == [[0], [0], [0, 1], [0, 24, 48, 68], [0, 24, 48, 63]]
    assert now["resampled"] == ref["resampled"]
    assert now["cls3"] == ref["cls3"]
    for k in ("blend", "prob1", "prob3"):
        assert np.allclose(now[k], ref[k], atol=1e-5)


def test_split_by_core_keeps_cores_together_and_honours_names():
    cores = ["A", "A", "B", "C", "D", "E"]
    s = split_cores(cores, test=["E"], seed=1)
    assert s["E"] == "test" and set(s) == set(cores) and list(s.values()).count("test") == 1
    assert "val" in s.values() and "train" in s.values()
    assert split_cores(cores, seed=1) == split_cores(cores, seed=1)
    with pytest.raises(ValueError):
        split_cores(cores, test=["Z"])
    with pytest.raises(ValueError, match="disjoint"):
        split_cores(cores, val=["A"], test=["A"])


def _export(tmp_path, cores=("C1", "C2", "C3"), size=(40, 30)):
    buf = io.BytesIO()
    h, w = size
    items = []
    with zipfile.ZipFile(buf, "w") as z:
        for k, c in enumerate(cores):
            img = np.full((h, w, 3), 200, np.uint8)
            m = np.zeros((h, w), np.uint8)
            img[5:15, 5:12] = 40
            m[5:15, 5:12] = 1 + k % 2
            m[30:, :] = IGNORE
            for name, arr in ((f"images/{c}.png", img), (f"masks/{c}.png", m)):
                b = io.BytesIO()
                Image.fromarray(arr).save(b, "PNG")
                z.writestr(name, b.getvalue())
            items.append({"image": f"images/{c}.png", "mask": f"masks/{c}.png", "core": c, "section": "1", "pxPerCm": 10 + k})
        z.writestr("manifest.json", json.dumps({"kind": "segmentation-dataset", "classes": [
            {"index": 1, "name": "Zoophycos"}, {"index": 2, "name": "Chondrites"}], "items": items}))
    p = tmp_path / "export.zip"
    p.write_bytes(buf.getvalue())
    return p


def test_export_round_trip_and_prepare(tmp_path):
    exp = _export(tmp_path)
    items, classes = load_export(exp)
    assert [c["name"] for c in classes] == ["Zoophycos", "Chondrites"] and items[1].mask.max() == IGNORE
    s = prepare_dataset(exp, tmp_path / "ds", tile=16, overlap=4, px_per_cm=10, test_cores=["C3"], val_cores=["C2"])
    with pytest.raises(ValueError, match="output directory must be empty"):
        prepare_dataset(exp, tmp_path / "ds", tile=16, overlap=4, px_per_cm=10, test_cores=["C1"], val_cores=["C2"])
    s2 = prepare_dataset(exp, tmp_path / "ds", tile=16, overlap=4, px_per_cm=10, test_cores=["C1"], val_cores=["C2"],
                         overwrite=True)
    assert s2["split"]["test"]["cores"] == ["C1"]
    assert not any(p.name.startswith("C1__") for p in (tmp_path / "ds" / "train" / "images").iterdir())
    other = tmp_path / "other"
    other.mkdir()
    (other / "notes.txt").write_text("keep")
    with pytest.raises(ValueError, match="dataset.json"):
        prepare_dataset(exp, other, tile=16, overlap=4, px_per_cm=10, overwrite=True)
    assert (other / "notes.txt").exists()
    assert s["split"]["test"]["cores"] == ["C3"] and s["split"]["val"]["cores"] == ["C2"]
    assert s["split"]["train"]["tiles"] > 0 and s["classes"] == ["bioturbation"]
    m = np.asarray(Image.open(next((tmp_path / "ds" / "train" / "masks").glob("*.png"))))
    assert set(np.unique(m)) <= {0, 1, IGNORE}


def test_masks_resample_nearest_and_binary_keeps_ignore():
    m = np.array([[0, 2], [IGNORE, 1]], np.uint8)
    assert resample_mask(m, 4, 4).tolist()[0] == [0, 0, 2, 2]
    assert binary_mask(m).tolist() == [[0, 1], [IGNORE, 1]]


def test_metrics_ignore_pixels_and_bins():
    truth = np.zeros((4, 4), np.uint8)
    truth[:2, :2] = 1
    truth[3] = IGNORE
    pred = np.zeros_like(truth)
    pred[:2, :1] = 1
    pred[2, 3] = 1
    pred[3] = 1  # ignored row
    s = score(pred, truth, bin_px=2)
    assert (s["tp"], s["fp"], s["fn"], s["valid"]) == (2, 1, 2, 12)
    assert s["iou"] == pytest.approx(2 / 5) and s["dice"] == pytest.approx(4 / 7)
    assert s["bins"] == 2 and s["mae_pct"] == pytest.approx((abs(25 - 50) + abs(25 - 0)) / 2)


def test_mask_from_unet_with_onnx_model(tmp_path):
    onnx = pytest.importorskip("onnx")
    pytest.importorskip("onnxruntime")
    from onnx import TensorProto, helper

    from sedcoretool import mask_from_unet

    # logits = channel R normalised (dark pixels -> negative logit) with a 1x1 convolution
    w = helper.make_tensor("w", TensorProto.FLOAT, [1, 3, 1, 1], [-1.0, 0.0, 0.0])
    node = helper.make_node("Conv", ["image", "w"], ["logits"])
    g = helper.make_graph([node], "g", [helper.make_tensor_value_info("image", TensorProto.FLOAT, [None, 3, 16, 16])],
                          [helper.make_tensor_value_info("logits", TensorProto.FLOAT, [None, 1, 16, 16])], [w])
    model = helper.make_model(g, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 8
    onnx.save(model, tmp_path / "m.onnx")
    (tmp_path / "m.json").write_text(json.dumps({"tile": 16, "overlap": 4, "classes": ["bioturbation"],
                                                 "mean": [0.5, 0.5, 0.5], "std": [0.5, 0.5, 0.5]}))
    img = np.full((20, 30, 3), 230, np.uint8)
    img[4:10, 6:20] = 20
    mask, names = mask_from_unet(img, tmp_path / "m.onnx")
    assert names == ["bioturbation"] and mask[4:10, 6:20].all() and mask.sum() == 6 * 14


def test_train_resume_and_export(tmp_path):
    """V0.17: tiny training on CPU, interrupted after 1 epoch and resumed to 2 (needs sedcoretool[unet])."""
    pytest.importorskip("torch")
    pytest.importorskip("segmentation_models_pytorch")
    from sedcoretool.unet.train import train

    exp = _export(tmp_path, cores=("C1", "C2", "C3", "C4"), size=(48, 40))
    prepare_dataset(exp, tmp_path / "ds", tile=32, overlap=8, px_per_cm=10, test_cores=["C4"], val_cores=["C3"])
    seen = []
    kw = dict(encoder="resnet18", encoder_weights=None, batch=4, log=lambda m: None, progress=seen.append, device="cpu")
    train(tmp_path / "ds", tmp_path / "m" / "unet", epochs=1, **kw)
    assert (tmp_path / "m" / "unet.ckpt").exists() and seen[-1]["epoch"] == 1
    s = train(tmp_path / "ds", tmp_path / "m" / "unet", epochs=2, resume=True, **kw)
    assert seen[-1]["epoch"] == 2 and len(s["history"]) == 2 and (tmp_path / "m" / "unet.onnx").exists()
    assert json.loads((tmp_path / "m" / "unet.json").read_text())["tile"] == 32
