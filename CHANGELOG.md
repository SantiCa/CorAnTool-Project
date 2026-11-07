# Changelog

All notable changes to SedCoreTool are listed here, newest first.

**Versioning.** Each delivery has a number `V0.<n>`, shown in the program and used as the version `0.<n>.0` of the
program, the Python package and the desktop installers. Version 1.0 will be released when the program is considered
complete. Before 5 November 2026, development builds were numbered V1–V33; V33 became V0.1.

Technical details of every method are in [docs/TECHNICAL_DOCUMENTATION.md](docs/TECHNICAL_DOCUMENTATION.md).

---

## V0.69 — 2026-11-07
- Depth scale of the core column and of the figures: besides the numbered ticks, the long and the short ticks there is now
  a medium tick, each level with its own interval and its own length, so a ruler-style scale is possible (for example
  short every 1, medium every 5, long and number every 10). The same form is used in the column panel and in the figures.
- The section figure now respects the length of the numbered ticks.

## V0.68 — 2026-11-07
- Section figure: intervals without data now show the chosen fill (hatched or solid) over the image, not just the "No data"
  text on a blank background.

## V0.67 — 2026-11-07
- The save indicator no longer says just "Saved" when no backup folder is chosen: it reads "Saved on this computer · no folder
  backup" (or "folder backup pending" when the folder needs permission again) in the warning colour, and "Saved" only
  once the automatic folder backup is active.

## V0.66 — 2026-11-07
- No visible change: the multiproxy tool (records, layers, classifiers, maps) moves out of `app.js` into its own file.

## V0.65 — 2026-11-07
- No visible change: the composite log, the side panels and the Data tab move out of `app.js` into their own files.

## V0.64 — 2026-11-07
- No visible change: the interface code is split into smaller files (shared state and the figures panel now have
  their own modules), a first step towards dividing `app.js`.

## V0.63 — 2026-11-07
- Security: the build tool electron-builder pulled `minimatch` 9.0.9 and 10.2.6 (Dependabot alert #64, pattern
  amplification when parsing glob patterns). `desktop/package.json` now forces `minimatch` 11.0.1 for those two
  branches (`overrides`); `npm audit` reports 0 vulnerabilities and the Linux installers still build. The alert only
  affected the build tooling, not the installed program.

## V0.62 — 2026-11-07
- Column headers stay visible while scrolling in the data tables, the spreadsheet view, the results and comparison tables.

## V0.61 — 2026-11-07
- Release notes brought up to date; `tools/sync_version.py` now also writes the version into
  `desktop/RELEASE_NOTES.md` and `--check` fails if it differs, so a release can no longer carry old file names.

## V0.60 — 2026-11-07
- Python package: exclusion layer (`exclude=` in `analyze_mask`, `--exclude` image or `--exclude-value` on the command
  line); intervals with too few valid pixels have no data (`min_valid`, 20 % as in the program). Percentages are now
  computed as the ratio of sums, as in the program (identical results without exclusions).
- New `sedcoretool batch` and `sedcoretool manifest`: analyse many section images and several cores from one CSV
  manifest; sections are joined by depth with gaps kept and a choice for overlaps (keep, upper, error).
- LAS 2.0 export (`-o file.las`, `export.to_las`), one file per core.
- `--bin-cm` on the command line; output tables gain `depth_top`, `depth_bottom` and `valid_pct`; BI and ii are empty
  (not −1) where there is no data.

## V0.59 — 2026-11-07
- Text, subtitle and background colours can also be changed in the multiproxy map and the location map; the
  sections figure, the trace gallery and figure titles and captions follow the core-column colours.
- Colours stored in a project are checked before drawing; invalid values fall back to the defaults.
- `sedcoretool unet prepare --overwrite` replaces a previous dataset; other non-empty folders are still refused.

## V0.58 — 2026-11-07
- Reserving cores for the final test now excludes only the library and other-project examples that may come from
  them (same core identifier or name, or identical trace descriptors), and shows how many were excluded.
- Age models: repeated identical rows are merged; a depth with two different ages is reported by depth; an
  incomplete age range is ignored with a warning instead of rejecting the whole model.

## V0.57 — 2026-11-07
- When the desktop program cannot save on closing, a dialog offers to retry, export the project or close without
  saving, instead of silently refusing to close.
- Repository links point to the renamed repository `SantiCa/SedCoreTool`.

## V0.56 — 2026-11-07
- Customise figure colours for core columns, ichnotaxon distributions and multiproxy columns, or restore defaults.
- Show or hide hand-placed identification marks in core columns and whole-core figures without deleting them.
- Legends of the core column and whole-core figure list only the ichnotaxa present in the displayed interval.

## V0.55 — 2026-11-07
- Keep the desktop window open when saving fails, including when a save is already in progress.
- Reject duplicate age depths and invalid named age ranges; blank age cells are ignored instead of read as zero.
- Prevent U-Net preparation from mixing existing tiles and reject overlapping validation and test core lists.
- Exclude external ichnotaxon examples while cores are reserved and retain source keys in exported models.
- Fit multiproxy scaling and missing-value imputation on training samples only, and exclude reserved cores from k-means fitting.

## V0.54 — 2026-11-07
- Documentation reorganised for public readers: everything in English, no duplicated content, one guide for
  contributors and AI coding assistants (`AGENTS.md`, also read by Claude through `CLAUDE.md`), and this changelog as
  the single version history. The software paper moved to `paper/`; internal planning notes left the repository.

## V0.53 — 2026-11-07
- Technical documentation rewritten in English for any reader (`docs/TECHNICAL_DOCUMENTATION.md`): organised by the
  program and the Python package, describing current behaviour, with the full Python API and command line.
- README explains which part — the program or the Python package — each user needs.

## V0.52 — 2026-11-07
- Renamed **SedCoreTool** (formerly CorAnTool and IchAnTool). The Python package and command are now `sedcoretool`;
  `ichantool` keeps working as a deprecated alias.
- Shareable project packages use the extension `.sedcoretool`; `.corantool` packages and projects saved under older
  names still open. Saved data are kept: browser storage, the IndexedDB database and the desktop data folder are
  reused.
- `.zenodo.json` describes the software and links it to the archive of version 2.1 (Zenodo 3518837).

## V0.51 — 2026-11-07
- Ichnotaxa distribution figure: choose the ichnotaxa shown and the column width; abundance as symmetric (kite)
  curves, with or without symbols.
- Horizontal orientation for every figure except maps.
- Excluded zones can be hidden in every figure that shows core images.

## V0.50 — 2026-11-07
- Installers and the offline file carry no sample data, only the public-domain Natural Earth coastline; example
  buttons appear only when the program runs from a copy of the repository.

## V0.49 — 2026-11-07
- Final test on reserved cores: reserved cores never train nor take part in model selection (ichnotaxa and
  multiproxy); a logged final test reports accuracy, balanced accuracy and the confusion matrix.
- Automatic comparison with version 2.1: exact with the same mask (unit test) and within 0.6 percentage points with
  the browser's JPEG decoder (end-to-end test); the small difference was traced to the decoder, not the method.

## V0.48 — 2026-11-07
- Desktop builds run an Electron start/close/restart test before packaging, with optional checks of the vision model
  and map backgrounds.
- Manual builds can prepare an unpublished release draft with the five installers, the offline file, a manifest and
  SHA-256 checksums.

## V0.47 — 2026-11-06
- Electron 45.2.1 and electron-builder 26.18.0. macOS 13 or later is now required.

## V0.46 — 2026-11-06
- Continuous-integration workflow maintenance; component versions synchronised.

## V0.45 — 2026-11-06
- SheetJS updated to the official 0.20.3 build with its licence (fixes CVE-2023-30533 and CVE-2024-22363), with an
  SRI-checked online fallback.
- The DINOv2 vision model is pinned to a verified Hugging Face commit and SHA-256.

## V0.44 — 2026-11-06
- Projects are saved section by section: only changed sections are rewritten (IndexedDB version 5).
- Faster trace deletion; enhancement computed in the background when a section is opened.
- Exported tables and record import moved to a tested module (`exportio.js`).

## V0.43 — 2026-11-06
- New figure: core location map with base layers (blank, vector, Esri imagery), zoom and pan, WGS 84 / Web Mercator /
  UTM, graticule or metric grid, coordinates on any side in DD, DMS or metres, scale bar and north arrow (with UTM
  convergence), and SVG/PNG/JPEG output.

## V0.42 — 2026-11-06
- Editing algorithms (scissors, merge, undo, project migration) moved to a tested pure module (`edit.js`).
- End-to-end test in headless Chrome (open, detect, delete and undo, save, reload, compare) in continuous
  integration.

## V0.41 — 2026-11-06
- Performance: enhancement and detection run in a background worker; images are reduced directly to their output size;
  a separate memory budget for undo; kriging solves one linear system per map (O(n) per cell).

## V0.40 — 2026-11-06
- Single version number across the program, the Python package and the installers, checked by a test.
- Continuous integration on Windows, macOS and Linux with coverage, linters (ruff, ESLint) and the offline build;
  release script; Content-Security-Policy and SRI; security policy, code of conduct, issue and pull-request
  templates, and third-party notices.

## V0.39 — 2026-11-06
- Accessibility (WCAG 2.1 AA): accessible names for all sliders, keyboard-operable tabs, live status regions,
  optional single-key shortcuts, AA colour contrast in both themes, larger touch targets.

## V0.38 — 2026-11-06
- Table import handles quoted fields, thousands separators and Windows-1252 files, and reports cells read as empty.
- Consent before map backgrounds send the study area to Esri or GEBCO.
- The SHA-256 of the vision model is stored in the project.
- The automatic folder copy covers every modified project, retries on failure and warns when it is out of date.

## V0.37 — 2026-11-06
- Age model: decimal commas, columns chosen by header, warning for pasted Bacon tables.
- Ichnotaxa evaluation always leaves whole sections (or cores) out and reports the validation scheme.
- Multiproxy classifiers exclude the parent and child layers of the target, rescale per fold and leave a gap between
  validation blocks.
- Automatic choice of enhancement without identified traces uses a contrast-invariant, spatially coherent criterion.
- Corrected variogram weighting reference.

## V0.36 — 2026-11-06
- Safer data: project format 5; files from newer versions open read-only; masks validated on import and opening; a
  failed load saves nothing; pending changes saved when the page is hidden or closed.
- Provenance header (version, settings) in every exported CSV.
- Replacing a project on import keeps the local copy; rotated daily backup history; storage quota warning;
  uncaught errors shown to the user.

## V0.35 — 2026-11-06
- The Data tab is a spreadsheet: values can be edited (flagged, with original value and date, restorable and listed in
  the CSV); computed columns with interpolation between records measured at different depths; manual columns.

## V0.34 — 2026-11-06
- Multiproxy: colour records by one or several interval layers.
- Intervals of a layer never overlap within a core; touching intervals of the same class are joined.

## V0.33 — 2026-11-06
- All charts: reorder and hide columns without deleting data.

## V0.32 — 2026-11-06
- Ichnotaxa distribution figure: one symbol per identified trace or hand-placed mark, with its own depth or age axis.

## V0.31 — 2026-11-05
- Charts: choose which ichnotaxa are drawn, stacked or each in its own column with its own scale.

## V0.30 — 2026-11-05
- Traces overlap only when their ichnotaxa differ; the brush extends a trace of the active ichnotaxon.

## V0.29 — 2026-11-05
- Overlapping traces enabled by default (remembered, key S).

## V0.28 — 2026-11-05
- Age model with an age range; import of Bacon (rbacon) `*_ages.txt` tables; `age_min`/`age_max` in the CSV and an
  age-uncertainty track.
- Automatic choice of enhancement measures how well identified traces separate from the matrix, and also tries each
  colour channel.

## V0.27 — 2026-11-05
- Interface review: one-row top bar, bundled IBM Plex fonts, collapsible sections, two-line column titles,
  colour-blind-safe record palette, navigation strip next to the depth ruler.

## V0.26 — 2026-11-05
- Layout: only panels scroll; panel widths adapt to the screen; status bar always visible.
- Navigation strip to move through a section; Show all, Page Up/Down, Home/End.

## V0.25 — 2026-11-05
- Every figure with a core image: width, several versions side by side, and excluded zones shown or hidden.

## V0.24 — 2026-11-05
- Bioturbation side column: each track has its own width and can be hidden.

## V0.23 — 2026-11-05
- Core column: image panels side by side (original, enhanced, traces, arrows…) with true photo proportions.
- Configurable NO DATA style; trace symbol size and border; arrow options.

## V0.22 — 2026-11-05
- Vertical axes with numbered, long and short ticks, each with its own interval and length; editable scales in
  Multiproxy.

## V0.21 — 2026-11-05
- Bioturbation side column: adjustable width, fixed horizontal scales and records from the Data tab.

## V0.20 — 2026-11-05
- Overlapping traces: total bioturbation counts an overlap once, while each ichnotaxon keeps its full area. The Python
  package accepts one mask layer per class.
- Scissors tool to split a trace; Merge for several selected traces.

## V0.19 — 2026-11-05
- Hover help on almost every control (Spanish and English), which can be turned off.

## V0.18 — 2026-11-05
- Desktop program: own application icon.

## V0.17 — 2026-11-05
- Desktop program: train a U-Net on the computer's GPU (one-time training module, validation and test cores,
  progress, stop and resume).
- Ichnotaxa: optional features from a pre-trained vision model (DINOv2) instead of the 12 shape descriptors.

## V0.16 — 2026-11-05
- Documentation of the U-Net training protocol.

## V0.15 — 2026-11-05
- Learned segmentation (U-Net): training-data export from the program; a detection method that runs a trained ONNX
  model (probability threshold, uncertain zones); Python `unet` commands (prepare with split by core, train, evaluate
  on whole images of independent cores, predict) with identical tiling rules in Python and JavaScript.

## V0.14 — 2026-11-05
- TIFF and spreadsheet libraries bundled, so the program works offline; new README.

## V0.13 — 2026-11-05
- Drawing errors are reported with their own message.

## V0.12 — 2026-11-05
- Symbols by default in the ichnotaxa distribution figure (bars optional); one symbol shape per ichnotaxon, shared
  with marks and legends.

## V0.11 — 2026-11-05
- Shared vertical units and ticks across the core column and figures; logarithmic and explicit horizontal axes.
- Editable label text and positions, saved with the project and included in exports.

## V0.10 — 2026-11-05
- List of selected traces; browse all traces of the current image.

## V0.9 — 2026-11-05
- Interface fix in the ichnotaxa list.

## V0.8 — 2026-11-05
- Shareable project package (ZIP) with full-resolution images; automatic copy as project folders (for example in a
  shared Drive folder) and Open project folder; replace-or-copy when the same project is opened again.
- Comments with author, date and replies, linked to a point of a section.

## V0.7 — 2026-11-05
- Representative-traces figure: several versions of each trace side by side and a configurable scale.

## V0.6 — 2026-11-05
- Width and axis format of each column next to the core.

## V0.5 — 2026-11-05
- Style options for the column and its figure; marker styles and label handling in the sections figure.

## V0.4 — 2026-11-05
- Intervals with too few valid pixels (default < 20 %) have no data instead of 0, shown as NO DATA.

## V0.3 — 2026-11-05
- Identification marks can be shown together with quantified tracks.

## V0.2 — 2026-11-05
- Images are added to a core chosen in a dialog; ichnotaxa can be hidden while interpreting.
- Depth window and track selection for all figures; faster row counts and predictions.

## V0.1 — 2026-11-05
- Original images stored once on disk; pixels loaded only for the sections in use.
- Per-section working resolution can be changed later; cropping without re-encoding.
- Analysis interval set in centimetres, with the same rule in the program and the Python package (`bin_cm`).

---

## Development builds (V1–V33)

### V32–V33 — 2026-11-05
- Identification mode (presence of ichnotaxa without quantification), ichnotaxa legends and abbreviations, core
  sections figure and ichnotaxa distribution figure.
- Image cropping with depth recalculation; draggable Start/End markers of the analysis area; clean start without
  preloaded projects.
- Desktop program (Electron) for Windows, macOS and Linux, built and published by GitHub Actions.

### V26–V31 — 2026-11-01 to 2026-11-05
- Multiproxy rebuilt around interval layers and user-defined classifiers; neural network (multilayer perceptron);
  models look up their inputs by name.
- Training progress without freezing the page; version number shown in the program and stored in projects.

### V20–V25 — 2026-10-31
- Maps: seven gridding methods (inverse distance, nearest neighbour, triangulation, minimum curvature, radial basis
  functions, ordinary kriging, moving average), contours, colour scales and projections.
- Data-tab plots: stratigraphic logs and XY plots with fits and statistics.
- Scientific review: grouped validation, interval classifiers scored only on described intervals, maps from real
  samples only, distances in km, no extrapolation by default.
- Generic start screen; cores shared between projects counted once; resizable panels and maps; cross-project
  analyses; reading cursor on logs.

### V14–V19 — 2026-10-31
- Projects with several cores, a Data tab with computed columns and a free sheet, figures, secondary windows.
- Three ichnotaxa models (core, project, all projects); Models and training dialog with k-NN, Random Forest and naive
  Bayes and their evaluation.
- Renamed CorAnTool. Training project with synthetic data and a guided tour.

### V7–V13 — 2026-10-31
- Project library with autosave; core column with external records; working resolution on import.
- Enhancement presets from the literature (Dorador et al., 2014; Miguez-Salas et al., 2019), k-means threshold, hole
  filling, user presets and backups.
- Multiproxy mode: resampling, ratios, z-scores, labels and rules, Random Forest, k-NN, naive Bayes, k-means,
  leave-one-core-out validation, maps by age window; interval layers with hierarchy.
- Multi-selection of traces; light and dark themes.

### V3–V6 — 2026-10-30
- Rewritten as an installable Python package with command line and API: vectorised analysis, PNG/TIFF/JPEG, grey and
  RGB input, per-ichnotaxon percentages from colour-coded images, configurable index schemes, age model, CSV and Excel
  export. Fixes from version 2.1: the last interval is kept; greyscale images no longer fail. Results reproduce
  version 2.1 exactly (regression test). Original code kept in `legacy/`.
- New browser application: depth scale and age model, analysis area, enhancement, automatic detection, editing tools
  and exclusion layer, ichnotaxa labelling with incremental learning, automatic and manual BI and ii, Spanish and
  English interface.
- Offline single-file build; technical documentation.

### V1–V2 — 2019
- IchAnTool 2.1: console script and graphical interface that compute bioturbation percentage and BI/ii from core
  images with bioturbation painted in black.
