# Contributing

Contributions from ichnologists, sedimentologists and developers are welcome. Please follow the
[code of conduct](CODE_OF_CONDUCT.md); report security problems privately ([SECURITY.md](SECURITY.md)).

## Before you start
Open an issue describing the bug or feature (sample images help a lot). Never attach unpublished data.

## Set-up
- **Web app** (`app/`, ES modules, no build step): serve the repository (`python3 -m http.server`) and open
  `http://localhost:8000/app/`. Tests: `npm test` (Node ≥ 22). Lint: `npx eslint@9 app/js tests/app`.
- **Python package** (`src/sedcoretool/`): `pip install -e ".[dev]"`, tests `pytest`, lint `ruff check src tests tools`.
- **Desktop** (`desktop/`, Electron): `npm ci && npm start`; `npm run dist` builds for the current system.
- **Offline single file**: `python3 tools/build_standalone.py` → `dist/SedCoreTool_V0.<n>.html`.

## Rules
1. Work on a branch and open a pull request; the CI (`tests`) must pass.
2. Pure modules (`core.js`, `edit.js`, `imageproc.js`, `learn.js`, `log.js`, `zip.js`, `geo.js`, `interp.js`, `plot.js`,
   `sheet.js`) stay DOM-free and tested. New modules go in `tools/build_standalone.py` (`ORDER`) and their top-level
   names must not clash with other modules.
3. Analysis definitions (binning, indices, depth/age mapping) stay identical in Python and JS; the regression test
   against `legacy/v2.1_console/example_output.csv` must keep passing. Never modify `legacy/`.
4. Each delivery has a number `V0.<n>`: set `DELIVERY` in `app/js/app.js`, run `python3 tools/sync_version.py`
   (writes `0.<n>.0` to the Python package, `CITATION.cff` and the desktop program), and document it in
   `docs/HISTORIAL_VERSIONES.md`, `docs/TECHNICAL_DOCUMENTATION.md` (if an algorithm, default or format changes),
   `publications/METODOS_Y_DEFENSA.md` (if it changes what a paper can claim) and `CHANGELOG.md`.
5. Releases: `tools/release.sh` tags the delivery; GitHub Actions builds the desktop programs and the Release.

New segmentation methods must return `(mask, class_names)` where `mask` is a 2-D integer array
(0 = matrix), so they plug into `analyze_mask` unchanged.
