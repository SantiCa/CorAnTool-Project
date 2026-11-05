# Changelog

Delivery numbers and full details: [docs/HISTORIAL_VERSIONES.md](docs/HISTORIAL_VERSIONES.md).

## V33 — App 2.3 — 2026-11-05
- Original images stored once on disk (separate image store); pixels loaded only for the sections in use.
- Full-resolution originals kept; per-section working resolution can be changed later (masks follow). Crop no longer re-encodes.
- Analysis interval set in cm (fractional rows per interval, same rule in JS and Python `bin_cm`). Project format v4.

## V32 — App 2.2 — 2026-11-05
- Identification mode: mark traces without quantifying; column shows triangles and identified ichnotaxa per interval.
- Ichnotaxa colour legend in the column and core figures; abbreviations (Ch, Pl, Th, Zo…).
- New figures: core sections side by side (original, treated, coloured/transparent traces, outlines, traces only, black, arrows) and ichnotaxa distribution chart.
- Desktop workflow also runs when a release is published on GitHub.

## V31 — App 2.1 + desktop — 2026-11-05
- Crop section images (top/bottom) with depth recalculation; draggable Start/End markers for the analysis area.
- Column: option to hide excluded zones; reduced-size column canvases (memory).
- Clean start (no preloaded projects; thesis only on demand where its private data exist; offline build excludes it).
- Desktop program (Electron) for Windows, macOS and Linux; GitHub Actions builds and publishes it as a Release on `V*` tags.

## V30 — 2026-11-05
- Added Codex instructions, shared Claude/Codex editing and handoff rules, and four focused chat roles. Updated the visible delivery tag; analysis behavior is unchanged.

## V29 — 2026-11-01
- Publications: updated portfolio (5 papers), methods and defence reorganised, drafts 4 and 5, Word/LaTeX export (`tools/export_publications.py`).

## V28 — 2026-11-01
- Documentation only: handoff note for continuing in Claude Code (`docs/TRASPASO_CLAUDE_CODE.md`).

## V27 — Web app 2.0.1 — 2026-11-01
- Visible training progress (step, epoch, time left, Cancel) without freezing the page; `crossValidateSteps`, `fitModelSteps`.
- Version tag (V27) in the header, start screen, help and window title, `delivery` field in project files; offline file named `CorAnTool_V27.html`.

## V26 — Web app 2.0 — 2026-11-01
- Multiproxy rebuilt around interval families and classifiers: every family is a column in every core; drag in it
  to classify by hand, click to edit; copy automatic columns to the family.
- User-defined classifiers (targets, input variables/families, model, settings), one ⚙ column per family, comparison
  table; new neural network model (multilayer perceptron, Adam, L2, class weights, early stopping).
- Models look their inputs up by name, so new families, variables or cores no longer invalidate them.

## V25 — Web app 1.9 — 2026-10-31
- Multiproxy usability pass: compact import grid and core table, per-step summaries, sticky train button,
  grouped curve toolbar with layer/class picker, click a band to edit its interval, safer class deletion.
- Hover help everywhere in the mode (styled tooltips), map point tooltips, confusion-matrix explanations.
- Log cursor readout (Columna and Curves); scrollable logs, per-track resizable widths, two-line track names.

## V24 — Web app 1.8.1 — 2026-10-31
- Cross-project analyses are no longer listed as projects: they are created, saved and opened in the
  «Across projects» tab; the header reads «Analysis» while one is open.

## V23 — Web app 1.8 — 2026-10-31
- Generic start screen: every saved project as a card (core thumbnails, counts, open/rename/delete), search,
  empty state; examples in a collapsible section; no dedicated thesis entry.
- Cores present in several projects (matched by normalised name) count once: merged map point, «in N
  projects» tag, one merged core in multi-project analyses, duplicate ichnotaxon examples dropped.
- Side panels resizable (drag), resettable (double click) and collapsible; maps resizable from their right
  and bottom edges, extent widened to fill the frame (`fitBBoxAspect`). Singular/plural counts.

## V22 — Web app 1.7 — 2026-10-31
- Council review (3 reviewers). Science: ichnotaxon evaluation no longer drops wrong predictions; folds and
  leave-one-out grouped by image section; interval classifier scored only on described intervals, with per-core
  spread and coverage; value maps use only real samples; gridding in km (equal-area), co-located cores merged,
  Cressie-weighted variogram, no extrapolation by default; resampling no longer bridges gaps; NB/kNN fixes;
  age-model reversals flagged.
- Usability: shortcuts only in Bioturbation, two-step confirmation for destructive actions, consistent
  terminology, getting-started cards, better tour, accessible tabs, Esc closes the start screen.
- UI/code: fixed blank right panel and clipped ichnotaxa list, WCAG AA contrast tokens, mobile overflow,
  non-overlapping saves, quota warning, lighter model storage, idle refit of comparison models.

## V21 — Web app 1.6 — 2026-10-31
- Data tab plots (Grapher-like): stratigraphic multi-panel logs and XY plots with secondary Y axis, log/inverted
  axes, six series types, curve fits (linear, polynomial, exponential, power, logarithmic, moving average) with
  equation and R², statistics, SVG/PNG/CSV export.

## V20 — Web app 1.4 — 2026-10-31
- Side panels no longer clip long labels; side tabs wrap.
- Maps: 7 gridding methods (inverse distance, nearest, linear triangulation, minimum curvature, RBF, ordinary
  kriging with fitted variogram, moving average), cell size, sea/land/both mask, convex-hull clip, contours,
  8 colour ramps with range and classes, colour bar, list of cores to include, projections (equirectangular,
  Mercator, Lambert azimuthal equal-area), larger/full-screen map, PNG export at 1800–7200 px.

## V19 — Web app 1.3 — 2026-10-31
- Training project with 7 synthetic Mediterranean cores and a synthetic core image with labelled traces
  (`tools/make_tutorial.py`), contextual help cards and a 25-step guided tour.

## V18 — Web app 1.2 — 2026-10-31
- “Models and training” dialog: beginner guide, choice of k-NN / Random Forest / naive Bayes with parameters,
  evaluation of 3 methods × 3 models on the same unseen traces with a recommendation and confusion matrix,
  gallery of training examples (exclude, remove, go to trace) and examples from other projects (add to library).

## V17 — Web app 1.1 — 2026-10-31
- Start screen tabs: Projects / All projects; multiproject analysis (ticked cores of several projects copied into
  an analysis project where Multiproxy, Data and Figures work; update from sources).
- Ichnotaxon suggestions from three stored k-NN models (core, project, all projects); probability of each
  ichnotaxon per model in the object panel.

## V16 — Web app 1.0 — 2026-10-31
- Renamed **CorAnTool** (Core Analysis Tool), formerly IchAnTool; old project files, browser data and the
  `ichantool` Python package keep working.
- Thesis project now holds all cores of the author's folder (GP14, LC21, LC01, LC05, LC06, LC12, LC14,
  LC20) and more foraminifera data (GP03 indices, LC21 planktonic isotopes); private build only.

## V15 — Web app 0.9 — 2026-10-31
- Map customisation: background (simple vector, physical, shaded relief, topographic, bathymetric,
  GEBCO bathymetry + topography, aerial photo, aerial photo + bathymetry), core symbol, size, colours,
  labels (size, colour, halo), land/sea colours, graticule, scale bar and north arrow.
- Map zoom: mouse wheel, drag to pan, double click, buttons and editable extent; saved with the project.

## V14 — Web app 0.8 — 2026-10-31
- Restructure: start screen with all projects, a table of all cores and a multiproject map; projects hold
  several cores (images/bioturbation, imported data, records, age model, intervals); project file v3
  (v1/v2 converted on open); IndexedDB v3 with a light index.
- Data tab: all data by origin (imported/created/computed), computed columns (formula parser, no eval),
  manual columns and a free spreadsheet (A1 cells, ranges, COL()).
- Map, multiproxy logs and core log in a synchronized read-only window or a floating panel.
- Figures: representative traces per ichnotaxon (manual or automatic choice), whole interpreted core,
  logs and maps, with title/caption, SVG and PNG.
- Thesis data become their own project.

## V13 — Web app 0.7.1 — 2026-10-31
- Selection tool: dragging draws a selection box (Shift/Ctrl adds); Shift/Ctrl+click toggles.
- Exclude/Include tools: rectangle shape (or Shift+drag).

## V12 — Web app 0.7 — 2026-10-31
- Multi-selection of traces (Ctrl+click, Shift+drag box, "select suggested as…", "select all unreviewed")
  and joint assignment/acceptance/deletion in one undo step.
- Assigning no longer jumps or zooms; "jump to next" is off by default and keeps the zoom.
- "Pick the setting that best separates traces and matrix" (Otsu separability η).
- Multiproxy: missing-value option (fill with the mean); how-to panel; the author's own thesis data
  (private, git-ignored, built by tools/make_thesis_dataset.py) used when present.

## V11 — Web app 0.6 — 2026-10-31
- Light/dark mode toggle.
- "Test automatic classification on this core" (trained on other cores, or out-of-block within the
  core), with Test/Match bands and optional class colouring behind the record curves.
- Interval ends outside a core's depth–age data are clamped instead of dropping the interval.
- Real thesis cores preloaded in Multiproxy (first version only): ODP 977A and 976 records from
  PANGAEA, and intervals from the thesis (ORL types, ichnological units, ORL 1 phases, sapropels).
- Development moves to the `master` branch.

## V10 — Web app 0.5 — 2026-10-31
- "Geochemistry" mode renamed "Multiproxy": any numeric record (geochemistry, foraminifera, TOC, sedimentology…).
- Interval layers (lithology, turbidites, metal migration zones, events…) with categories and
  parent/child hierarchy; import (wide or long tables), drawing, editing, CSV export; child intervals
  clipped to parent; warnings for intervals outside their parent.
- Interval layers enter the automatic interval classifier as 0/1 variables; any layer can be the target.
- Accept predictions as automatic intervals; confirm them to use them for training.
- V9 projects are converted (label list → "Events" layer). Demo gains synthetic lithology/turbidite intervals.

## V9 — Web app 0.4 — 2026-10-31
- New "Geochemistry" mode in the same projects: import many cores (long table, one file per core,
  catalogue), resampling to a common age/depth grid, ratios, log10, per-core or global z-scores.
- User-defined event labels; labelling by dragged intervals and by proxy-association rules.
- Configurable machine learning with in-app guidance: Random Forest, k-NN, Gaussian naive Bayes,
  k-means; seeded; leave-one-core-out validation, confusion matrix, balanced accuracy, MDI importance.
- Trained model classifies cores added later (scaling frozen at training).
- Maps by age window (dominant class or proxy value/anomaly, exploratory IDW), SVG/CSV export.
- The image core (bioturbation, BI, ii, ichnotaxa, external records) can join the analysis, and its
  geochemical classes are overlaid on the composite core log.
- Synthetic demo dataset (15 cores) and Natural Earth coastline.

## V8 — Web app 0.3 — 2026-10-31
- Enhancement presets from the literature: Dorador et al. (2014) Levels→Brightness/Contrast→
  Vibrance/Saturation (auto levels, auto gamma within the published range) and CLAHE
  (Miguez-Salas et al., 2019). Vibrance, CLAHE, auto levels/gamma controls.
- Detection: two-class k-means threshold and hole filling.
- User presets (enhancement + detection), shared across projects.
- Backups: persistent storage, automatic folder mirror (Chrome/Edge) with daily history,
  full backup download, multi-file restore.
- Fix: the generic "levels" preset is no longer attributed to Dorador & Rodríguez-Tovar (2014).

## V7 — Web app 0.2 — 2026-10-31
- Project library in the browser (IndexedDB) with autosave; import/export project files (format v2).
- Core log view: all sections on a depth or age axis, interval window, image resampled to the axis,
  total and per-ichnotaxon bioturbation, BI/ii, manual indices, external records (CSV/TXT/Excel);
  SVG and CSV export.
- Working resolution on import (box-average downsampling).
- Test core: IODP 397-U1385I-1H images (50 px/cm), colour reflectance and magnetic susceptibility.

## V6 — Standalone app file — 2026-10-30
- `tools/build_standalone.py` builds `dist/IchAnTool.html`: the whole web app plus example in one
  file that opens by double-click, offline, without a server. Analysis unchanged.

## V5 — Documentation — 2026-10-30
- Technical reference of all algorithms (`docs/DOCUMENTACION_TECNICA.md`), version history
  (`docs/HISTORIAL_VERSIONES.md`), methods and reviewer-defence notes per paper
  (`publications/METODOS_Y_DEFENSA.md`), documentation rules (`CLAUDE.md`, `CONTRIBUTING.md`).

## V4 — Web app 0.1 — 2026-10-30
- New browser application in `app/`: sections with depths and age model, analysis area, image
  enhancement, automatic detection, wand/brush/lasso/eraser/exclusion tools, ichnotaxon labelling
  with incremental learning, synced depth profile, BI/ii automatic and manual, CSV/PNG/JSON export,
  project save/load, Spanish/English interface.
- Reproduces published v2.1 indices on the example image.

## V3 — Python package 3.0.0.dev0 — 2026-10-30
- Rewritten as an installable Python package (`src/ichantool`) with CLI and API.
- Vectorised analysis; PNG/TIFF/JPEG; grayscale and RGB input.
- Multi-class (per-ichnotaxon) percentages from colour-coded images.
- Configurable index schemes; depth -> age conversion; CSV/Excel export.
- Fixes from v2.1: the last data block is no longer dropped; grayscale images no longer crash.
- Results reproduce v2.1 exactly (regression test).
- Original code moved to `legacy/`.

## V1–V2 — 2019 (GUI, then console 2.1) — 2019-10-25
- Console script used in Casanova-Arenillas et al. (2020) and tkinter GUI with auxiliary tools.
