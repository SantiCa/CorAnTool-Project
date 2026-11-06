# SedCoreTool web app (formerly IchAnTool)

Browser application for ichnological analysis of core images. Everything runs locally in the
browser: images are never uploaded.

## Structure
Start screen (all projects, table of all cores, multiproject map) → project → cores. Tabs: Bioturbation (images of the active core), Core log, Data (all data, computed/manual columns, free sheet), Multiproxy (logs, map, interval classification of the project cores) and Figures. Map and logs open in a synchronized window or a floating panel.

## Workflow
1. **Core and image** — one image per core section; top/bottom depth of the analysis area; optional
   age model (`depth, age` per line). Draw the analysis area to leave out scale bars and core edges.
2. **Enhancement** — levels, gamma, brightness/contrast, saturation, histogram equalisation, local
   contrast, CLAHE, vibrance, channel selection, invert. Presets include Dorador et al. (2014,
   *Facies*) and the CLAHE workflow of Miguez-Salas et al. (2019); users can save their own.
3. **Automatic detection** — adaptive (local) or global threshold, dark/light traces, morphological
   smoothing, minimum size. Re-detection keeps objects already identified.
4. **Editing** — wand (colour region growing), brush, lasso, eraser, and an exclusion brush for cracks,
   voids and sampled areas (excluded pixels leave the denominator).
5. **Identification and learning** — assign ichnotaxa with keys 1–9 (0 = artefact). A distance-weighted
   k-nearest-neighbour model on shape, size and colour descriptors suggests classes for the remaining
   objects, refuses objects unlike any example, and reports leave-one-out accuracy. Models can be
   exported and imported to reuse them across cores.
6. **Results** — per-interval bioturbation %, % per ichnotaxon, BI and ii (automatic and manual), drawn
   next to the image at the same depth scale. Exports: results CSV, objects CSV, colour mask PNG and
   palette JSON (compatible with `sedcoretool analyze --palette`), and the whole project (JSON).
7. **Core log** — all sections on one depth or age axis with the image resampled to the axis,
   bioturbation, indices and external records (CSV/TXT/Excel); SVG and CSV export.
8. **Multiproxy** — many cores with any numeric records (long table, one file per core, catalogue) and
   described interval layers (lithology, turbidites…) that can subdivide each other; labels by dragged
   intervals or rules; all of it feeds an automatic interval classifier (independent of the ichnotaxon
   suggestions): random forest / k-NN / naive Bayes / k-means with seeded,
   leave-one-core-out validation; maps by age window; the image core and its ichnological data can
   join the analysis and its classes are overlaid on the core log.

The analysis reproduces the v2.1 reference results (BI/ii identical on the example image).

## Run locally
Any static server from the repository root, e.g.:

```bash
python -m http.server 8000
# open http://localhost:8000/app/
```

Single offline file (no server needed): `python tools/build_standalone.py` -> `dist/SedCoreTool_V<n>.html`.

## Code
- `js/core.js` — binning, indices, age model, CSV, run-length encoding (mirrors the Python package)
- `js/imageproc.js` — enhancement, detection, connected components, wand, lasso, shape descriptors
- `js/learn.js` — incremental k-NN classifier with novelty detection
- `js/app.js` — interface, tools, rendering, files
- `js/log.js` — composite core log: table parsing, depth/age axis, SVG and CSV of a window
- `js/sheet.js` — formulas of the Data tab (computed columns, A1 cells)
- `js/geo.js` — multiproxy: multi-core samples, interval layers, interval/rule labels, random forest, k-NN, naive Bayes, k-means, cross-validation, IDW maps
- `js/storage.js` — project library in IndexedDB
- `js/i18n.js` — Spanish / English strings

Tests: `npm test` (Node 22).
