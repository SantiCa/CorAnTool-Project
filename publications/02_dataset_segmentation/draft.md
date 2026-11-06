# Paper 2 — Open annotated dataset and automatic segmentation of bioturbation in core images

**Target:** Earth System Science Data (data focus) or Computers & Geosciences / Artificial
Intelligence in Geosciences (method focus). Decide once the dataset size and model results are known.

**Plain-language guide (Spanish):** `publications/GUIA_APRENDIZAJE_AUTOMATICO.md`.

**Status (V0.17, 05-11-2026; training plan in §3.5; training inside the desktop program and vision-model
descriptors for ichnotaxa in §3.6):** the full workflow is implemented in SedCoreTool and tested on synthetic
data (export → tiles split by core → training → evaluation on whole images of independent cores →
use in the app). **No model has been trained on real cores yet; every number below is a placeholder.**
Methods text describes the code exactly; keep it in sync with `docs/DOCUMENTACION_TECNICA.md` §7.5.

## Working title
An open, annotated dataset of sediment-core images and a U-Net baseline for automatic
segmentation of bioturbation [TODO: "and ichnotaxa" if multi-class results are good enough]

## Provisional abstract
Quantifying bioturbation in cores still depends on manual selection of trace fossils on images,
the main bottleneck of image-based ichnofabric analysis. We release [N] images from [M] cores
([sites/expeditions]) with expert masks of bioturbation [and ichnotaxa], annotated in the open
program SedCoreTool, together with an annotation protocol and inter-annotator agreement on a subset.
We train a U-Net on cores split into training, validation and test sets, so that all scores are
measured on cores never seen during training, and compare it with classical thresholding
workflows used in ichnology. On the test cores the U-Net reaches [Dice] (pixel) and an error of
[x] percentage points in bioturbation per [b]-cm interval, with BI agreement [y] %, against
[Dice_base] and [x_base] for the best classical workflow and [Dice_human] between experts.
Data, code and the trained model are openly released; the model runs inside SedCoreTool without a GPU.

## 1. Introduction
- Image-based ichnofabric analysis: enhancement + manual selection (Dorador et al., 2014;
  Miguez-Salas et al., 2019); percentage per interval and BI/ii (Casanova-Arenillas et al., 2020).
- Bottleneck: manual selection is slow and subjective; thresholding depends on contrast between
  infill and host sediment and fails with low contrast, mottling, cracks or light infills.
- Deep learning for segmentation (Ronneberger et al., 2015) has been applied to bioturbation
  [TODO: review — Applied Sciences 11(16):7736 (2021); Kikuchi and Naruse (2024), Dice 0.892 for
  *Phycosiphon* — verify authors, titles and journals before citing; patent US12142024: mention only
  if relevant to related work].
- Gap: no open, multi-site annotated dataset; scores often reported on random tiles, inflated by
  spatial autocorrelation; trained models rarely usable by ichnologists.
- Contributions: (1) open dataset + protocol + agreement; (2) U-Net baseline evaluated on
  independent cores against classical workflows and human agreement; (3) integration in an open
  program (annotation, training data export, inference, correction).

## 2. Data
- Sources [TODO]: IODP/ODP core images (public), [UGR collections — permission and licence].
- Per image: core, section, top and bottom depth, resolution (px/cm), camera/scanner and lighting
  [TODO: add equipment to the manifest or a side table].
- Annotation protocol [TODO: write `publications/02_dataset_segmentation/protocol.md`]: what counts as
  a trace, artefacts (cracks, voids, sampling holes, drilling disturbance) excluded with the exclusion
  layer, ichnotaxa criteria, minimum size.
- Annotation tool: SedCoreTool (wand, brush, lasso, polygon, exclusion; candidates from classical
  detection reviewed one by one). Only traces with a class confirmed by the annotator are used.
- Inter-annotator agreement: ≥ 2 experts on [n] images; IoU, Dice and difference in % per interval.

### Exported format (SedCoreTool *Results → U-Net training data*)
One ZIP per project: `images/<core>__<section>.png` (original analysis area, no enhancement),
`masks/<core>__<section>.png` (8-bit: 0 = matrix or reviewed artefact, k = class k,
255 = ignore: excluded zones and traces without a confirmed class) and `manifest.json`
(classes; per image core, section, top, bottom, units, px/cm, size and counts of reviewed and
unreviewed objects). Unreviewed traces are ignored rather than counted as matrix, because an
unconfirmed trace is not a reliable negative.

## 3. Methods
### 3.1 Data preparation (`sedcoretool unet prepare`)
- All images resampled to a common resolution ρ (default: median px/cm of the dataset); images
  bilinear, masks nearest neighbour.
- Tiles of T = 512 px with 64-px overlap; tiles with < 50 % valid (non-ignored) pixels discarded;
  areas outside the image marked as ignore.
- **Split by core**: all tiles of a core in the same set. Test cores chosen [by site / at random
  with seed 42]; never used for training, early stopping or threshold choice.
- Binary target (bioturbation vs matrix) [and multi-class variant].

### 3.2 Model and training (`sedcoretool unet train`)
- U-Net with ResNet-34 encoder pre-trained on ImageNet (segmentation-models-pytorch).
- Loss: binary cross-entropy with logits + soft Dice, ignoring 255 pixels (multi-class: cross-entropy
  + mean Dice of classes ≥ 1).
- Augmentation: horizontal and vertical flips; contrast ×U(0.85, 1.15), brightness +U(−0.08, 0.08),
  gamma U(0.8, 1.25). No 90° rotations: trace orientation relative to bedding is diagnostic.
- AdamW (lr 3·10⁻⁴, weight decay 10⁻⁴), cosine schedule, batch 8, ≤ 60 epochs, early stopping
  (patience 12) on validation Dice. Seed 42. Hardware [TODO: GPU model, training time].

### 3.3 Inference (same rules in Python and in the app)
- Whole analysis area resampled to ρ, cut into overlapping tiles, normalised with ImageNet mean
  and SD, sigmoid of the logits, tiles merged with a linear ramp weight over the overlap, resampled
  back. Python and JavaScript implementations are checked against the same reference values.
- Candidates: P ≥ 0.5 (threshold fixed on validation cores, not on test cores), then the same
  morphological cleaning and minimum size as the classical workflow.
- In the program, users can show "doubtful" pixels (|P − 0.5| < 0.2) and correct the result with
  the editing tools; corrected images can be exported again to enlarge the dataset.

### 3.4 Evaluation (`sedcoretool unet evaluate`)
- On **whole images** of the test cores, not tiles.
- Pixel: IoU, Dice, precision, recall (ignored pixels excluded); pooled over images (TP, FP, FN summed).
- Per interval of b cm [1 cm and …]: absolute error and bias of bioturbation %, agreement of BI
  (Taylor and Goldring, 1993) and ii (Droser and Bottjer, 1986) classes.
- Baselines on the same test images: adaptive threshold (SedCoreTool default); CLAHE + threshold or
  K-means + hole filling (Miguez-Salas et al., 2019); Dorador et al. (2014) enhancement + threshold.
  [TODO: implement the classical detections in the Python package, or export their masks from the
  app, so that baselines are scored with the same code.]
- Human ceiling: agreement between annotators.
- [Optional] Cross-source test: train on one source (e.g. IODP scans), test on another.

### 3.5 Training protocol and experiments (plan, V0.16)
Run in this order; each step uses only commands that exist in SedCoreTool V0.15.

1. **Pilot (3–5 cores).** Annotate, export, prepare, train for a few epochs and evaluate, to check the
   whole chain on real images and measure annotation time per metre of core. Pilot cores can be
   re-used later only if their annotation follows the final protocol.
2. **Dataset (target 15–20 cores, ≥ 2 sources/sites).** Annotate following the written protocol.
   Record source, equipment, resolution and lithology per core.
3. **Lock the test set before training.** Choose the test cores (≈ 20 %, covering every source and
   lithology) and write their names in `dataset.json` (`--test`). They are not looked at again until
   the final evaluation: no training, no early stopping, no threshold or parameter choice on them.
4. **Validation cores (≈ 20 %)** for early stopping and for choosing the probability threshold:
   evaluate the validation cores (`evaluate --cores …`) at thresholds 0.3–0.7 and keep the one with the
   best Dice; that value is then fixed for the test set.
5. **Main model:** ResNet-34 pre-trained on ImageNet, settings of §3.2, seed 42. Repeat with 3 seeds
   and report mean ± SD to show the variability due to training.
6. **Baselines and human ceiling** on the same test images with the same scoring code (§3.4).
7. **Learning curve:** retrain with 25, 50, 75 and 100 % of the training cores (same test set) to show
   how many annotated cores are needed.
8. **Cross-source test (if ≥ 2 sources):** train on one source, test on the other.
9. **Correction loop (optional, reported separately):** the model's doubtful zones guide the expert's
   corrections on new cores; corrected cores are added to training. Annotation time with and without
   the model's proposal is measured. Cores annotated this way never go to the test set, because the
   proposal could bias the expert.
10. **Release:** model `.onnx` + `.json` (with split, seed and history), dataset and protocol with DOIs.

### 3.6 Software used for the experiments (V0.17)
- **Training inside SedCoreTool (desktop).** The same Python code as the command line, run from the program on
  the annotator's computer (NVIDIA CUDA, Apple MPS or CPU). The user marks each core as validation, test or
  automatic; the program exports the training data, prepares tiles, trains, evaluates on the test cores and
  loads the model. Training can be stopped and resumed from a per-epoch checkpoint (models reported in the
  paper are trained without interruption). This matters for the dataset paper: annotators without
  programming experience can reproduce the training and the correction loop (§3.5, step 9).
- **Ichnotaxon identification (secondary aim).** Two inputs for the same classifiers (distance-weighted k-NN
  with novelty rejection, Random Forest, naive Bayes): (a) 12 shape and colour descriptors per trace;
  (b) the 384-value embedding of a frozen, self-supervised vision model (DINOv2 ViT-S/14; Oquab et al., 2024)
  of a square window around each trace (25 % context per side, original image, 224 × 224 px, unit length).
  The vision model is not fine-tuned; only the classifier learns from the annotations. Both inputs are
  compared on the same independent test cores (balanced accuracy, per-class F1, confusion matrix) and against
  agreement between experts. [TODO: decide whether identification goes in this paper or in paper 3.]

## 4. Results [TODO — no results yet]

| Method | IoU | Dice | Precision | Recall | MAE % (b cm) | BI agreement | ii agreement |
|---|---|---|---|---|---|---|---|
| Adaptive threshold | | | | | | | |
| CLAHE + threshold / K-means (Miguez-Salas et al., 2019) | | | | | | | |
| Dorador et al. (2014) + threshold | | | | | | | |
| U-Net (this work) | | | | | | | |
| Second annotator | | | | | | | |

Identification (test cores):

| Input | Classifier | Balanced accuracy | Macro F1 | Rejected (novel) |
|---|---|---|---|---|
| 12 shape/colour descriptors | k-NN | | | |
| DINOv2 embedding | k-NN | | | |
| best of RF / Bayes | | | | |
| Second expert | — | | | — |

Figures: (1) dataset map and examples; (2) workflow; (3) examples of predictions, errors and
doubtful zones on test cores; (4) bioturbation % logs, expert vs U-Net vs baseline; (5) error by
contrast class / lithology.

## 5. Discussion [TODO]
- Where the U-Net fails (light infills, mottled background, cracks) and how users correct it.
- Effect of resolution and source; how many annotated cores are needed (learning curve).
- Limits: 2-D surfaces; annotation subjectivity; class imbalance for rare ichnotaxa.

## 6. Code and data availability
- Code: SedCoreTool (GPL-3.0) [repository URL and Zenodo DOI of the version used].
- Dataset: [Zenodo/PANGAEA DOI], licence [CC BY 4.0?], including masks, manifest and protocol.
- Trained model: `.onnx` + `.json` [DOI]; runs in SedCoreTool (desktop, browser) and with
  `sedcoretool unet predict`.

## Needs
- [x] Annotation, export, training, evaluation and in-app inference implemented (V0.15).
- [ ] Permission and licence for the images (IODP images are public; UGR treated images: ask).
- [ ] Annotation protocol written.
- [ ] Annotation by ≥ 2 experts on a subset to measure agreement.
- [ ] Classical baselines scored with the same evaluation code.
- [ ] Equipment and lighting per image recorded.
- [ ] Pilot with 3–5 cores (§3.5, step 1).
- [ ] Test cores chosen and locked before any training.
- [ ] Training on a GPU (a single consumer GPU is enough), 3 seeds, learning curve.
- [ ] Compare shape descriptors vs DINOv2 embeddings for ichnotaxa on test cores.
- [ ] Verify all references in §1.

## References (to complete and verify)
- Casanova-Arenillas, S. et al. (2020). *Computers & Geosciences* 136, 104407. doi:10.1016/j.cageo.2020.104407
- Dorador, J., Rodríguez-Tovar, F. J. and IODP Expedition 339 Scientists (2014). *Facies* 60.
- Droser, M. L. and Bottjer, D. J. (1986). *Journal of Sedimentary Petrology* 56.
- He, K., Zhang, X., Ren, S. and Sun, J. (2016). Deep residual learning for image recognition. CVPR.
- Miguez-Salas, O., Dorador, J. and Rodríguez-Tovar, F. J. (2019). *Marine Geology* 413.
- Oquab, M. et al. (2024). DINOv2: learning robust visual features without supervision. *Transactions on
  Machine Learning Research*. [verify]
- Ronneberger, O., Fischer, P. and Brox, T. (2015). U-Net: convolutional networks for biomedical
  image segmentation. MICCAI, LNCS 9351.
- Taylor, A. M. and Goldring, R. (1993). *Journal of the Geological Society* 150.
- [TODO] Applied Sciences 11(16):7736 (2021); Kikuchi and Naruse (2024).
