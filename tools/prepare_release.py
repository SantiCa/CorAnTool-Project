"""V0.48: validate release assets and write a SHA-256 manifest before uploading a draft."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

from build_standalone import build, delivery

ROOT = Path(__file__).resolve().parents[1]


def prepare(folder: Path) -> None:
    folder = folder.resolve()
    folder.mkdir(parents=True, exist_ok=True)
    ver = delivery()
    names = [f"CorAnTool-{ver}-{suffix}" for suffix in (
        "windows-setup.exe", "windows-portable.exe", "mac-universal.dmg",
        "linux-x86_64.AppImage", "linux-amd64.deb",
    )]
    missing = [name for name in names if not (folder / name).is_file()]
    if missing:
        raise ValueError("Missing installers: " + ", ".join(missing))
    html = build(folder / f"CorAnTool_{ver}.html")
    names.append(html.name)
    allowed = set(names) | {"SHA256SUMS.txt", "RELEASE_MANIFEST.json"}
    extra = [p.name for p in folder.iterdir() if p.name not in allowed or not p.is_file()]
    if extra:
        raise ValueError("Unexpected release assets: " + ", ".join(extra))
    assets = []
    for name in sorted(names):
        p = folder / name
        if not p.stat().st_size:
            raise ValueError("Empty release asset: " + name)
        with p.open("rb") as stream:
            sha = hashlib.file_digest(stream, "sha256").hexdigest()
        assets.append({"name": name, "bytes": p.stat().st_size, "sha256": sha})
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Invalid Git commit")
    manifest = {"delivery": ver, "commit": commit, "assets": assets}
    (folder / "RELEASE_MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    files = names + ["RELEASE_MANIFEST.json"]
    checks = []
    for name in sorted(files):
        with (folder / name).open("rb") as stream:
            checks.append(f"{hashlib.file_digest(stream, 'sha256').hexdigest()}  {name}")
    (folder / "SHA256SUMS.txt").write_text("\n".join(checks) + "\n", encoding="utf-8")
    print(f"{ver}: {len(files)} assets validated; SHA256SUMS.txt written; commit {commit}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    prepare(parser.parse_args().folder)
