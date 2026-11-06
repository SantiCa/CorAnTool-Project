"""Training a U-Net on a prepared dataset and exporting it for the app (V0.15).

Requires the optional dependencies (``pip install 'sedcoretool[unet]'``): PyTorch, segmentation-models-pytorch,
onnx. A consumer GPU (e.g. 8–12 GB) is enough; CPU works for tests and very small sets.

Choices (documented in docs/DOCUMENTACION_TECNICA.md):
* U-Net with a ResNet-34 encoder pre-trained on ImageNet (or random weights with ``encoder_weights=None``);
* loss = cross-entropy (binary: BCE with logits) + soft Dice, both ignoring pixels labelled 255;
* augmentation: horizontal and vertical flips and photometric jitter (brightness, contrast, gamma).
  No 90° rotations: trace orientation relative to bedding is diagnostic;
* AdamW, cosine learning-rate schedule, early stopping on the validation Dice;
* export: ONNX (opset 17, input ``image`` 1×3×T×T, output ``logits`` 1×C×T×T) and the JSON read by the app.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np
from PIL import Image

from .tiling import IGNORE, UnetConfig


def _torch():
    try:
        import segmentation_models_pytorch as smp
        import torch
    except ImportError as e:  # pragma: no cover - optional dependency
        raise ImportError("install the optional dependencies: pip install 'sedcoretool[unet]'") from e
    return torch, smp


def augment(img: np.ndarray, mask: np.ndarray, rng: random.Random):
    """Flips and photometric jitter on a uint8 tile; returns float image in [0, 1] and the mask."""
    if rng.random() < 0.5:
        img, mask = img[:, ::-1], mask[:, ::-1]
    if rng.random() < 0.5:
        img, mask = img[::-1], mask[::-1]
    x = img.astype(np.float32) / 255.0
    x = np.clip((x - 0.5) * rng.uniform(0.85, 1.15) + 0.5 + rng.uniform(-0.08, 0.08), 0, 1) ** rng.uniform(0.8, 1.25)
    return np.ascontiguousarray(x), np.ascontiguousarray(mask)


def _loader(folder: Path, cfg: UnetConfig, train: bool, batch: int, seed: int):
    torch, _ = _torch()
    files = sorted((folder / "images").glob("*.png"))
    mean, std = np.asarray(cfg.mean, np.float32), np.asarray(cfg.std, np.float32)

    class DS(torch.utils.data.Dataset):
        def __init__(self):
            self.rng = random.Random(seed)

        def __len__(self):
            return len(files)

        def __getitem__(self, i):
            img = np.asarray(Image.open(files[i]).convert("RGB"))
            m = np.asarray(Image.open(folder / "masks" / files[i].name))
            x, m = augment(img, m, self.rng) if train else (img.astype(np.float32) / 255.0, m)
            x = ((x - mean) / std).transpose(2, 0, 1)
            return torch.from_numpy(np.ascontiguousarray(x, np.float32)), torch.from_numpy(m.astype(np.int64))

    return torch.utils.data.DataLoader(DS(), batch_size=batch, shuffle=train, num_workers=0, drop_last=False)


def _loss(logits, y, n_cls):
    torch, _ = _torch()
    F = torch.nn.functional
    valid = (y != IGNORE).float()
    yv = torch.where(y == IGNORE, torch.zeros_like(y), y)
    if n_cls == 1:
        t = (yv > 0).float()
        ce = (F.binary_cross_entropy_with_logits(logits[:, 0], t, reduction="none") * valid).sum() / valid.sum().clamp(min=1)
        p = torch.sigmoid(logits[:, 0]) * valid
        dice = 1 - (2 * (p * t).sum() + 1) / (p.sum() + (t * valid).sum() + 1)
    else:
        ce = F.cross_entropy(logits, y, ignore_index=IGNORE)
        p = torch.softmax(logits, 1) * valid[:, None]
        oh = F.one_hot(yv, n_cls).permute(0, 3, 1, 2).float() * valid[:, None]
        dice = 1 - ((2 * (p * oh).sum((0, 2, 3)) + 1) / (p.sum((0, 2, 3)) + oh.sum((0, 2, 3)) + 1))[1:].mean()
    return ce + dice


def _dice(logits, y, n_cls):
    """Pixel Dice of bioturbation (any class > 0) over valid pixels: (2TP, FP+FN)."""
    pred = (logits[:, 0] > 0) if n_cls == 1 else (logits.argmax(1) > 0)
    valid, t = y != IGNORE, (y > 0) & (y != IGNORE)
    p = pred & valid
    return int((p & t).sum()) * 2, int((p & ~t).sum() + (~p & t).sum())


def train(data: str | Path, out: str | Path, encoder: str = "resnet34", encoder_weights: str | None = "imagenet",
          epochs: int = 60, batch: int = 8, lr: float = 3e-4, patience: int = 12, seed: int = 42,
          device: str | None = None, log=print, progress=None, resume: bool = False) -> dict:
    """Train on ``data`` (written by ``prepare_dataset``); write ``out.onnx`` and ``out.json``; return the summary.

    ``progress(dict)`` is called after every epoch (epoch, epochs, loss, val_dice, best, best_epoch).
    A checkpoint ``out.ckpt`` is written after every epoch; ``resume=True`` continues from it (V0.17).
    """
    torch, smp = _torch()
    data, out = Path(data), Path(out).with_suffix("")
    out.parent.mkdir(parents=True, exist_ok=True)
    info = json.loads((data / "dataset.json").read_text(encoding="utf-8"))
    n_cls = 1 if info["binary"] else len(info["classes"]) + 1
    cfg = UnetConfig(tile=info["tile"], overlap=info["overlap"], px_per_cm=info["pxPerCm"], classes=info["classes"])
    random.seed(seed), np.random.seed(seed), torch.manual_seed(seed)
    device = device or best_device()
    model = smp.Unet(encoder, encoder_weights=encoder_weights, in_channels=3, classes=n_cls).to(device)
    tr = _loader(data / "train", cfg, True, batch, seed)
    has_val = any((data / "val" / "images").glob("*.png"))
    va = _loader(data / ("val" if has_val else "train"), cfg, False, batch, seed)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, epochs))
    best, best_ep, history, wait, start = -1.0, 0, [], 0, 1
    ckpt = out.with_suffix(".ckpt")
    if resume and ckpt.exists():
        c = torch.load(ckpt, map_location=device, weights_only=False)
        model.load_state_dict(c["model"]), opt.load_state_dict(c["opt"]), sched.load_state_dict(c["sched"])
        best, best_ep, history, wait, start = c["best"], c["best_ep"], c["history"], c["wait"], c["epoch"] + 1
        log(f"resuming after epoch {c['epoch']}")
    stopped = wait >= patience
    for ep in range(start, epochs + 1):
        if stopped:
            break
        model.train()
        tot = 0.0
        for x, y in tr:
            x, y = x.to(device), y.to(device)
            opt.zero_grad()
            loss = _loss(model(x), y, n_cls)
            loss.backward()
            opt.step()
            tot += float(loss) * len(x)
        sched.step()
        model.eval()
        a = b = 0
        with torch.no_grad():
            for x, y in va:
                da, db = _dice(model(x.to(device)), y.to(device), n_cls)
                a, b = a + da, b + db
        d = a / (a + b) if a + b else 0.0
        history.append({"epoch": ep, "loss": tot / max(1, len(tr.dataset)), "val_dice": d})
        log(f"epoch {ep}: loss {history[-1]['loss']:.4f}  val Dice {d:.4f}")
        if d > best:
            best, best_ep, wait = d, ep, 0
            torch.save(model.state_dict(), out.with_suffix(".pt"))
        else:
            wait += 1
            stopped = wait >= patience
        torch.save({"model": model.state_dict(), "opt": opt.state_dict(), "sched": sched.state_dict(), "epoch": ep,
                    "best": best, "best_ep": best_ep, "history": history, "wait": wait}, ckpt)
        if progress:
            progress({"epoch": ep, "epochs": epochs, "loss": history[-1]["loss"], "val_dice": d, "best": best,
                      "best_epoch": best_ep, "device": device})
    model.load_state_dict(torch.load(out.with_suffix(".pt"), map_location=device))
    export_onnx(model.cpu().eval(), cfg.tile, out.with_suffix(".onnx"))
    summary = {**cfg.to_json(), "encoder": encoder, "encoderWeights": encoder_weights, "bestEpoch": best_ep,
               "valDice": best, "validatedOn": "val" if has_val else "train (no validation cores)",
               "split": info["split"], "seed": seed, "history": history}
    out.with_suffix(".json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def best_device() -> str:
    """'cuda' (NVIDIA), 'mps' (Apple GPU) or 'cpu'."""
    torch, _ = _torch()
    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    return "mps" if mps is not None and mps.is_available() else "cpu"


def device_info() -> dict:
    """Training hardware seen by PyTorch (for the app's training dialog)."""
    torch, _ = _torch()
    d = best_device()
    name = torch.cuda.get_device_name(0) if d == "cuda" else ("Apple GPU (MPS)" if d == "mps" else "CPU")
    return {"device": d, "name": name, "torch": torch.__version__}


def export_onnx(model, tile: int, path: str | Path) -> Path:
    torch, _ = _torch()
    x = torch.zeros(1, 3, tile, tile)
    kw = dict(input_names=["image"], output_names=["logits"], opset_version=17,
              dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}})
    try:
        torch.onnx.export(model, x, str(path), dynamo=False, **kw)
    except TypeError:  # PyTorch < 2.5 has no `dynamo` argument
        torch.onnx.export(model, x, str(path), **kw)
    return Path(path)
