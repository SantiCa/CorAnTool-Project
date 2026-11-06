# SedCoreTool (formerly CorAnTool and IchAnTool) — project rules

Owner: Santiago Casanova-Arenillas. Communicate in Spanish.

## Documentation is part of every change
Every delivery that changes code, algorithms, defaults or files must, in the same commit:
1. Get the next delivery number **V0.<n>** (see `docs/HISTORIAL_VERSIONES.md`; last: V0.14) and mention it in the reply. Since 05-11-2026 the numbering is V0.<n> (V33 = V0.1); V1 is reserved for when Santiago declares the program fully functional. Below, `V0.<n>` means this number.
2. Add a `V0.<n>` section to `docs/HISTORIAL_VERSIONES.md` (Qué se hizo / Cambios / Por qué / Comprobación / Pendiente) and a row in its summary table.
3. Update `docs/DOCUMENTACION_TECNICA.md` if any algorithm, formula, default value, file format or validation result changes. Formulas there must match the code exactly.
4. Update `publications/METODOS_Y_DEFENSA.md` if the change affects what a paper can claim.
5. Add a short English entry to `CHANGELOG.md`.
6. Set `DELIVERY` in `app/js/app.js` to the new V<n> (shown in the app; used for the offline file name `dist/SedCoreTool_V<n>.html` and the desktop version) and run `python3 tools/sync_version.py` (writes 0.<n>.0 to pyproject, `__init__.py`, CITATION.cff and desktop/package.json; a test checks it).
7. To publish desktop downloads, run `tools/release.sh` (checks, then pushes the tag `V0.<n>`; GitHub Actions builds Windows/macOS/Linux and creates the Release).

## Handoff
- Shared Claude/Codex workflow and current editing turn: read `docs/COORDINACION_IA.md` before editing. Only one editor at a time in the shared checkout; other chats review read-only. Do not start old pending tasks without a concrete request.
- Current state, how to run and pending work: `docs/TRASPASO_CLAUDE_CODE.md`.

## Desktop
- `desktop/` (Electron) packages `app/` and only the Natural Earth coastline (no sample data in any download since V0.50). `npm start` to try it, `npm run dist` to build for the current OS.

## Git
- Work on `master` (the main branch); commit each delivery there.

## Code
- Python package: `src/sedcoretool/` (compatibility alias `src/ichantool/`) — tests `pytest`.
- Web app: `app/` (no build step, ES modules) — pure modules `core.js`, `edit.js`, `imageproc.js`, `learn.js`, `log.js`, `zip.js`, `geo.js`, `interp.js`, `plot.js`, `sheet.js` must stay DOM-free; tests `npm test`. New modules must be added to `tools/build_standalone.py` (ORDER) and top-level names must not clash across modules.
- Analysis definitions (binning, indices, depth mapping) must stay identical in Python and JS; keep the regression test against `legacy/v2.1_console/example_output.csv` passing.
- Never modify `legacy/`.
- Name: the app is **SedCoreTool** since V0.52 (CorAnTool V16–V0.51, IchAnTool before). Python import name `sedcoretool`; `ichantool` is a compatibility alias (keep it). Keep the IndexedDB/localStorage keys `ichantool*`/`corantool.*`, the desktop origin `app://corantool` and `window.corantoolDesktop` (changing them loses saved data), and accept project files with `app: 'CorAnTool'` or `'IchAnTool'` and `.corantool` packages.
- Never commit the owner's unpublished data or results (the repository is public-ready and contains none).
