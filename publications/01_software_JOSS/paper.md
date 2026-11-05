---
title: 'CorAnTool (formerly IchAnTool): open software for quantitative ichnofabric and multiproxy analysis of sediment cores'
tags:
  - Python
  - ichnology
  - bioturbation
  - ichnofabric
  - sedimentology
  - image analysis
authors:
  - name: Santiago Casanova-Arenillas
    orcid: 0000-0000-0000-0000  # [TODO]
    affiliation: 1
  # [TODO] co-authors
affiliations:
  - name: '[TODO]'
    index: 1
date: 1 November 2026
bibliography: paper.bib
---

# Summary

Bioturbation intensity is a key parameter of the ichnofabric approach and is routinely
estimated in sediment cores with semi-quantitative visual schemes such as the Bioturbation
Index [@reineck1963; @taylor1993] and the ichnofabric index [@droser1986]. Visual estimation
is subjective, slow, and usually discontinuous along the core. IchAnTool converts segmented
core images into continuous, depth- or age-referenced series of bioturbated-surface
percentage, per-class coverage (e.g. per ichnotaxon), and the corresponding semi-quantitative
indices, ready to be correlated with geochemical, mineralogical, or logging data.

# Statement of need

Digital image treatment has improved the visibility and quantification of trace fossils in
cores [@dorador2014; @dorador2018], but turning treated images into continuous data series
remained a manual, repetitive task. A first version (IchAnTool), a single script, was
introduced in @casanova2020. CorAnTool is a complete rewrite: an installable, tested Python package
with a command-line interface and API, and a browser application that needs no installation, aimed at sedimentologists,
ichnologists, palaeoceanographers, and core-analysis practitioners in academia and industry.
[TODO: one paragraph on existing alternatives and why IchAnTool is needed.]

# Functionality

- Input: treated images (PNG, TIFF, JPEG) with bioturbation painted in a single colour,
  colour-coded classes, or integer label masks.
- Row-wise bioturbated percentage, aggregated into user-defined depth bins.
- Per-class percentages for colour-coded ichnotaxa.
- Configurable index schemes (BI and ii provided).
- Depth-to-age conversion with user age models.
- CSV/Excel export, quick-look plots, and a modular segmentation interface for future
  learned models.
- Results reproduce those of the published version exactly (regression test).
- Browser application: projects with several cores; numeric records of any kind (XRF, foraminifera, TOC,
  colour) in depth or age; families of described intervals classified by hand; user-defined classifiers
  (random forest, multilayer perceptron, k-nearest neighbours, naive Bayes, k-means) validated leaving
  whole cores out; maps by age window with several projections and interpolation methods; Grapher-like
  plots; publication figures; a synthetic training project with a guided tour.

# Implementation

Both implementations share the same definitions. A label mask (0 = matrix, 1..n = objects or
classes) is restricted to an analysis area. The bioturbated percentage of each depth interval of
*N* pixel rows is the ratio of bioturbated to valid pixels. Excluded pixels (cracks, voids,
samples; currently in the web application only) leave both terms. Each interval is assigned the depth of its centre, interpolated
linearly between the top and bottom depths of the analysis area. Percentages map to BI and ii
through half-open tiers, and ages come from linear interpolation of a user age model.

The web application adds four steps before the mask is final:

- image enhancement: levels, gamma, contrast, saturation, histogram equalisation and unsharp-mask
  local contrast;
- candidate detection: adaptive mean-C thresholding, 3 × 3 morphological opening/closing and
  8-connected components with a minimum size;
- interactive editing: colour region growing, brush, lasso and an exclusion layer;
- assisted ichnotaxon identification: a distance-weighted *k*-nearest-neighbour classifier
  (*k* = 5) on twelve standardised shape, size (physical units) and colour descriptors, with a
  confidence threshold, a novelty gate based on the leave-one-out nearest-neighbour distance and
  exportable models.
  Optionally, the descriptors can be replaced by the embedding of a frozen pre-trained vision model
  (DINOv2; the classifier still learns only from the user's labels);
- learned segmentation (experimental): export of images and expert masks, a U-Net trained with the
  Python package or from the desktop program on the user's GPU, and in-app inference with ONNX Runtime
  (probability threshold and doubtful zones). No trained model is distributed yet.

All computations except optional U-Net training are deterministic. Project files store the original image and every parameter.
A full technical reference, with formulas and default values, is distributed with the code
(`docs/`).

[TODO: figure — example core, mask and output curves (`examples/`).]

# Acknowledgements

[TODO]

# References
