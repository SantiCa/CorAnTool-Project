#!/usr/bin/env bash
# V0.38: replaces the bundled SheetJS (0.18.5, CVE-2023-30533 and CVE-2024-22363) with the official 0.20.3 build.
# SheetJS no longer publishes to npm: the official source is cdn.sheetjs.com. Run from the repository root and commit
# app/vendor/xlsx.full.min.js and app/vendor/LICENSE-xlsx-0.20.3 with the printed SHA-256 in the commit message.
set -euo pipefail
V=0.20.3
curl -fsSL "https://cdn.sheetjs.com/xlsx-$V/package/dist/xlsx.full.min.js" -o app/vendor/xlsx.full.min.js
curl -fsSL "https://cdn.sheetjs.com/xlsx-$V/package/LICENSE" -o "app/vendor/LICENSE-xlsx-$V"
rm -f app/vendor/LICENSE-xlsx-0.18.5
head -c 120 app/vendor/xlsx.full.min.js; echo
grep -o 'version:"[0-9.]*"' app/vendor/xlsx.full.min.js | tail -1
sha256sum app/vendor/xlsx.full.min.js
