# Method

> Short English summary. The authoritative, detailed reference (formulas, defaults, validation,
> limitations) is [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md).

1. **Image preparation.** The core image is oriented with the top at row 0. Bioturbation
   features are interpreted and selected (manually or semi-automatically, following
   Dorador & Rodríguez-Tovar, 2014), either painted black (single class) or colour-coded by
   class (e.g. ichnotaxon).
2. **Label mask.** The image becomes an integer mask: 0 = matrix, 1..n = classes
   (`segmentation.py`). Black features: gray value <= threshold (default 5, as in v2.1).
3. **Row coverage.** For each pixel row, percentage of bioturbated pixels (total and per class).
4. **Depth bins.** Rows are averaged in bins of `bin_px` rows; each bin is assigned the depth of
   its centre, interpolated linearly between the top and bottom depths. The last, incomplete
   bin is kept by default (`keep_partial=False` drops it, as v2.1 did).
5. **Indices.** Each bin's percentage is mapped to BI and ii using half-open tiers
   `[lower, upper)` (`indices.py`).
6. **Age (optional).** Depths are converted to ages by linear interpolation of an age model.

Choosing `bin_px`: larger bins give smoother curves; the appropriate value grows with image
resolution (pixels per depth unit, reported in `CoreSection.metadata`).
