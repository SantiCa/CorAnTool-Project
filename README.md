# CorAnTool

**Core Analysis Tool** — quantify bioturbation and ichnotaxa in sediment-core images and combine them with any other
down-core record (geochemistry, foraminifera, TOC, colour, magnetic susceptibility…) in one project.

CorAnTool started in 2019 as **IchAnTool**, a script that turned hand-segmented core images into bioturbation series
(Casanova-Arenillas et al., 2020). It is now a desktop program (Windows, macOS, Linux) and a Python package
(import name `ichantool`).

> Status: version **0.x** (in development). Version 1.0 will be released when the program is considered complete.

---

## What it is useful for

- **Ichnofabric analysis of cores.** Measure the percentage of bioturbated area and of each ichnotaxon, interval by
  interval, with depth and age, instead of estimating it by eye. The Bioturbation Index (BI) and the ichnofabric index
  (ii) are derived automatically and can also be entered manually.
- **Reproducible, documented results.** Every step is saved in the project (image, depth scale, enhancement,
  detection, masks, excluded zones, classes), so the analysis can be repeated and checked by a reviewer.
- **Less manual work.** Enhancement filters, automatic shape detection and a classifier that learns from the traces
  you label speed up the segmentation; you stay in control and correct what it gets wrong.
- **Ichnology together with other proxies.** Plot bioturbation next to geochemistry or other records on a common
  depth or age axis, classify intervals automatically (multiproxy mode) and map results between cores.
- **Publication-ready figures** of the core column, ichnotaxon distribution, representative traces and sections.
- **Team work.** Projects can be shared as a single file with the full-resolution images, or through a shared folder
  (Drive, OneDrive, Dropbox), with dated comments and replies.

## Download

Installers for the latest version are on the [Releases page](../../releases/latest):

| System | File |
|---|---|
| Windows | `…-windows-setup.exe` (installer) or `…-windows-portable.exe` (no installation) |
| macOS (Intel and Apple Silicon) | `…-mac-universal.dmg` |
| Linux | `…-linux-x86_64.AppImage` or `…-linux-amd64.deb` |

The installers are not code-signed. On Windows, if SmartScreen appears, choose *More info → Run anyway*. On macOS,
open the program the first time with right-click → *Open*. The program does not update itself: download the new
installer from Releases and install it over the old one (your projects are kept).

---

## How to use it

### 1. Create a project and add images

1. Start the program and create a project (*Create*).
2. Add the core images (JPEG, PNG or TIFF). You are asked which **core** they belong to (or create a new one).
   Each image is a **section** of that core.
3. For each section give the **top and bottom depth** of the analysed area and its units. Optionally rotate, crop
   and set the analysis area (to leave out the scale bar, colour chart or core edges).

Large images are reduced for working by averaging pixels; the original file is always kept at full resolution, and
the **working resolution** of each section can be changed later.

### 2. Mark the bioturbation

- **Enhance** the image (contrast, levels, CLAHE and published presets) to make the traces visible.
- **Detect** shapes automatically, or draw them with the brush, magic wand and lasso.
- **Exclude** zones that must not be counted (cracks, sampling holes, labels). Intervals with too few valid pixels
  are shown as *NO DATA*, never as 0.
- **Assign ichnotaxa** (classes) to the traces. After a few examples the classifier proposes the class of the rest;
  accept or correct its proposals. Other ichnotaxa can be hidden while you interpret.

### 3. Results

- The analysis interval is set **in centimetres**. For each interval you get the percentage of bioturbation, the
  percentage of each ichnotaxon, BI and ii.
- Add an **age model** to work in age as well as depth.
- Export the results to **CSV** (one row per interval).

### 4. Core column and other records

- The **Column** mode joins all the sections of a core on a depth or age axis, with the image, bioturbation,
  ichnotaxa, BI, ii and any **external records** you import (CSV, TXT or Excel).
- Columns, axes (limits, divisions, units, logarithmic scale), widths, colours and labels can be edited.
- An **identification mode** marks where each ichnotaxon was recognised, alone or together with the quantified
  columns.

### 5. Multiproxy mode

Import numeric records of many cores, define described intervals (lithology, turbidites, organic-rich layers…),
label them, and train a classifier (random forest, k-NN, naive Bayes, neural network or k-means) that recognises the
intervals in other cores. Validation leaves one core out at a time. Results can be mapped by age.

### 6. Figures

*Figures* builds publication figures as SVG or PNG: core column, ichnotaxon distribution, representative traces of
each ichnotaxon (several versions side by side, configurable scale bar) and sections side by side, with a depth
window, real proportions and editable labels and symbols.

### 7. Saving, sharing and team work

- Projects are **saved automatically** on your computer.
- **Export this project (with images)** creates a `.corantool` file with the full-resolution images; anyone can open
  it with *Import file…* on any system.
- **Automatic copy to a folder**: choose a folder (ideally a shared Drive/OneDrive/Dropbox folder). Each project is
  written there as a folder; a colleague opens it with *Open project folder…*. When the same project is opened again,
  you choose whether to replace your version or keep a copy (comments of both versions are kept).
- **Comments** (💬 button): dated comments with author, linked to a point of a section, with replies, resolve and
  delete. Work by turns: there is no lock between users yet.

The built-in **help** and guided tour explain each step. The *Examples and learning* section of the start screen
has an idealised core, a public IODP test core and a training project.

---

## Web version and single offline file

The same program runs in a browser: serve the repository with any static server (`python -m http.server`, then open
`/app/`), or build one HTML file that opens by double-click and works offline with
`python tools/build_standalone.py` (→ `dist/CorAnTool_V<n>.html`).

## Python package

```bash
pip install "ichantool[excel,plot] @ git+https://github.com/SantiCa/IchAnTool-Project.git"
```

Command line (image with bioturbation painted black, core top at the top of the image):

```bash
ichantool analyze core.png --top 0 --bottom 500 --units cm --bin-px 100 -o core.csv
```

Colour-coded ichnotaxa (`palette.json` = `{"Zoophycos": "#ff0000", "Chondrites": "#0000ff"}`):

```bash
ichantool analyze core_rgb.png --top 0 --bottom 500 --palette palette.json -o core.xlsx
```

Python:

```python
from ichantool import analyze_image
from ichantool.plotting import plot_section

section = analyze_image("core.png", top=0, bottom=500, bin_cm=1)   # 1 cm intervals (or bin_px=…)
section.add_age(model_depth=[0, 500], model_age=[0, 40_000])       # optional age model
section.data.to_csv("core.csv", index=False)
plot_section(section)
```

Prefer lossless formats (PNG/TIFF) for masks: JPEG compression alters the pixel values that the analysis counts.

### Learned segmentation (U-Net, experimental)

Train a U-Net on the traces you reviewed in the app, then use it as a detection method in the app
(*Detection → U-Net*, load `model.onnx` and `model.json`). No model trained on real cores is published yet.

In the **desktop program** you can train without the command line: *Detection → U-Net → Train on this
computer…* (installs a 2–3 GB training module once; uses an NVIDIA or Apple GPU if present; needs Python ≥ 3.10).

For ichnotaxa, *Models and training → What the classifier looks at → Vision model (DINOv2)* replaces the 12
shape descriptors by the embedding of a pre-trained vision model (88 MB download, cached).
Plain-language guide (Spanish): [publications/GUIA_APRENDIZAJE_AUTOMATICO.md](publications/GUIA_APRENDIZAJE_AUTOMATICO.md).

```bash
pip install "ichantool[unet] @ git+https://github.com/SantiCa/CorAnTool-Project.git"
# in the app: Results → U-Net training data (ZIP)
ichantool unet prepare project_segmentation_dataset.zip data --test CORE_A CORE_B   # tiles, split by core
ichantool unet train data models/unet_v1                                           # GPU recommended
ichantool unet evaluate project_segmentation_dataset.zip models/unet_v1.onnx --dataset data
```

## Repository layout

```
app/                program (HTML + JavaScript); vendor/ = bundled libraries (UTIF, pako, SheetJS)
desktop/            desktop packaging (Electron) for Windows, macOS and Linux
src/ichantool/      Python package
tests/              automated tests (JavaScript and Python, incl. regression against v2.1)
examples/           public examples: idealised core, IODP U1385I-1H test core, geochemistry demo, training project
tools/              offline build, tutorial and demo data, export of the documentation
docs/               technical documentation, version history and roadmap (Spanish)
publications/       draft papers and candidate journals
legacy/             original v2.1 code (2019), unchanged
```

## Documentation

- [docs/DOCUMENTACION_TECNICA.md](docs/DOCUMENTACION_TECNICA.md) — every algorithm, formula, default value and
  validation result (Spanish).
- [docs/HISTORIAL_VERSIONES.md](docs/HISTORIAL_VERSIONES.md) — what changed in each version and why (Spanish).
- [CHANGELOG.md](CHANGELOG.md) — short English summary of each version.
- [docs/roadmap.md](docs/roadmap.md) — planned work.
- [publications/METODOS_Y_DEFENSA.md](publications/METODOS_Y_DEFENSA.md) — methods per planned paper (Spanish).
- [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), [docs/COORDINACION_IA.md](docs/COORDINACION_IA.md) — development
  workflow.

## Citing

If you use CorAnTool, please cite (see also `CITATION.cff`):

> Casanova-Arenillas, S., Rodríguez-Tovar, F.J., Martínez-Ruiz, F. (2020). Applied ichnology in sedimentary geology:
> Python scripts as a method to automatize ichnofabric analysis in marine core images. *Computers & Geosciences*,
> 136, 104407. https://doi.org/10.1016/j.cageo.2020.104407

## License

GPL-3.0 — see [LICENSE](LICENSE). Bundled libraries keep their own licences (`app/vendor/LICENSE-*`).

---

## En español (resumen)

CorAnTool mide la bioturbación y los icnotaxones en imágenes de testigos de sondeo y los combina con otros registros
(geoquímica, foraminíferos, TOC, color…) en profundidad o edad.

**Uso:** crea un proyecto; añade las imágenes indicando a qué sondeo pertenecen y su techo y muro; realza, detecta o
dibuja las trazas, excluye lo que no debe contarse y asigna icnotaxones (el programa aprende de tus ejemplos);
obtén el porcentaje de bioturbación, de cada icnotaxón, BI e ii por intervalos en cm; únelo todo en la columna del
sondeo con otros registros; clasifica intervalos en el modo Multiproxy; prepara figuras; y comparte el proyecto con
sus imágenes completas o mediante una carpeta compartida, con comentarios.

**Utilidad:** resultados cuantitativos, reproducibles y documentados en lugar de estimaciones visuales, menos trabajo
manual y figuras listas para publicar.
