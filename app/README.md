# The SedCoreTool program (`app/`)

This folder contains the SedCoreTool program: a web application written in JavaScript ES modules, with no build step.
The same code runs in a browser, as the offline single file and inside the desktop program (`../desktop/`).

- **Run it:** from the repository root, `python3 -m http.server 8000` and open `http://localhost:8000/app/`.
- **Offline single file:** `python3 tools/build_standalone.py` → `dist/SedCoreTool_V0.<n>.html`.
- **Tests:** `npm test` (Node 22) runs `tests/app/*.test.mjs`.

| Path | Content |
|------|---------|
| `index.html` | Page structure and styles |
| `js/` | Modules; the map of modules and their roles is in [§1.4 of the technical documentation](../docs/TECHNICAL_DOCUMENTATION.md#14-source-code-map) |
| `vendor/` | Bundled third-party libraries and fonts, with their licences |

How to use the program is described in the [README](../README.md); how each part works, in the
[technical documentation](../docs/TECHNICAL_DOCUMENTATION.md).
