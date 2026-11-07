# SedCoreTool

[![Tests](https://github.com/SantiCa/SedCoreTool-Project/actions/workflows/tests.yml/badge.svg)](https://github.com/SantiCa/SedCoreTool-Project/actions/workflows/tests.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)

**SedCoreTool** (*Sediment Core Tool*) quantifies bioturbation and ichnotaxa in sediment-core images and combines them
with any other down-core record — geochemistry, foraminifera, TOC, colour, magnetic susceptibility — and with
described intervals, on a common depth or age axis.

It runs on Windows, macOS and Linux, or in a web browser, and keeps all data on the user's computer. A Python package
with the same analysis definitions is available for scripting and batch processing.

> **Status:** version 0.x, in active development. Version 1.0 will be released when the program is considered
> complete. See the [changelog](CHANGELOG.md).

---

## Features

- **Bioturbation from core images.** Percentage of bioturbated area and of each ichnotaxon per depth interval, with
  the Bioturbation Index (BI) and the ichnofabric index (ii) derived automatically or entered manually.
- **Assisted segmentation.** Image enhancement (including published protocols), automatic detection of candidate
  traces, drawing and editing tools, an exclusion layer for cracks, voids and samples, and optional learned
  segmentation (U-Net).
- **Ichnotaxa identification.** A classifier learns from the traces you label and suggests the ichnotaxon of the
  rest, rejecting shapes unlike any example; you review every suggestion.
- **Core column.** All sections of a core on one depth or age axis, with images, traces, indices and external records.
- **Multiproxy analysis.** Numerical records and described intervals of many cores; user-defined classifiers
  (random forest, neural network, k-nearest neighbours, naive Bayes, k-means) validated by leaving whole cores out;
  maps by age window with several interpolation methods and projections.
- **Publication figures.** Core column, ichnotaxa distribution, representative traces, core sections and core
  location maps, as SVG, PNG or JPEG, with editable axes and labels.
- **Reproducible and shareable.** Every parameter is stored in the project together with the original images;
  exported tables record the version and settings used. Projects can be shared as a single file or through a shared
  folder, with comments.

## Installation

### The program

Download the installer for your system from the [latest release](../../releases/latest):

| System | File |
|---|---|
| Windows 10/11 (x64) | `SedCoreTool-V0.<n>-windows-setup.exe`, or `…-windows-portable.exe` (no installation) |
| macOS 13 or later (Intel and Apple Silicon) | `SedCoreTool-V0.<n>-mac-universal.dmg` |
| Linux (x64) | `SedCoreTool-V0.<n>-linux-x86_64.AppImage` or `…-linux-amd64.deb` |
| Any system, in a browser | `SedCoreTool_V0.<n>.html` — a single file that opens with a double click, offline |

The installers are not code-signed: on Windows choose *More info → Run anyway* if SmartScreen appears; on macOS open
the program the first time with right-click → *Open*. To update, install the new version over the old one; projects
are kept. Each release includes `SHA256SUMS.txt` and `RELEASE_MANIFEST.json` to verify the downloads.

The program can also be run from a copy of this repository: start a local server (`python3 -m http.server`) and
open `http://localhost:8000/app/`.

### The Python package

```bash
pip install "sedcoretool @ git+https://github.com/SantiCa/SedCoreTool-Project.git"
# optional extras: excel (Excel export), plot (matplotlib), unet (U-Net training)
pip install "sedcoretool[excel,plot] @ git+https://github.com/SantiCa/SedCoreTool-Project.git"
```

Requires Python 3.10 or later. The package is not on PyPI yet.

## Which part do I need?

| | **The program** | **The Python package `sedcoretool`** |
|---|---|---|
| Starts from | Your core photographs | A **mask**: an image in which bioturbation is already marked (painted, colour-coded per ichnotaxon, exported from the program, or predicted by a U-Net) |
| Does | Everything listed under *Features* | Turns masks into depth or age series of bioturbation %, % per ichnotaxon, BI and ii; trains and evaluates U-Net models |
| For | Anyone analysing cores | Scripted and batch processing |

Most users only need the program. The desktop program uses the Python package behind the scenes when it trains a
U-Net on the computer.

## Quick start (program)

1. **Create a project** and add the images of a core, one per section, with the top and bottom depth of each.
   Large images are reduced for working; the original file is always kept.
2. **Mark the bioturbation:** enhance the image, detect candidate traces or draw them, and exclude zones that must not
   be counted. Intervals with too few valid pixels are reported as *no data*, never as 0.
3. **Assign ichnotaxa** to some traces; the program suggests the rest, and you accept or correct the suggestions.
4. **Read the results** per interval (thickness in cm): bioturbation %, % per ichnotaxon, BI and ii. Add an age model
   to work in age.
5. **Combine and interpret** in the *Core column*, *Data* and *Multiproxy* modes, and prepare figures in *Figures*.
6. **Save and share:** projects are saved automatically on your computer. *Export this project (with images)* creates
   a `.sedcoretool` file that opens on any system; an automatic copy can be kept in a synchronised folder.

The built-in help and guided tour explain each step. The downloads contain no sample data.

## Quick start (Python package)

```bash
# image with bioturbation painted black; top and bottom of the image at 0 and 500 cm
sedcoretool analyze core.png --top 0 --bottom 500 --units cm --bin-px 100 -o core.csv

# colour-coded mask, e.g. the *_mask.png and *_palette.json exported by the program
sedcoretool analyze core_mask.png --top 0 --bottom 500 --palette palette.json -o core.xlsx
```

```python
from sedcoretool import analyze_mask, load_image, mask_from_palette

mask, names = mask_from_palette(load_image("core_mask.png", "RGB"), {"Zoophycos": "#ff0000", "Chondrites": "#0000ff"})
section = analyze_mask(mask, top=0, bottom=500, units="cm", bin_cm=1, class_names=names)
section.add_age(model_depth=[0, 500], model_age=[0, 40_000])     # optional age model
section.data.to_csv("core.csv", index=False)                     # depth, bioturbation_pct, <class>_pct, BI, ii, age
```

Use lossless formats (PNG, TIFF) for masks. The complete API, command line and U-Net commands are described in the
[technical documentation](docs/TECHNICAL_DOCUMENTATION.md#25-the-sedcoretool-python-package).

**Learned segmentation (experimental).** A U-Net can be trained on the traces reviewed in the program — from the
desktop program (*Detection → U-Net → Train on this computer…*) or with `sedcoretool unet` — and then used as a
detection method. No model trained on real cores is distributed yet.

## Privacy

Images and data never leave the computer. The program connects to the internet only for optional downloads: map
backgrounds (Esri, GEBCO; only after you allow it, since the map extent is sent), the vision model (Hugging Face) and,
in the browser version, a few libraries. See [SECURITY.md](SECURITY.md).

## Documentation

| Document | Content |
|----------|---------|
| [docs/TECHNICAL_DOCUMENTATION.md](docs/TECHNICAL_DOCUMENTATION.md) | How every part works: methods, formulas, default values, file formats, validation and limitations |
| [CHANGELOG.md](CHANGELOG.md) | Changes in each version |
| [docs/roadmap.md](docs/roadmap.md) | Planned work |
| [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) | How to contribute; working rules for contributors and AI coding assistants |
| [paper/](paper/) | Software paper (in preparation) |

## Repository layout

```
app/              the program (HTML and JavaScript ES modules; vendor/ = bundled libraries and fonts)
desktop/          desktop packaging (Electron) for Windows, macOS and Linux
src/sedcoretool/  Python package (src/ichantool/ is an alias for the former name)
tests/            Python, program and end-to-end tests, including the regression against version 2.1
examples/         public example data: IODP U1385I-1H core, idealised core, multiproxy demo, training project
tools/            offline build, version sync, release and synthetic-data scripts
docs/             technical documentation and roadmap
paper/            software paper
legacy/           original version 2.1 (2019), unchanged
```

## History and earlier names

SedCoreTool started in 2019 as **IchAnTool**, a script that turned hand-segmented core images into bioturbation series.
It was renamed **CorAnTool** in 2026 and **SedCoreTool** from version 0.52. Files and code written under the earlier
names keep working: older `.corantool` project packages open, and the Python package can still be imported as
`ichantool`. Version 2.1 is kept unchanged in [`legacy/`](legacy/), archived in Zenodo
([doi:10.5281/zenodo.3518837](https://doi.org/10.5281/zenodo.3518837)) and tagged `v2.1` in this repository. The former
repository addresses redirect here.

## Citing

If you use SedCoreTool, please cite the version you used; GitHub shows the citation under *Cite this repository*
(from [CITATION.cff](CITATION.cff)).

## License

GPL-3.0-or-later — see [LICENSE](LICENSE). Bundled libraries and fonts keep their own licences; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
