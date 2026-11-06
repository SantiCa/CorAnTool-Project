"""Command line interface: ``sedcoretool analyze IMAGE --top 0 --bottom 500``."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import __version__
from .export import to_csv, to_excel
from .io import load_image, load_mask
from .pipeline import analyze_mask
from .segmentation import mask_from_palette, mask_from_threshold


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="sedcoretool", description="Quantitative ichnofabric analysis of core images")
    p.add_argument("--version", action="version", version=f"sedcoretool {__version__}")
    sub = p.add_subparsers(dest="command", required=True)

    a = sub.add_parser("analyze", help="analyse one image")
    a.add_argument("image", type=Path)
    a.add_argument("--top", type=float, required=True, help="depth of the image top")
    a.add_argument("--bottom", type=float, required=True, help="depth of the image bottom")
    a.add_argument("--units", default="cm")
    a.add_argument("--bin-px", type=int, default=1, help="pixel rows per data point")
    a.add_argument("--name", default=None, help="section name (default: file stem)")
    g = a.add_mutually_exclusive_group()
    g.add_argument("--threshold", type=float, default=5,
                   help="gray value <= threshold is bioturbation (default 5, v2.1 behaviour)")
    g.add_argument("--palette", type=Path, help="JSON {class: '#rrggbb'} for colour-coded images")
    g.add_argument("--label-mask", action="store_true", help="image is already an integer label mask")
    a.add_argument("--tolerance", type=int, default=10, help="colour tolerance for --palette")
    a.add_argument("-o", "--output", type=Path, help="output .csv or .xlsx (default: <image>_sedcoretool.csv)")

    # V0.15: U-Net
    u = sub.add_parser("unet", help="learned segmentation: prepare, train, evaluate, predict").add_subparsers(dest="unet", required=True)
    pr = u.add_parser("prepare", help="tiles and split by core from the app export (ZIP)")
    pr.add_argument("export", type=Path)
    pr.add_argument("out", type=Path)
    pr.add_argument("--tile", type=int, default=512)
    pr.add_argument("--overlap", type=int, default=64)
    pr.add_argument("--px-per-cm", type=float, default=None, help="training resolution (default: median of the export)")
    pr.add_argument("--multiclass", action="store_true", help="keep ichnotaxa as classes (default: bioturbation yes/no)")
    pr.add_argument("--val", nargs="*", default=None, help="validation cores")
    pr.add_argument("--test", nargs="*", default=None, help="test cores (never used in training)")
    pr.add_argument("--seed", type=int, default=42)
    tr = u.add_parser("train", help="train and export model.onnx + model.json (needs sedcoretool[unet])")
    tr.add_argument("data", type=Path)
    tr.add_argument("out", type=Path, help="output name, e.g. models/unet_v1")
    tr.add_argument("--encoder", default="resnet34")
    tr.add_argument("--no-pretrained", action="store_true", help="random encoder weights")
    tr.add_argument("--epochs", type=int, default=60)
    tr.add_argument("--batch", type=int, default=8)
    tr.add_argument("--lr", type=float, default=3e-4)
    tr.add_argument("--patience", type=int, default=12)
    tr.add_argument("--seed", type=int, default=42)
    tr.add_argument("--device", default=None, help="cuda, mps or cpu (default: the best available)")
    tr.add_argument("--resume", action="store_true", help="continue from the last checkpoint (<out>.ckpt)")
    tr.add_argument("--progress-json", action="store_true", help="one JSON line per epoch (used by the desktop app)")
    u.add_parser("device", help="training hardware seen by PyTorch (JSON)")
    ev = u.add_parser("evaluate", help="score whole images of independent cores")
    ev.add_argument("export", type=Path)
    ev.add_argument("model", type=Path)
    ev.add_argument("--dataset", type=Path, help="prepared folder: use its test cores")
    ev.add_argument("--cores", nargs="*", default=None)
    ev.add_argument("--threshold", type=float, default=0.5)
    ev.add_argument("--bin-cm", type=float, default=1.0)
    ev.add_argument("-o", "--output", type=Path, help="JSON with the scores")
    pd_ = u.add_parser("predict", help="label mask (PNG) of one image")
    pd_.add_argument("image", type=Path)
    pd_.add_argument("model", type=Path)
    pd_.add_argument("--px-per-cm", type=float, default=None)
    pd_.add_argument("--threshold", type=float, default=0.5)
    pd_.add_argument("-o", "--output", type=Path)
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "analyze":
        if args.label_mask:
            mask, names = load_mask(args.image), None
        elif args.palette:
            palette = json.loads(args.palette.read_text(encoding="utf-8"))
            mask, names = mask_from_palette(load_image(args.image, "RGB"), palette, args.tolerance)
        else:
            mask, names = mask_from_threshold(load_image(args.image), args.threshold)
        section = analyze_mask(mask, args.top, args.bottom, units=args.units, bin_px=args.bin_px,
                               class_names=names, name=args.name or args.image.stem)
        out = args.output or args.image.with_name(args.image.stem + "_sedcoretool.csv")
        (to_excel if out.suffix.lower() == ".xlsx" else to_csv)([section], out)
        print(f"{len(section.data)} data points -> {out}")
    elif args.command == "unet":
        return _unet(args)
    return 0


def _unet(args) -> int:
    if args.unet == "prepare":
        from .unet.dataset import prepare_dataset
        s = prepare_dataset(args.export, args.out, args.tile, args.overlap, args.px_per_cm, not args.multiclass,
                            args.val, args.test, args.seed)
        for k, v in s["split"].items():
            print(f"{k}: {v['tiles']} tiles, cores {', '.join(v['cores']) or '-'}")
        if not s["split"]["test"]["cores"]:
            print("warning: no test cores (fewer than 3 cores): scores will not measure independent cores")
    elif args.unet == "train":
        from .unet.train import train
        prog = (lambda d: print(json.dumps({"progress": d}), flush=True)) if args.progress_json else None
        s = train(args.data, args.out, args.encoder, None if args.no_pretrained else "imagenet", args.epochs,
                  args.batch, args.lr, args.patience, args.seed, args.device,
                  log=lambda m: print(m, flush=True), progress=prog, resume=args.resume)
        print(f"best epoch {s['bestEpoch']}, validation Dice {s['valDice']:.4f} -> {args.out.with_suffix('.onnx')}")
    elif args.unet == "device":
        from .unet.train import device_info
        print(json.dumps(device_info()))
    elif args.unet == "evaluate":
        from .unet.evaluate import evaluate
        r = evaluate(args.export, args.model, args.cores, args.threshold, args.bin_cm, args.dataset)
        p = r["pooled"]
        print(f"cores {', '.join(r['cores'])}: IoU {p['iou']:.4f}  Dice {p['dice']:.4f}")
        if args.output:
            args.output.write_text(json.dumps(r, indent=2, default=float), encoding="utf-8")
    elif args.unet == "predict":
        from PIL import Image

        from .segmentation import mask_from_unet
        mask, names = mask_from_unet(load_image(args.image, "RGB"), args.model, args.px_per_cm, args.threshold)
        out = args.output or args.image.with_name(args.image.stem + "_unet_mask.png")
        Image.fromarray(mask.astype("uint8")).save(out)
        print(f"classes {names}; {100 * (mask > 0).mean():.2f} % bioturbation -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
