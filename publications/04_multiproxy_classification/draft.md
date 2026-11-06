# Paper 4 — Automatic classification of core intervals from multiproxy records

**Target:** Computers & Geosciences. Alternatives: Artificial Intelligence in Geosciences, Applied Computing and
Geosciences; Marine Geology if the emphasis is the palaeoceanographic result.

## Working title
Reproducible classification of core intervals (sapropels, organic-rich layers, turbidites…) from multiproxy records
with user-defined machine-learning classifiers [TODO]

## Provisional abstract
Interval interpretation in cores (e.g. low-oxygen events, detrital pulses, climate stages) is done by experts core by
core and is hard to reproduce across many cores and laboratories. We present a workflow in SedCoreTool in which experts
define families of intervals and their classes, label some cores, and train classifiers (random forest, multilayer
perceptron, k-nearest neighbours, naive Bayes) on resampled multiproxy records (XRF, foraminifera, TOC, colour,
bioturbation). Models are validated leaving whole cores out and tested on [N] cores withheld from model selection.
[TODO: results — balanced accuracy per family, per class F1, transfer between basins, effect of adding ichnology.]

## Outline
1. Introduction — expert interval interpretation; reproducibility across cores; prior ML in core logging [TODO review].
2. Data — cores, proxies, age models, described intervals (independent of the rules), harmonisation of variables.
3. Methods — resampling and scaling (§21.2); families and labels (§21.3); classifiers (§21.4–§21.4 ter); validation
   leaving one core out (§21.5); held-out cores for the final test; permutation importance [TODO implement].
4. Results — comparison of models and inputs; maps by age window (§21.6) as illustration only.
5. Discussion — transfer between cores with different scanners; leakage between families; limits.
6. Software and data availability — SedCoreTool release (DOI), project files as supplementary material.

## Needs
- [ ] Cores with independently described events (published sapropels/ORL, turbidites) not used to define rules.
- [ ] Harmonised variable set across cores (same XRF ratios or calibrated values).
- [ ] Held-out cores option in the interface (to avoid model-selection bias).
- [ ] Permutation importance (also valid for the neural network).
