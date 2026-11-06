"""Export the publications dossier (index, methods and defence, drafts, journals) to Word and LaTeX.

Usage:  python tools/export_publications.py  ->  publications/export/Publicaciones_SedCoreTool.{docx,tex}
Needs pandoc on the PATH. Citations of the JOSS draft are resolved with its paper.bib.
"""
from __future__ import annotations

import re
import subprocess
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / "publications"
OUT = PUB / "export"
PARTS = [
    ("README.md", None),
    ("METODOS_Y_DEFENSA.md", None),
    ("01_software_JOSS/paper.md", "Borrador 1 — Software (JOSS, en inglés)"),
    ("02_dataset_segmentation/draft.md", "Borrador 2 — Dataset y segmentación"),
    ("03_validation_application/draft.md", "Borrador 3 — Validación y aplicación"),
    ("04_multiproxy_classification/draft.md", "Borrador 4 — Clasificación multiproxy"),
    ("05_nota_geogaceta/draft.md", "Borrador 5 — Nota en Geogaceta"),
    ("journals.md", None),
]


def delivery() -> str:
    m = re.search(r"const DELIVERY = '(V\d+)'", (ROOT / "app" / "js" / "app.js").read_text(encoding="utf-8"))
    return m.group(1) if m else ""


def section(rel: str, title: str | None) -> str:
    text = (PUB / rel).read_text(encoding="utf-8")
    text = re.sub(r"\A---\n.*?\n---\n", "", text, flags=re.S)          # YAML front matter of the JOSS draft
    text = re.sub(r"^## (Descargas|Estructura)\n.*?(?=^## )", "", text, flags=re.S | re.M)  # internal sections
    text = re.sub(r"\[([^\]]+)\]\((?!https?://)[^)]+\)", r"\1", text)  # relative links: keep the text
    lines = text.splitlines()
    if title:  # the draft's own title becomes level 2 under a level-1 heading
        lines = [f"# {title}", ""] + [("#" + l if l.startswith("#") else l) for l in lines]
    return "\n".join(lines).strip() + "\n"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    head = (f"---\ntitle: 'Publicaciones previstas — SedCoreTool'\nsubtitle: 'Cartera, métodos, defensa ante revisores y borradores'\n"
            f"author: 'Santiago Casanova-Arenillas'\ndate: '{date.today():%d-%m-%Y} · software {delivery()}'\nlang: es\n---\n\n")
    body = head + "\n\\newpage\n\n".join(section(r, t) for r, t in PARTS)
    md = OUT / "Publicaciones_SedCoreTool.md"
    md.write_text(body, encoding="utf-8")
    common = ["pandoc", str(md), "--citeproc", "--bibliography", str(PUB / "01_software_JOSS" / "paper.bib"), "--toc", "--toc-depth=2"]
    subprocess.run(common + ["-o", str(OUT / "Publicaciones_SedCoreTool.docx")], check=True)
    subprocess.run(common + ["-s", "-V", "geometry:margin=2.3cm", "-V", "fontsize=10pt", "-V", "colorlinks=true",
                             "-V", "documentclass=article", "-o", str(OUT / "Publicaciones_SedCoreTool.tex")], check=True)
    tex = OUT / "Publicaciones_SedCoreTool.tex"   # symbols outside Latin-1 → LaTeX commands, so pdflatex also works
    t = tex.read_text(encoding="utf-8")
    for a, b in {"→": r"$\rightarrow$", "≈": r"$\approx$", "≤": r"$\leq$", "≥": r"$\geq$", "±": r"$\pm$", "✓": r"$\checkmark$"}.items():
        t = t.replace(a, b)
    tex.write_text(t, encoding="utf-8")
    md.unlink()
    print(f"{OUT / 'Publicaciones_SedCoreTool.docx'}\n{OUT / 'Publicaciones_SedCoreTool.tex'}")


if __name__ == "__main__":
    main()
