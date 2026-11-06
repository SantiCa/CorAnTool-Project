# Roadmap

## 3.0 — core package (in progress)
- [x] Installable package, CLI and Python API
- [x] Vectorised computation; PNG/TIFF/JPEG input; grayscale or RGB
- [x] Multi-class (per-ichnotaxon) percentages from colour-coded images
- [x] Configurable index schemes (BI, ii)
- [x] Depth -> age conversion
- [x] CSV / Excel export
- [x] Regression test against the v2.1 reference results
- [ ] Batch processing of folders and multi-section cores (splices, gaps)
- [ ] LAS export for well-log software
- [ ] Documentation site and example notebooks
- [ ] Release on PyPI + Zenodo DOI; JOSS submission

## 3.x — assisted segmentation
- [ ] Interactive annotation helper (promptable segmentation models)
- [ ] Learned segmentation (U-Net-type) trained on annotated core images
- [ ] Open annotated dataset of core images and masks
- [ ] Validation: automatic vs. manual masks vs. visual BI/ii estimates

## Web application (app/)
- [x] Image -> enhancement -> detection -> editing -> curves and indices in the browser
- [x] Incremental learning of ichnotaxa (k-NN with novelty detection); model export/import
- [ ] Pixel-level learned segmentation in the app (train on painted masks)
- [ ] Host on GitHub Pages
- [ ] Batch processing and reports for institutional/industry users

## Extensions
- [ ] Additional ichnological parameters: ichnodiversity, burrow size, tiering, cross-cutting
- [ ] CT / X-ray image support
