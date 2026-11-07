# Test core: IODP Expedition 397, Site U1385, Hole I, Core 1H

Public data of the International Ocean Discovery Program (IODP), used by the tests and available as an example
project when the program runs from a copy of the repository. Iberian Margin ("Shackleton site"): hemipelagic mud with
subtle to moderate bioturbation.

## Contents

| Path | Content |
|------|---------|
| `web/` | Archive-half images of sections 1–6, reduced to **50 px/cm** with a Lanczos filter (`*_50pxcm.jpg`). These are the files the program loads. |
| `records/397-U1385I-1H_RSC_color.csv` | Colour reflectance L\*, a\*, b\* (SHMSL instrument), 438 measurements every 2 cm, depth CSF-A (m). |
| `records/397-U1385I-1H_MS.csv` | Whole-round magnetic susceptibility (WRMSL, instrument units), 420 measurements, depth CSF-A (m). |
| `records/397-U1385_core1_section_images_LIMS.csv` | LIMS table with the sections, depths and image file names. |

The full-resolution originals (about 200 px/cm, 1,380 × 29,880 px per section, 16 MB in total) are not stored in the
repository; they can be downloaded as described below.

Sections (CSF-A depth of the top and bottom of each curated section):

| Section | Top (m) | Bottom (m) | Original LIMS file |
|---------|---------|------------|--------------------|
| 1 | 0.00 | 1.50 | 397-u1385i-1h-1-a_shlf11915031_20221126134127_trim.jpg |
| 2 | 1.50 | 2.99 | 397-u1385i-1h-2-a_shlf11915061_20221126134246_trim.jpg |
| 3 | 2.99 | 4.49 | 397-u1385i-1h-3-a_shlf11915091_20221126134353_trim.jpg |
| 4 | 4.49 | 5.98 | 397-u1385i-1h-4-a_shlf11915121_20221126134500_trim.jpg |
| 5 | 5.98 | 7.48 | 397-u1385i-1h-5-a_shlf11915151_20221126134601_trim.jpg |
| 6 | 7.48 | 8.78 | 397-u1385i-1h-6-a_shlf11915181_20221126134717_trim.jpg |

The height of each image corresponds to the length of its section, so the section's top and bottom are used directly
as the top and bottom of the image.

## Source

LIMS Online Report portal (LORE), <https://web.iodp.tamu.edu/LORE/>, accessed 31 October 2026:
- **Images → Core Sections (LSIMG) → Standard**: Expedition 397, Site U1385, Hole I, Core 1, column *Cropped image
  (JPG) link*.
- **Physical Properties → Reflectance Spectroscopy and Colorimetry (RSC)**, same filters.
- **Physical Properties → Magnetic Susceptibility – Pass-through (MS)**, same filters.

Expedition 397 holes at Site U1385 are F–J (A–E belong to Expedition 339).

## Age model

The example project includes an **illustrative, unpublished** age model: an assumed constant rate of 10 cm/ka
(0 m = 0 ka; 8.78 m = 87.8 ka). It only serves to test the conversion to age. For any interpretation it must be
replaced by the published age model of Site U1385, after converting this hole's depths (CSF-A) to the composite
depth scale (CCSF).

## Citation and use

Data from the International Ocean Discovery Program (IODP), Expedition 397 (Iberian Margin Paleoclimate), obtained
from the LIMS database of the IODP JOIDES Resolution Science Operator. IODP data are openly available; when using them,
cite the *Proceedings of the International Ocean Discovery Program*, Volume 397, and the LIMS database.
