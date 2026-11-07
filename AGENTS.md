# Contributor and AI-assistant guide

This file is the single set of working rules for anyone changing SedCoreTool: human contributors and AI coding
assistants alike (Codex, ChatGPT, Claude and others). Claude reads it through `CLAUDE.md`, which only imports this
file. Keep the rules here and nowhere else.

Owner and maintainer: Santiago Casanova-Arenillas. **Reply to the owner in Spanish**; everything committed to the
repository (code, comments, documentation, commit messages) is written in English.

## 1. What the project is

SedCoreTool quantifies bioturbation and ichnotaxa in sediment-core images and combines them with other down-core
records. It has two parts that share the same analysis definitions:

| Part | Path | Language |
|------|------|----------|
| The program (desktop and browser) | `app/` (web application), `desktop/` (Electron packaging) | JavaScript, no build step |
| The Python package `sedcoretool` | `src/sedcoretool/` (`src/ichantool/` is a compatibility alias) | Python ≥ 3.10 |
| Reference version 2.1 (2019) | `legacy/` | Python 3.7 — never modify |

Start with [README.md](README.md) for users and [docs/TECHNICAL_DOCUMENTATION.md](docs/TECHNICAL_DOCUMENTATION.md)
for how every part works (§1.4 maps the source files).

## 2. Repository map

```
app/            program: index.html, js/ (ES modules), vendor/ (bundled libraries and fonts)
desktop/        Electron main process, preload, U-Net trainer, build scripts, release notes
src/sedcoretool Python package (analysis, command line, U-Net)
tests/          Python tests, program tests (tests/app), end-to-end tests (tests/e2e), fixtures
examples/       public example data used by tests and by the program when run from the repository
tools/          offline build, version sync, release, vendor update, synthetic data generators
docs/           technical documentation and roadmap
paper/          software paper (JOSS) and its bibliography
legacy/         original version 2.1, unchanged
```

## 3. Setting up and running

```bash
pip install -e ".[dev]"                 # Python package with test dependencies
pytest -q                               # Python tests
npm test                                # program tests (Node 22; same as: node --test tests/app/*.test.mjs)
python3 -m http.server 8765             # then open http://localhost:8765/app/
python3 tools/build_standalone.py       # offline file -> dist/SedCoreTool_V0.<n>.html (dist/ is not committed)
cd desktop && npm ci && npm start       # desktop program; npm run dist builds installers for the current system
npm i --no-save puppeteer-core@23 && node tests/e2e/smoke.mjs   # browser end-to-end test (needs the server above and Chrome)
```

On Windows with a local virtual environment: `python -m venv .venv`, `.\.venv\Scripts\python.exe -m pip install -e
".[dev]"`, then `.\.venv\Scripts\python.exe -m pytest -q`. Do not reinstall dependencies if the environment works.

## 4. Rules for code

- **Shared definitions.** Interval limits, percentages, indices and depth mapping must stay identical in Python
  (`src/sedcoretool/`) and JavaScript (`app/js/core.js`); U-Net tiling likewise (`unet/tiling.py`, `app/js/unet.js`).
  Keep the regression test against `legacy/v2.1_console/example_output.csv` passing.
- **Pure modules.** `core.js`, `edit.js`, `imageproc.js`, `learn.js`, `log.js`, `zip.js`, `geo.js`, `interp.js`,
  `locmap.js`, `plot.js`, `sheet.js`, `exportio.js` and `unet.js` must not use the DOM, so they can be tested with
  Node. A new module must be added to `ORDER` in `tools/build_standalone.py`, and top-level names must not clash
  across modules.
- **Compatibility of saved data.** Do not rename the browser storage keys (`ichantool.*`, `corantool.*`), the
  IndexedDB database `ichantool`, the desktop origin `app://corantool` or `window.corantoolDesktop`: users would lose
  their projects. Keep reading project files written as `IchAnTool` or `CorAnTool` and `.corantool` packages. Keep the
  `ichantool` Python alias.
- **No private data.** Never commit unpublished data or results of the owner or anyone else. The repository and the
  downloads contain only public example data.
- **Interface texts** go in `app/js/i18n.js`, in Spanish and English.
- Add tests for behaviour changes, not for documentation-only changes.

## 5. Delivering a change

Every delivery that changes code, algorithms, defaults or files includes, in the same commit:

1. **Next version number** `V0.<n>` (the latest is the top entry of `CHANGELOG.md`). Set `DELIVERY` in
   `app/js/app.js` and run `python3 tools/sync_version.py`, which writes `0.<n>.0` to `pyproject.toml`,
   `src/sedcoretool/__init__.py`, `CITATION.cff` and `desktop/package.json` (a test checks them).
2. **`CHANGELOG.md`:** a new entry at the top, `## V0.<n> — YYYY-MM-DD`, with short user-facing bullets (what changed
   for the user, not how the work was organised).
3. **`docs/TECHNICAL_DOCUMENTATION.md`** if an algorithm, formula, default value, file format or validation result
   changes. Formulas there must match the code exactly. It describes current behaviour for any reader: no history, no
   notes addressed to reviewers.
4. **README** if what users see or do changes.
5. **Tests pass:** `pytest -q`, `npm test`, `python3 tools/sync_version.py --check`, `ruff check src tests tools`;
   run the end-to-end test when the interface or saving changes. Do not re-run them on an unchanged, already verified
   state.
6. **Commit** on `master` with the message `V0.<n>: <summary>` and a short body. Select files explicitly.

Version 1.0 is reserved for when the owner declares the program complete.

**Releases.** `tools/release.sh` checks branch, clean tree, versions and tests, and pushes the tag `V0.<n>`; GitHub
Actions (`.github/workflows/desktop.yml`) then builds Windows, macOS and Linux installers and publishes the Release.
A manual run of *Desktop builds* on `master` with `draft_release` prepares an unpublished draft instead. Before a
release, update `desktop/RELEASE_NOTES.md` (the text of the GitHub Release). Only the owner decides when to publish a
release or a DOI.

## 6. Documentation: what goes where

| Content | Place |
|---------|-------|
| What the software is for, installation, how to use it | `README.md` |
| How each part works: methods, formulas, defaults, file formats, validation | `docs/TECHNICAL_DOCUMENTATION.md` |
| What changed in each version | `CHANGELOG.md` |
| Planned work | `docs/roadmap.md` |
| Desktop release notes (text of the GitHub Release) | `desktop/RELEASE_NOTES.md` |
| How to contribute (humans) | `CONTRIBUTING.md` (short; points here) |
| Working rules (humans and AI assistants) | this file |
| Software paper | `paper/` |

Do not repeat content between these files; link instead. Keep the tone factual and professional.

## 7. Working with several people or assistants

- **One editor at a time** on a shared working copy, even for different files: the version number and the changelog
  are shared. Other sessions may read and review.
- **Before editing:** `git fetch origin`, `git status --short --branch`, and `git pull --ff-only` on a clean tree.
  A dirty tree may contain someone else's work: do not stash, reset, clean or discard it, and do not switch branches.
- **Before committing:** fetch again; if someone else delivered meanwhile, rebase or merge and take the next free
  version number. Never force-push or overwrite others' work.
- **Handoff** happens through the repository: the commit message and the changelog say what was done; anything left
  for later goes to `docs/roadmap.md`. Sessions do not share memory, so do not rely on chat history.
- **Scope:** do the task requested, one task at a time. Do not start refactors, general audits or old pending items
  without a request. Do not launch sub-agents or automations unless asked.
- **Reporting to the owner:** briefly, in Spanish — result, how it was checked, version number, and anything that is
  genuinely pending.
