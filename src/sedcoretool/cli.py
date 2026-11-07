"""Command line interface: ``sedcoretool analyze IMAGE --top 0 --bottom 500``."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from . import __version__
from .batch import load_exclusion, run_manifest, write_manifest_template
from .export import join_sections, to_csv, to_excel, to_las
from .io import load_image, load_mask
from .pipeline import analyze_mask
from .segmentation import mask_from_palette, mask_from_threshold


def _safe(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in name) or "core"


def _mask_args(a: argparse.ArgumentParser) -> None:
    bins = a.add_mutually_exclusive_group()
    bins.add_argument("--bin-cm", type=float, default=None, help="interval thickness in cm (as in the program)")
    bins.add_argument("--bin-px", type=float, default=None, help="pixel rows per interval (default 1)")
    g = a.add_mutually_exclusive_group()
    g.add_argument("--threshold", type=float, default=5,
                   help="gray value <= threshold is bioturbation (default 5, v2.1 behaviour)")
    g.add_argument("--palette", type=Path, help="JSON {class: '#rrggbb'} for colour-coded images")
    g.add_argument("--label-mask", action="store_true", help="image is already an integer label mask")
    a.add_argument("--tolerance", type=int, default=10, help="colour tolerance for --palette")
    a.add_argument("--exclude-value", type=int, default=None,
                   help="with --label-mask: pixels with this value are excluded (e.g. 255 in U-Net datasets)")
    a.add_argument("--min-valid", type=float, default=0.2,
                   help="intervals with less than this fraction of valid pixels have no data (default 0.2)")


def _mask_reader(args):
    """Function image path -> (mask, class names, exclusion or None) for the chosen input type."""
    palette = json.loads(args.palette.read_text(encoding="utf-8")) if args.palette else None
    if args.exclude_value is not None and not args.label_mask:
        raise SystemExit("--exclude-value needs --label-mask")

    def read(path: Path):
        if args.label_mask:
            mask = load_mask(path)
            if args.exclude_value is None:
                return mask, None, None
            ex = mask == args.exclude_value
            return np.where(ex, 0, mask), None, ex
        if palette is not None:
            return (*mask_from_palette(load_image(path, "RGB"), palette, args.tolerance), None)
        return (*mask_from_threshold(load_image(path), args.threshold), None)
    return read


def _bins(args) -> dict:
    return {"bin_cm": args.bin_cm, "bin_px": args.bin_px or 1, "min_valid": args.min_valid}


def _write(sections, out: Path, overlap: str | None, well: str = "") -> Path:
    ext = out.suffix.lower()
    if ext == ".las":
        return to_las(sections, out, well=well, overlap=overlap or "upper")
    if overlap and overlap != "keep":
        rows = join_sections(sections, overlap=overlap)
        if ext == ".xlsx":
            rows.to_excel(out, index=False)
        else:
            rows.to_csv(out, index=False)
        return out
    return (to_excel if ext == ".xlsx" else to_csv)(sections, out)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="sedcoretool", description="Quantitative ichnofabric analysis of core images")
    p.add_argument("--version", action="version", version=f"sedcoretool {__version__}")
    sub = p.add_subparsers(dest="command", required=True)

    a = sub.add_parser("analyze", help="analyse one image")
    a.add_argument("image", type=Path)
    a.add_argument("--top", type=float, required=True, help="depth of the image top")
    a.add_argument("--bottom", type=float, required=True, help="depth of the image bottom")
    a.add_argument("--units", default="cm", choices=["mm", "cm", "m"])
    a.add_argument("--name", default=None, help="section name (default: file stem)")
    a.add_argument("--exclude", type=Path, help="exclusion image of the same size: white = excluded")
    _mask_args(a)
    a.add_argument("-o", "--output", type=Path, help="output .csv, .xlsx or .las (default: <image>_sedcoretool.csv)")

    b = sub.add_parser("batch", help="analyse every section listed in a manifest CSV (one or several cores)")
    b.add_argument("manifest", type=Path, help="CSV: image, top, bottom [, core, units, name, exclude]")
    _mask_args(b)
    b.add_argument("--overlap", choices=["keep", "upper", "error"], default=None,
                   help="overlapping sections: keep all, keep the upper one, or stop (default: keep; upper for LAS)")
    b.add_argument("-o", "--output", type=Path, required=True,
                   help="output .csv, .xlsx or .las (LAS: one file per core, <name>_<core>.las if several)")

    t = sub.add_parser("manifest", help="write a manifest CSV listing the images of a folder (fill in the depths)")
    t.add_argument("folder", type=Path)
    t.add_argument("-o", "--output", type=Path, help="default: <folder>/sections.csv")

    # V0.15: U-Net
    u = sub.add_parser("unet", help="learned segmentation: prepare, train, evaluate, predict").add_subparsers(dest="unet", required=True)
    pr = u.add_parser("prepare", help="tiles and split by core from the app export (ZIP)")
    pr.add_argument("export", type=Path)
    pr.add_argument("out", type=Path)
    pr.add_argument("--tile", type=int, default=512)
    pr.add_argument("--overlap", type=int, default=64)
    pr.add_argument("--px-per-cm", type=float, default=None, help="training resolution (default: median of the export)")
    pr.add_argument("--multiclass", action="store_true", help="keep ichnotaxa as classes (default: bioturbation yes/no)")
    pr.add_argument("--overwrite", action="store_true", help="replace a previous dataset in OUT (needs its dataset.json)")
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
        mask, names, ex = _mask_reader(args)(args.image)
        if args.exclude:
            ex2 = load_exclusion(args.exclude)
            ex = ex2 if ex is None else (ex | ex2)
        section = analyze_mask(mask, args.top, args.bottom, units=args.units, class_names=names, exclude=ex,
                               name=args.name or args.image.stem, **_bins(args))
        out = args.output or args.image.with_name(args.image.stem + "_sedcoretool.csv")
        _write([section], out, None)
        print(f"{len(section.data)} data points -> {out}")
    elif args.command == "batch":
        read = _mask_reader(args)
        cores = run_manifest(args.manifest, to_mask=read, **_bins(args))
        out = args.output
        if out.suffix.lower() == ".las" and len(cores) > 1:
            for core, secs in cores.items():
                f = _write(secs, out.with_name(f"{out.stem}_{_safe(core)}.las"), args.overlap, core)
                print(f"{core}: {len(secs)} sections -> {f}")
        else:
            secs = [s for v in cores.values() for s in v]
            _write(secs, out, args.overlap, next(iter(cores)))
            print(f"{len(cores)} core(s), {len(secs)} sections, {sum(len(s.data) for s in secs)} data points -> {out}")
    elif args.command == "manifest":
        print(f"fill in top and bottom -> {write_manifest_template(args.folder, args.output)}")
    elif args.command == "unet":
        return _unet(args)
    return 0


def _unet(args) -> int:
    if args.unet == "prepare":
        from .unet.dataset import prepare_dataset
        s = prepare_dataset(args.export, args.out, args.tile, args.overlap, args.px_per_cm, not args.multiclass,
                            args.val, args.test, args.seed, overwrite=args.overwrite)
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
