# Changelog

Delivery numbers and full details: [docs/HISTORIAL_VERSIONES.md](docs/HISTORIAL_VERSIONES.md).

## V0.44 — 2026-11-06
- Saving by sections (only changed sections are rewritten; IndexedDB v5), trace deletion limited to the traces' rectangles, enhancement on opening a section in the worker, exports and record import moved to the tested module `exportio.js`, and no inline styles left in `index.html`.

## V0.43 — 2026-11-06
- New figure: core location map with base layers (blank, vector, Esri satellite/topographic/relief/physical/streets/ocean), editable extent with zoom and pan, WGS 84 / Web Mercator / UTM (zone and hemisphere) projections, graticule or metric grid, coordinates on any chosen sides in DD, DMS or metres, positionable scale bar and north arrow (UTM convergence), and SVG/PNG/JPEG output.

## V0.42 — 2026-11-06
- Tests (audit §3): editing algorithms (scissors, merge, same-ichnotaxon grouping, undo, project migration) moved to the pure module `edit.js` and tested with synthetic overlapping masks; end-to-end headless-Chrome test (open, detect, delete/undo, save, reload, compare) in CI (`npm run e2e`).

## V0.41 — 2026-11-06
- Performance (audit §4): enhancement and detection run in a Web Worker; side column and figure pictures are reduced straight to output size (no full-resolution canvases per stroke); reused morphology buffers; overlap stacks compacted on save; memory budget counts U-Net maps and cached canvases, undo has its own budget; cached side-column series; kriging solves one system (O(n) per cell).

## V0.40 — 2026-11-06
- Engineering (audit §7): single version source (0.40.0 everywhere, checked by a test), desktop licence GPL-3.0-or-later, `tools/release.sh`, CI on Windows/macOS/Linux with coverage, linters (ruff, ESLint) and the offline build, Dependabot, Content-Security-Policy and SRI for CDN fallbacks, SECURITY, code of conduct, issue/PR templates and third-party notices.

## V0.39 — 2026-11-06
- Accessibility (audit §5): accessible names for all sliders, ARIA tab pattern with arrow keys, live regions for toasts and save/detection status, tooltips no longer override visible names, option to turn off single-key shortcuts, AA colour contrast in both themes, translated labels, duplicate CSS rules merged, larger touch targets.

## V0.38 — 2026-11-06
- Import, backups and privacy (audit §6): CSV reader handles quotes, thousands separators and Windows-1252 files and reports cells read as empty; consent before map backgrounds send the study area to Esri/GEBCO; SHA-256 of the vision model stored in the project; automatic folder copy covers every modified project, retries and warns when stale; `tools/update_vendor.sh` to move SheetJS to 0.20.3 (CDN fallback already 0.20.3).

## V0.37 — 2026-11-06
- Science fixes (audit §2): age model reads decimal commas and header columns, warns on pasted Bacon tables; ichnotaxon evaluation always leaves whole sections (or cores) out, reports the scheme and flags accuracy as optimistic; multiproxy classifiers exclude parent/child families of the target, refit global scaling per fold and leave a gap between blocks; enhancement ranking without traces uses Fisher × spatial coherence and falls back to no enhancement; unused idwGrid removed; variogram citation fixed.

## V0.36 — 2026-11-06
- Safer data (audit §1): project format 5, newer files open read-only; RLE masks validated on import/open; a failed load saves nothing; pending changes saved on page hide/close; provenance header in every CSV; replacing on import keeps the local copy; daily backup history rotated; storage quota warning; uncaught errors shown; one-step undo after class merges. Fixed an empty project with no id being saved on first start.

## V0.35 — 2026-11-06
- Data is now a spreadsheet: every value can be edited (with a warning); edited cells are flagged, keep the original and date, can be restored and are listed in the CSV. Computed columns from formulas (with linear interpolation between records measured at different depths) and manual columns are added inline.

## V0.34 — 2026-11-06
- Multiproxy: colour records by the chosen family or several (blended or one strip each).
- Intervals of one family never overlap within a core; touching or overlapping intervals of the same class are joined.

## V0.33 — 2026-11-06
- Every chart: reorder columns (drag or arrows) and hide them without deleting data; interval families can be hidden from the charts.

## V0.32 — 2026-11-06
- Ichnotaxa distribution figure: one symbol per identified trace or hand-placed mark at its own depth or age; its own depth/age axis; choose traces, marks or both (hollow symbols for marks).

## V0.31 — 2026-11-05
- Charts: choose which ichnotaxa are drawn and show them stacked or each in its own column with its own scale.

## V0.30 — 2026-11-05
- Traces overlap only when their ichnotaxa differ; same-ichnotaxon overlaps give way to the new trace or are merged when a class change creates them; the brush extends a trace of the active ichnotaxon.

## V0.29 — 2026-11-05
- «Overlap traces» is on by default (remembered, key S), shown as a highlighted toggle, with a hint when a new trace replaces part of another.

## V0.28 — 2026-11-05
- Age model with an age range; imports the Bacon (rbacon) *_ages.txt table with median or mean; age_min/age_max in the CSV and an age-uncertainty track.
- «Pick the setting that best separates traces and matrix» now measures the separation of your identified traces from the matrix (or a contrast-invariant local criterion without them) and also tries each colour channel.

## V0.27 — 2026-11-05
- Interface review: one-row top bar, bundled IBM Plex fonts (same look offline), sentence-case panel sections, Core column in collapsible sections, option groups as toggle chips, blank-sheet empty figure, two-line column titles, colour-blind-safe record palette.
- Navigation strip moved to the left of the depth ruler, with its own small ruler.

## V0.26 — 2026-11-05
- Layout: the page no longer scrolls (only the panels), panel widths adapt to the screen, status bar always visible.
- Navigation: overview strip to click or drag through the section, «Show all», Page Up/Down and Home/End.

## V0.25 — 2026-11-05
- Every figure with a core image: width, several versions side by side, and show or hide excluded zones (Core figure and Multiproxy added).

## V0.24 — 2026-11-05
- Bioturbation side column: each track (bioturbation, BI, ii, records) has its own width (drag its edge in the header or type it) and can be hidden.

## V0.23 — 2026-11-05
- Core column: image panels side by side (original, enhanced, traces, traces only, arrows…), true photo proportions by default with a horizontal factor.
- NO DATA style (show, fill, colours, text, over images); trace symbol size and border; arrows from hand-placed marks only, excluded groups, label style.

## V0.22 — 2026-11-05
- Vertical axes: numbered ticks, long ticks and short ticks with their own interval and length (Core column, Figures, Multiproxy). Multiproxy logs get their own editable scales.

## V0.21 — 2026-11-05
- Bioturbation side column: drag its edge to change the width, fixed horizontal scales on top, and records from Data as extra tracks.

## V0.20 — 2026-11-05
- Traces may overlap without limit: total bioturbation counts the overlap once; each ichnotaxon keeps its full area, so taxon percentages may add up to more than the total. «Overlap» option for brush, wand and lasso; the Python package accepts per-class mask layers.
- Scissors tool (C) to split a trace along a drawn line; «Merge» for several selected traces.

## V0.19 — 2026-11-05
- Interface: hover help on almost every button, slider, checkbox and menu (Spanish/English), can be switched off in Help; tips-box buttons no longer show internal action names as tooltips.

## V0.18 — 2026-11-05
- Desktop: own application icon (desktop/build/icon.png was git-ignored, so builds showed the default Electron icon); Electron 42 verified after Dependabot PR #11.

## V0.17 — 2026-11-05
- Desktop: train the U-Net from the program on the computer's GPU (one-time training module, cores marked validation/test, progress, stop and resume, trained-model list).
- Ichnotaxa: optional DINOv2 vision-model embeddings as classifier input instead of the 12 shape descriptors.
- Plain-language guide to the machine learning (publications/GUIA_APRENDIZAJE_AUTOMATICO.md); papers 1 and 2 updated.

## V0.16 — 2026-11-05
- Paper 2 draft: U-Net training protocol and experiments (§3.5).

## V0.15 — 2026-11-05
- U-Net segmentation: training-data export from the app (images, masks with an ignore value, manifest); new detection method running a trained ONNX model in the app (probability threshold, doubtful zones); Python `ichantool.unet` (prepare with split by core, train, evaluate on whole images of independent cores, predict) with identical tiling rules in Python and JS. Draft of paper 2 updated.

## V0.14 — 2026-11-05
- Audit (docs/AUDITORIA.md); private data references removed; TIFF and Excel libraries bundled (work offline); new README with purpose and usage.

## V0.13 — 2026-11-05
- Review of V0.9–V0.12; drawing errors other than invalid axes are now shown with their own message.

## V0.12 — 2026-11-05
- Show symbols by default in ichnotaxon distribution figures; retain optional abundance bars or both.
- Choose a symbol per ichnotaxon, shared with identification marks and core-column legends; save it in projects and exports.

## V0.11 — 2026-11-05
- Share vertical units and tick spacing across column, core, section and distribution figures.
- Enable logarithmic horizontal axes, explicit bounds and linear tick steps; clip data per track and break logarithmic curves at nonpositive values.
- Edit SVG label text and positions, drag labels and reset individual edits; save adjustments with the project and include them in exports.

## V0.10 — 2026-11-05
- List selected traces and center them; browse and select all traces in the current image when none is selected.

## V0.9 — 2026-11-05
- Align the ichnotaxon delete button with its row.

## V0.8 — 2026-11-05
- Shareable project package (.corantool, ZIP) with full-resolution images; automatic copy as project folders (e.g. shared Drive) and "Open project folder"; replace-or-copy when the same project is opened again.
- Comments with author, date, replies, resolve and delete; linked to a section and point of the image.

## V0.7 — 2026-11-05
- Traces figure: several versions of each trace side by side (treated, original, trace only, silhouette, outline…) and configurable scale (bar, divided bar, line, none; position, length, colours).

## V0.6 — 2026-11-05
- Width and axis format (min, max, divisions, decimals, invert, log for records) of each column at the right of the core.

## V0.5 — 2026-11-05
- Column and column-figure style: axis units, ticks/divisions, % divisions, font size, bioturbation shape and colours, column titles, frames, grid, section boundaries, title.
- Section figure markers: arrow+label, arrow, triangles, circle, square, star, cross; symbol legend; handling of touching labels (keep, shift, merge, hide).

## V0.4 — 2026-11-05
- Intervals with too few valid pixels (default < 20 %, adjustable) have no data instead of 0; shown as NO DATA in the column; option to widen no-data zones.

## V0.3 — 2026-11-05
- Column and figures can show identification marks together with quantified tracks (bioturbation, ichnotaxa, BI, ii).

## V0.2 — 2026-11-05
- Desktop: imported projects are saved again (images stored as bytes); import errors are reported.
- Images can only be added inside a project and to a core chosen in a dialog.
- Hide ichnotaxa in the image while interpreting (per class, "show active only", "show all").
- Figures: depth window for all figures; column figure with selectable tracks and records, core width and "keep proportion"; same option for section panels.
- Faster: cached row counts, packed masks and classifier; predictions only for new or changed objects.

## V0.1 (formerly V33) — App 2.3 — 2026-11-05
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
- Clean start (no preloaded projects; private data only on demand where its private data exist; offline build excludes it).
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
  empty state; examples in a collapsible section; no dedicated private data entry.
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
- Private-data project now holds all cores of the author's folder (GP14, LC21, LC01, LC05, LC06, LC12, LC14,
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
- Private data become their own project.

## V13 — Web app 0.7.1 — 2026-10-31
- Selection tool: dragging draws a selection box (Shift/Ctrl adds); Shift/Ctrl+click toggles.
- Exclude/Include tools: rectangle shape (or Shift+drag).

## V12 — Web app 0.7 — 2026-10-31
- Multi-selection of traces (Ctrl+click, Shift+drag box, "select suggested as…", "select all unreviewed")
  and joint assignment/acceptance/deletion in one undo step.
- Assigning no longer jumps or zooms; "jump to next" is off by default and keeps the zoom.
- "Pick the setting that best separates traces and matrix" (Otsu separability η).
- Multiproxy: missing-value option (fill with the mean); how-to panel; the author's private data
  (private, git-ignored, built by un script privado (retirado)) used when present.

## V11 — Web app 0.6 — 2026-10-31
- Light/dark mode toggle.
- "Test automatic classification on this core" (trained on other cores, or out-of-block within the
  core), with Test/Match bands and optional class colouring behind the record curves.
- Interval ends outside a core's depth–age data are clamped instead of dropping the interval.
- Real private test cores preloaded in Multiproxy (first version only): ODP 977A and 976 records from
  PANGAEA, and published intervals (ORL types, ichnological units, ORL 1 phases, sapropels).
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
