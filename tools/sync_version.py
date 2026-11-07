#!/usr/bin/env python3
"""V0.40: single version source. Reads DELIVERY from app/js/app.js (V0.<n>) and writes version 0.<n>.0 to
pyproject.toml, src/sedcoretool/__init__.py, CITATION.cff, desktop/package.json and the V0.<n> names in
desktop/RELEASE_NOTES.md (V0.61). `--check` only reports mismatches
(exit 1), as the test suite does. Run after changing DELIVERY."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = "https://github.com/SantiCa/SedCoreTool"


def delivery() -> str:
    m = re.search(r"const DELIVERY = '(V\d+(?:\.\d+)*)'", (ROOT / "app/js/app.js").read_text(encoding="utf-8"))
    if not m:
        sys.exit("DELIVERY not found in app/js/app.js")
    parts = (re.findall(r"\d+", m.group(1)) + ["0", "0"])[:3]
    return ".".join(str(int(p)) for p in parts)


def targets(v: str):
    yield "pyproject.toml", r'(?m)^version = "[^"]*"', f'version = "{v}"'
    yield "src/sedcoretool/__init__.py", r'(?m)^__version__ = "[^"]*"', f'__version__ = "{v}"'
    yield "CITATION.cff", r"(?m)^version: .*$", f"version: {v}"


def main(check: bool) -> int:
    v, bad = delivery(), []
    for rel, pat, new in targets(v):
        p = ROOT / rel
        txt = p.read_text(encoding="utf-8")
        out = re.sub(pat, new, txt, count=1)
        if out != txt:
            bad.append(rel)
            if not check:
                p.write_text(out, encoding="utf-8")
    pj = ROOT / "desktop/package.json"
    d = json.loads(pj.read_text(encoding="utf-8"))
    want = {"version": v, "license": "GPL-3.0-or-later", "homepage": REPO}
    if any(d.get(k) != x for k, x in want.items()):
        bad.append("desktop/package.json")
        if not check:
            d.update(want)
            pj.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    lk = ROOT / "desktop/package-lock.json"
    if lk.exists():
        L = json.loads(lk.read_text(encoding="utf-8"))
        root = L.get("packages", {}).get("", {})
        if L.get("version") != v or root.get("version") != v or root.get("license") != "GPL-3.0-or-later":
            bad.append("desktop/package-lock.json")
            if not check:
                L["version"] = v
                root.update({"version": v, "license": "GPL-3.0-or-later"})
                lk.write_text(json.dumps(L, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    notes = ROOT / "desktop/RELEASE_NOTES.md"
    if notes.exists():
        tag = "V" + ".".join(v.split(".")[:2])
        txt = notes.read_text(encoding="utf-8")
        out = re.sub(r"V0\.\d+", tag, txt)
        if out != txt:
            bad.append("desktop/RELEASE_NOTES.md")
            if not check:
                notes.write_text(out, encoding="utf-8")
    if check and bad:
        print(f"version {v} not set in: {', '.join(bad)} (run tools/sync_version.py)")
        return 1
    print(f"version {v}" + (f" written to {', '.join(bad)}" if bad and not check else " consistent"))
    return 0


if __name__ == "__main__":
    sys.exit(main("--check" in sys.argv))
