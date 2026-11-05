# CorAnTool (formerly IchAnTool)

> Core Analysis Tool. Since V16 the program is called **CorAnTool**: it started as IchAnTool (ichnology analysis tool,
> Casanova-Arenillas et al. 2020) and now also handles multiproxy records (geochemistry, foraminifera, TOC, sedimentology…).
> The Python package keeps the import name `ichantool` for compatibility.

**Quantitative ichnofabric analysis of sediment core images.**

CorAnTool turns segmented core images (bioturbation painted or labelled on the image) into
continuous depth or age series of:

- percentage of bioturbated surface,
- percentage per class (e.g. per ichnotaxon) for colour-coded images,
- semi-quantitative indices: Bioturbation Index (Reineck 1963; Taylor & Goldring 1993) and
  ichnofabric index (Droser & Bottjer 1986), with user-definable schemes.

The resulting series can be correlated directly with geochemical, mineralogical or logging data.

> Version 3 is a rewrite of the tool published in
> Casanova-Arenillas, S., Rodríguez-Tovar, F.J., Martínez-Ruiz, F. (2020).
> *Applied ichnology in sedimentary geology: Python scripts as a method to automatize ichnofabric
> analysis in marine core images.* Computers & Geosciences 136, 104407.
> https://doi.org/10.1016/j.cageo.2020.104407
>
> v3 reproduces the published v2.1 results exactly (see `tests/`). The original code is kept in
> [`legacy/`](legacy/).

## Web app

Browser application (no installation, images stay on your computer): enhancement, automatic
trace detection, editing tools, learned ichnotaxon identification and depth/age results, a
composite core log with external records, and a **multiproxy mode** (any numeric records and
hierarchical described intervals — lithology, turbidites… — for many cores, user-defined labels by
intervals or rules, configurable automatic interval classification, maps by age, overlay on the core log).
See [`app/`](app/) and run it with any static server (`python -m http.server`, then open `/app/`),
or build a single offline file with `python tools/build_standalone.py` (-> `dist/CorAnTool_V<n>.html`, open by double-click).

## Install

```bash
pip install "ichantool[excel,plot] @ git+https://github.com/SantiCa/IchAnTool-Project.git"
```

## Quick start

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

section = analyze_image("core.png", top=0, bottom=500, bin_px=100)
section.add_age(model_depth=[0, 500], model_age=[0, 40_000])   # optional age model
section.data.to_csv("core.csv", index=False)
plot_section(section)
```

Prefer lossless formats (PNG/TIFF) for masks: JPEG compression alters the pixel values that
the analysis counts.

## Repository layout

```
app/                web application (HTML + JavaScript)
src/ichantool/      Python package
  io.py             image loading (PNG, TIFF, JPEG)
  segmentation.py   image -> label mask (threshold, colour palette; future: learned models)
  pipeline.py       label mask -> depth series (CoreSection)
  indices.py        BI / ii schemes (configurable)
  depth.py          depth scale and age models
  export.py         CSV / Excel
  plotting.py       quick-look plots
  cli.py            `ichantool` command
tests/              automated tests (incl. regression against v2.1)
examples/           example images; U1385I-1H = test core (IODP, public data)
docs/               method and roadmap
publications/       draft papers and candidate journals
legacy/             original v2.1 code (2019), unchanged
```

## Documentation

- [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) — agent instructions; [docs/COORDINACION_IA.md](docs/COORDINACION_IA.md) — shared Claude/Codex workflow and handoff.
- [docs/DOCUMENTACION_TECNICA.md](docs/DOCUMENTACION_TECNICA.md) — every algorithm, formula, default value and validation result (Spanish).
- [docs/HISTORIAL_VERSIONES.md](docs/HISTORIAL_VERSIONES.md) — what changed in each version and why (Spanish).
- [publications/METODOS_Y_DEFENSA.md](publications/METODOS_Y_DEFENSA.md) — methods per planned paper and answers to likely reviewer questions (Spanish).
- [CHANGELOG.md](CHANGELOG.md) — short English summary.

## Roadmap

See [docs/roadmap.md](docs/roadmap.md): assisted/learned segmentation, open annotated dataset,
web application, LAS export.

## Citing

If you use CorAnTool (IchAnTool), please cite the 2020 paper above (see also `CITATION.cff`).

## License

GPL-3.0 — see [LICENSE](LICENSE).
