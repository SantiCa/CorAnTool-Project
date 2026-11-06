# Security policy

SedCoreTool runs locally: projects and images stay in the browser (IndexedDB) or on the computer (desktop program).
Network requests are made only for optional downloads (map backgrounds from Esri/GEBCO after consent, the DINOv2
vision model from Hugging Face, and libraries from jsDelivr/SheetJS when the bundled copies are missing).

## Supported versions
Only the latest delivery (`V0.<n>`, see [CHANGELOG.md](CHANGELOG.md)) receives fixes.

## Reporting a vulnerability
Please do **not** open a public issue. Use GitHub's private reporting (*Security → Report a vulnerability*) or write
to the maintainer (address in `desktop/package.json`). Include the version, the steps to reproduce and, if possible,
a file that triggers the problem. You will get an answer within two weeks.

Files from other people (projects, spreadsheets, images) are parsed in the browser; reports about crafted files that
crash the program or run code are especially welcome.
