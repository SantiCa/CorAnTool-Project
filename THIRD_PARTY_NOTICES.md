# Third-party notices

SedCoreTool is GPL-3.0-or-later (see [LICENSE](LICENSE)). It bundles or downloads the following components; their
licences are in `app/vendor/` where bundled.

| Component | Version | Use | Licence |
|-----------|---------|-----|---------|
| pako | 2.1.0 | PNG/ZIP inflate | MIT (`app/vendor/LICENSE-pako-2.1.0`) |
| UTIF.js | 3.1.0 | TIFF images | MIT (`app/vendor/LICENSE-utif-3.1.0`) |
| SheetJS Community Edition | 0.20.3 bundled and as download (see `tools/update_vendor.sh`) | Excel/ODS import | Apache-2.0 (`app/vendor/LICENSE-xlsx-0.20.3`) |
| ONNX Runtime Web | 1.31.1 (downloaded; bundled in the desktop program) | U-Net and DINOv2 inference | MIT |
| IBM Plex Sans, Sans Condensed, Mono | — | interface fonts | SIL Open Font License 1.1 (`app/vendor/fonts/LICENSE-ibm-plex.txt`) |
| Electron, electron-builder | see `desktop/package.json` | desktop program | MIT |
| DINOv2 ViT-S/14 (onnx-community/dinov2-small) | commit `8b1f705a3a7f6f062f6bdd21986c1583d3ef105d`, downloaded on demand | vision descriptors | Apache-2.0 (Meta AI) |
| Natural Earth 1:50 m land | `examples/data/land-50m.json` | map coastline | public domain |
| IODP U1385I-1H images and data | `examples/U1385I-1H/` | test core | IODP data policy (public; cite IODP Expedition 397) |

Map backgrounds (optional, after consent) are requested from Esri ArcGIS Online and GEBCO and are subject to their
terms of use; attribution is printed on each map.
