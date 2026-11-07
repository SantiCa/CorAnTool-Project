// SedCoreTool web (antes CorAnTool e IchAnTool) — application (UI, state, tools, rendering, files).
import { rleValid, interpAgeRange, baconToAgeText, BI, II, UNIT_TO_CM, idsAt, topAt, hasId, stackIndex, codeFor, withoutId, renameId, compactStacks, rowCounts, binRows, parseAgeModel, parseAgeModelDetailed, interpAge, toCSV, rleEncode, rleDecode } from './core.js';
import { withProvenance, ageModelText, bioturbationTable, objectsTable, recordSeries } from './exportio.js';

import { DEFAULT_FILTERS, FILTER_PRESETS, DEFAULT_DETECT, traceSeparation, localSeparability, applyFilters, detectMask, components, regionGrow, polygonPixels, objectStats, features, rotate90, downsampleRGBA, autoLevels, gammaForMedian } from './imageproc.js';
import { orderCols, LOG_STYLE, ND_STYLE, parseTable, decodeText, guessAxisColumn, invertModel, toAxis, compositeRows, rowsRange, buildLogSVG, windowCSV, abbrevs, traceSymbolPath } from './log.js';
import { storageAvailable, listProjects, getProject, putProject, putMeta, deleteProject, getPref, setPref, putLite, listLite, getMeta, putImage, getImage, gcImages } from './storage.js';
import { interpolate, maskLand, rampColor, colorRange, contourLevels, contourSegments, RAMPS, INTERP_METHODS, INTERP_DEFAULT } from './interp.js';
import { buildXYPlot, buildStratPlot, PLOT_TYPES, FIT_KINDS, PLOT_COLORS } from './plot.js';
import { evalColumn, evalCells, cellName, FUNCTIONS, parseFormula, formulaRefs, fillLinear } from './sheet.js';
import { TaxonModel, evaluateModels, finalTestMetrics, independentExternalExamples, descriptorSig, vec, FEATURES } from './learn.js';
import { splitPieces, mergeKeeper, sameTaxonGroups, undoPixels, upgradeProject } from './edit.js';
import { t, lang, setLang, applyI18n } from './i18n.js';
import { zipFiles, unzipBlob } from './zip.js';
import { UNET_DEFAULTS, IGNORE, predictProb, doubtful, trainingMask, cropRGBA } from './unet.js';
import { VISION_MODEL, visionFeatureId, traceWindow, traceInput, pickEmbedding } from './vision.js';
import { tidyIntervals, coresFromLongTable, coreFromRows, applyCatalogue, coreAges, featureSeries, buildSamples, fitSampleTransform, transformSample, labelSamples, layerFeatureNames, intervalsOnAxis, orphanIntervals, intervalsFromTable, METHODS, fitModel, predictLabel, crossValidateSteps, fitModelSteps, mapSummary, buildMapSVG, mapBBox, predictProba, MAP_STYLE, MAP_SYMBOLS, MAP_PROJECTIONS, zoomBBox, fitBBoxAspect, mapGeometry, mapFrame } from './geo.js';
import { $, APP, APP_NAMES, CLF_SCOPES, ML_DEFAULT, S, VERSION, clsById, defaultClasses, fetchAsset, fmt, hex, hideMissingExamples, keyOf, sec, uid } from './state.js';
import { FIG_PANELS, arrowMarksSVG, axisErr, coreRatio, defaultFig, editSVGLabels, figTraces, panelDataURL, renderFigPanel, renderFigure, scheduleFigure, traceCanvas, verticalStyleHTML } from './figures.js';
/** Delivery number (V27…): shown in the header, the start screen, the help, the window title, project files and the name of the offline file. */
const DELIVERY = 'V0.64';
/* V0.17: input of the ichnotaxon classifier — 12 shape/colour descriptors ('shape') or the vector of a pre-trained
   vision model ('vision', DINOv2). Vectors of the two sets are never mixed. */
const visionOn = () => (S.settings.ml?.features || 'shape') === 'vision';
const featNames = () => (visionOn() ? visionFeatureId() : FEATURES);
const xOf = (o) => (visionOn() ? o.emb || null : o.feat ? vec(o.feat) : null);
const xOfLib = (e) => (visionOn() ? e.xv : e.x);
const mlOpt = () => { const m = { ...ML_DEFAULT, ...(S.settings.ml || {}) };
  return { method: m.method, k: m.k, weights: m.weights, novelty: S.settings.novelty, seed: 42, fitFn: fitModel, probaFn: predictProba, features: featNames(),
    rf: { trees: m.trees, maxDepth: m.maxDepth, minLeaf: m.minLeaf, balanced: m.balanced }, nb: { priors: m.priors } }; };
const mkModel = () => new TaxonModel(mlOpt());
const clfs = { core: new TaxonModel(), project: new TaxonModel(), all: new TaxonModel() };
let clf = clfs.project, otherExamples = [], mlReservedDropped = 0, mlExcluded = new Set(), mlEval = null;
getPref('ml.excluded').then((v) => { mlExcluded = new Set(v || []); }).catch(() => {});

/* ───────────── sections ───────────── */

/**
 * V0.1: `file` holds the original picture at full resolution — in memory (`blob`) only until it is written to the
 * image store (`key`). `crop` is the kept area in full-resolution pixels of the unrotated file (null = whole file);
 * `full` the file size. The working image is rotate(downsample(crop(file), ds), rot); it is decoded only while needed.
 * `labels`/`exclude` are packed (RLE) when the section is not in use and unpacked on first access.
 */
function newSection({ name, file, w, h, orig, ds = 1, labels = null, exclude = null, full = null }) {
  if (file.bytes && !file.blob) { file = { name: file.name, type: file.type, blob: new Blob([file.bytes], { type: file.type || 'image/jpeg' }) }; }
  const s = {
    id: uid(), name, file, rot: 0, ds, crop: null, full, logVer: 0, w, h, orig, enh: null,
    objects: new Map(), nextId: 1, stacks: [null],   // V0.20: overlapping traces (core.js)
    top: 0, bottom: 100, units: 'cm', roi: { x0: 0, y0: 0, x1: w, y1: h }, marks: [],
    filters: { ...DEFAULT_FILTERS }, preset: 'none', detect: { ...DEFAULT_DETECT }, manual: [], bins: [], view: null,
  };
  lazyMask(s, 'labels', Int32Array, labels); lazyMask(s, 'exclude', Uint8Array, exclude);
  enhance(s);
  if (orig) pxTouch(s);
  return s;
}

/* ───────────── V0.1: images on disk, pixels in memory only while a section is in use ───────────── */
const MEM = { px: [], mask: [], pinned: new Set(), pxBudget: 9e8, maskBudget: 5e8 };
/** A mask layer stored packed (RLE array) and unpacked on first access; `init` = array, { rle } or null (empty). */
function lazyMask(s, key, Type, init) {
  let arr = init && !init.rle ? init : null, rle = init?.rle || null;
  if (!arr && !rle) arr = new Type(s.w * s.h);
  Object.defineProperty(s, key, {
    enumerable: true, configurable: true,
    get() { if (!arr) { arr = rleDecode(rle, s.w * s.h, Type); rle = null; maskTouch(s); } return arr; },
    set(v) { arr = v; rle = null; s._mv = (s._mv || 0) + 1; },
  });
  // V0.2: the RLE of an unchanged mask is reused (saving no longer re-encodes every section every time)
  let cache = null;
  const enc = () => { if (rle) return rle; const v = `${s._mv || 0}|${s.w}x${s.h}`; if (cache?.v !== v) cache = { v, rle: rleEncode(arr) }; return cache.rle; };
  (s._mk ||= {})[key] = { pack() { if (arr) { rle = enc(); arr = null; } }, rle: enc, loaded: () => !!arr };
}
const lruPush = (list, s) => { const i = list.indexOf(s); if (i >= 0) list.splice(i, 1); list.push(s); };
const keepLoaded = (s) => s === sec() || MEM.pinned.has(s) || s._loading;
function maskTouch(s) {
  lruPush(MEM.mask, s);
  const bytes = () => MEM.mask.reduce((a, x) => a + 5 * x.w * x.h, 0);
  for (let i = 0; i < MEM.mask.length && MEM.mask.length > 3 && bytes() > MEM.maskBudget;) {
    const x = MEM.mask[i];
    if (x === s || keepLoaded(x)) { i++; continue; }
    x._mk.labels.pack(); x._mk.exclude.pack(); MEM.mask.splice(i, 1);
  }
}
function pxTouch(s) {
  lruPush(MEM.px, s);
  // V0.41: besides original + enhanced (8 B/px) it counts the U-Net probabilities (4 B/px) and the cached pictures
  const cv = (c) => (c ? 4 * c.width * c.height : 0);
  const one = (x) => 8 * x.w * x.h + (x._unet?.prob?.byteLength || 0) + cv(x._lc?.canvas) + cv(x._lb?.canvas) + [...(x._fc?.values() || [])].reduce((a, r) => a + cv(r.canvas), 0);
  const bytes = () => MEM.px.reduce((a, x) => a + one(x), 0);
  for (let i = 0; i < MEM.px.length && MEM.px.length > 1 && bytes() > MEM.pxBudget;) {
    const x = MEM.px[i];
    if (x === s || keepLoaded(x)) { i++; continue; }
    x.orig = null; x.enh = null; x._unet = null; x._fc = null; MEM.px.splice(i, 1);
  }
}
/** The original file of a section as a Blob (from memory if not yet stored, else from the image store on disk). */
async function sectionBlob(s) {
  if (s.file.blob) return s.file.blob;
  const b = s.file.key ? await getImage(s.file.key) : null;
  if (!b) throw new Error(t('err.imgMissing', { n: s.name }));
  return b;
}
/** Working image of a section at factor k (crop and rotation applied). */
async function decodeWorking(s, k) {
  let { w, h, rgba, fw, fh } = await decodeBytes(await sectionBlob(s), s.file.name, s.file.type, { k, crop: s.crop });
  for (let r = 0; r < ((s.rot % 4) + 4) % 4; r++) { rgba = rotate90(rgba, w, h, 4, 1); [w, h] = [h, w]; }
  if (!s.full) s.full = { w: fw, h: fh };
  return { w, h, rgba };
}
/** Decode the pixels of a section if they are not in memory. */
function ensurePixels(s) {
  if (s.orig) { pxTouch(s); return Promise.resolve(s); }
  if (s._loading) return s._loading;
  s._loading = (async () => {
    const r = await decodeWorking(s, s.ds);
    if (r.w !== s.w || r.h !== s.h) console.warn('image size differs from the stored masks', s.name, r.w, r.h, s.w, s.h);
    // V0.44: the enhancement of a section being opened is computed in the worker; orig and enh are set together
    const f = effectiveFilters({ filters: s.filters, orig: r.rgba, w: r.w, h: r.h, roi: s.roi });
    const enh = await offload('filters', { rgba: r.rgba, w: r.w, h: r.h, f }, () => applyFilters(r.rgba, r.w, r.h, f));
    s.orig = r.rgba; s.enh = enh;
    return s;
  })().catch((e) => { s._pxErr = e.message || String(e); toast(s._pxErr); throw e; }).finally(() => { s._loading = null; if (s.orig) pxTouch(s); });
  return s._loading;
}
/** Sections whose pictures a view asked for while they were not in memory: loaded two at a time, then the views redrawn. */
const pxWanted = new Set(); let pxBusy = false;
export function needPixels(s) { if (s._pxErr) return; pxWanted.add(s); if (!pxBusy) setTimeout(loadWanted, 0); }
async function loadWanted() {
  if (pxBusy) return; pxBusy = true;
  try {
    while (pxWanted.size) {
      const batch = [...pxWanted].slice(0, 2); batch.forEach((x) => pxWanted.delete(x));
      for (const x of batch) { MEM.pinned.add(x); try { await ensurePixels(x); } catch (e) { console.error(e); } }
      try { rerenderPixelViews(); } finally { batch.forEach((x) => MEM.pinned.delete(x)); }
    }
  } finally { pxBusy = false; }
}
function rerenderPixelViews() {
  requestRender();
  if (mode === 'log') renderLog();
  if (mode === 'fig') { renderFigPanel(); renderFigure(); }
}
/** Run fn(s) with the section's pixels in memory (they may be released afterwards). */
async function withPixels(s, fn) { MEM.pinned.add(s); try { await ensurePixels(s); return await fn(s); } finally { MEM.pinned.delete(s); } }
/** Write to the image store the originals that are still only in memory (new or legacy sections). */
async function storePendingImages() {
  for (const c of S.cores) for (const s of c.sections) {
    if (s.file.key || !s.file.blob) continue;
    const key = 'img_' + uid();
    await putImage(key, s.file.blob);
    s.file = { name: s.file.name, type: s.file.type, key, size: s.file.blob.size };
  }
}
/**
 * Replace inline images (bytes / base64) of a project file by references to the image store. V0.8: images of a
 * package or project folder (`file.path`) are read with getBlob(path).
 */
async function internImages(p, getBlob = null) {
  for (const c of p.cores || [{ sections: p.sections }]) for (const q of c.sections || []) {
    if (q.file.path && getBlob) {
      const blob = await getBlob(q.file.path); if (!blob) throw new Error(t('err.imgMissing', { n: q.name }));
      const b = new Blob([blob], { type: q.file.type || 'image/jpeg' });
      if (storageOK) { const key = 'img_' + uid(); await putImage(key, b); q.file = { name: q.file.name, type: q.file.type, key, size: b.size }; }
      else q.file = { name: q.file.name, type: q.file.type, blob: b };
      continue;
    }
    if (!storageOK) continue;
    if (q.file.key || !(q.file.bytes || q.file.b64)) continue;
    const bytes = q.file.bytes ? new Uint8Array(q.file.bytes) : b64decode(q.file.b64), key = 'img_' + uid();
    await putImage(key, new Blob([bytes], { type: q.file.type || 'image/jpeg' }));
    q.file = { name: q.file.name, type: q.file.type, key, size: bytes.length };
  }
  return p;
}

function effectiveFilters(s) {
  const f = s.filters; if ((!f.autoLevels && !f.autoGamma) || !s.orig) return f;
  const a = autoLevels(s.orig, s.w, s.h, s.roi), out = { ...f };
  if (f.autoLevels) { out.blackPoint = a.blackPoint; out.whitePoint = a.whitePoint; }
  if (f.autoGamma) out.gamma = +gammaForMedian(a.median, out.blackPoint, out.whitePoint).toFixed(2);
  return out;
}
function enhance(s) { s.enh = s.orig ? applyFilters(s.orig, s.w, s.h, effectiveFilters(s)) : null; }

/* V0.41: background worker for enhancement and detection; without it (offline single file, file://, old browser)
 * the same functions run on the main thread. */
let WK = null, wkSeq = 0; const wkWait = new Map();
function worker() {
  if (WK !== null) return WK || null;
  try {
    if (location.protocol === 'file:' || typeof Worker === 'undefined') throw new Error('no worker');
    WK = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    WK.onmessage = (e) => { const q = wkWait.get(e.data.id); if (!q) return; wkWait.delete(e.data.id); e.data.err ? q.rej(new Error(e.data.err)) : q.res(e.data.r); };
    WK.onerror = (e) => { e.preventDefault?.(); for (const q of wkWait.values()) q.fallback(); wkWait.clear(); WK.terminate(); WK = false; };
  } catch { WK = false; }
  return WK || null;
}
/** Runs op in the worker (inputs are copied) or, if there is none or it fails to start, fallback() here. */
function offload(op, a, fallback) {
  const w = worker(); if (!w) return Promise.resolve().then(fallback);
  return new Promise((res, rej) => {
    const id = ++wkSeq;
    wkWait.set(id, { res, rej, fallback: () => { try { res(fallback()); } catch (e) { rej(e); } } });
    w.postMessage({ id, op, a });
  });
}
/** Enhancement in the background; only the latest request of a section is applied. */
function enhanceAsync(s) {
  if (!s.orig) { s.enh = null; return Promise.resolve(); }
  const f = effectiveFilters(s), gen = (s._eg = (s._eg || 0) + 1), orig = s.orig;
  return offload('filters', { rgba: orig, w: s.w, h: s.h, f }, () => applyFilters(orig, s.w, s.h, f)).then((r) => { if (s._eg === gen && s.orig === orig) s.enh = r; return s._eg === gen; });
}

export function pxPerCm(s) {
  const span = (s.bottom - s.top) * UNIT_TO_CM[s.units];
  return span > 0 ? (s.roi.y1 - s.roi.y0) / span : 1;
}
export const depthAtRow = (s, row) => s.top + ((row - s.roi.y0) / (s.roi.y1 - s.roi.y0)) * (s.bottom - s.top);
export const rowAtDepth = (s, d) => s.roi.y0 + ((d - s.top) / (s.bottom - s.top)) * (s.roi.y1 - s.roi.y0);

/* ───────────── image files ───────────── */

/** V0.14: the libraries ship with the program (app/vendor); the internet copy is only a fallback (e.g. single offline file). */
const ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';   // V0.15: U-Net engine (desktop build copies it to vendor/ort)
// V0.40: internet fallback pinned with Subresource Integrity (hashes of the npm files that jsDelivr serves; the
// bundled copies in app/vendor are byte-identical). V0.45: SheetJS is verified against its official CDN build.
const VENDOR = {
  'pako.min.js': ['https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', 'sha384-rNlaE5fs9dGIjmxWDALQh/RBAaGRYT5ChrzHo6tRfgrZ36iRFAiquP5g41Jsv+0j'],
  'UTIF.js': ['https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js', 'sha384-RyBmXHdfZ/Uon+ud+/AqSyWpUWnKYt2tkRG/P4gWoRUGDU+qIAV3tGBPNlYTBZEF'],
  'xlsx.full.min.js': ['https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT'],
  'ort/ort.wasm.min.js': [ORT_CDN + 'ort.wasm.min.js', 'sha384-tNxIwEqSlcdvKtUte98AsccPbDKM958LBXB/+3BLS42TTihXHKTWgdqPqXI/lot8'],
};
/** Loads a library from app/vendor, else from the internet; resolves to 'local' or 'cdn'. */
function loadLib(file) { return loadScript(`vendor/${file}`).then(() => 'local', () => loadScript(...VENDOR[file]).then(() => 'cdn')); }
function loadScript(src, integrity = null) {
  return new Promise((res, rej) => {
    const el = document.createElement('script'); el.src = src; el.onload = res;
    if (integrity) { el.integrity = integrity; el.crossOrigin = 'anonymous'; }
    el.onerror = () => rej(new Error('library unavailable: ' + src)); document.head.appendChild(el);
  });
}

/**
 * Decode an image file (Blob or bytes) to the working image: optional crop (full-resolution pixels) and block
 * averaging by factor k (given, or chosen from maxMP). Returns { w, h, rgba, k, fw, fh } (fw × fh = file size).
 */
async function decodeBytes(bytes, name, type, opt = {}) {
  const factor = (w, h) => opt.k ?? Math.max(1, Math.ceil(Math.sqrt((w * h) / ((opt.maxMP || 1e9) * 1e6))));
  const area = (fw, fh) => { const c = opt.crop; return c ? { x: Math.max(0, c.x0), y: Math.max(0, c.y0), w: Math.min(fw, c.x1) - Math.max(0, c.x0), h: Math.min(fh, c.y1) - Math.max(0, c.y0) } : { x: 0, y: 0, w: fw, h: fh }; };
  if (/\.tiff?$/i.test(name) || /tiff/.test(type || '')) {
    if (bytes instanceof Blob) bytes = new Uint8Array(await bytes.arrayBuffer());
    if (!window.UTIF) {
      await loadLib('pako.min.js').catch(() => {});
      await loadLib('UTIF.js');
    }
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const ifds = window.UTIF.decode(buf);
    window.UTIF.decodeImage(buf, ifds[0], ifds);
    const fw = ifds[0].width, fh = ifds[0].height, A = area(fw, fh), k = factor(A.w, A.h);
    let rgba = window.UTIF.toRGBA8(ifds[0]);
    rgba = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length);
    if (opt.crop) { const sub = new Uint8ClampedArray(A.w * A.h * 4); for (let y = 0; y < A.h; y++) sub.set(rgba.subarray(((A.y + y) * fw + A.x) * 4, ((A.y + y) * fw + A.x + A.w) * 4), y * A.w * 4); rgba = sub; }
    const r = downsampleRGBA(rgba, A.w, A.h, k);
    return { ...r, k, fw, fh };
  }
  const url = URL.createObjectURL(bytes instanceof Blob ? bytes : new Blob([bytes], { type: type || 'image/jpeg' }));
  try {
    const img = new Image(); img.src = url; await img.decode();
    const fw = img.naturalWidth, fh = img.naturalHeight, A = area(fw, fh), w = A.w, h = A.h, k = factor(w, h);
    const W = Math.floor(w / k), Hh = Math.floor(h / k), out = new Uint8ClampedArray(W * Hh * 4);
    const stripH = Math.max(k, Math.floor(Math.min(h, 4e6 / w) / k) * k);
    const c = document.createElement('canvas'); c.width = w; c.height = stripH;
    const x = c.getContext('2d', { willReadFrequently: true });
    for (let y = 0; y < Hh * k; y += stripH) {
      const sh = Math.min(stripH, Hh * k - y);
      x.clearRect(0, 0, w, stripH); x.drawImage(img, A.x, A.y + y, w, sh, 0, 0, w, sh);
      out.set(downsampleRGBA(x.getImageData(0, 0, w, sh).data, w, sh, k).rgba, (y / k) * W * 4);
    }
    c.width = c.height = 0;
    return { w: W, h: Hh, rgba: out, k, fw, fh };
  } finally { URL.revokeObjectURL(url); }
}

function b64decode(str) { const s = atob(str), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }

/**
 * V0.2: images are always added to a project and to a core chosen by the user (asked each time).
 * Returns the core id, or null if cancelled.
 */
function pickCore(n) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    const opts = S.cores.map((c) => `<option value="${c.id}" ${c.id === S.curCore ? 'selected' : ''}>${esc(c.name)} (${t('home.nImg', { n: c.sections.length })})</option>`).join('');
    dlg.innerHTML = `<form method="dialog" style="display:grid;gap:10px;min-width:320px"><h3 style="margin:0">${esc(t('sec.pickCoreTitle', { n }))}</h3>
      <label class="f"><span>${esc(t('sec.pickCore'))}</span><select id="pcSel">${opts}<option value="__new">${esc(t('sec.newCore'))}</option></select></label>
      <label class="f" id="pcNewBox" hidden><span>${esc(t('sec.newCoreName'))}</span><input type="text" id="pcNew"></label>
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" value="cancel">${esc(t('cl.cancel'))}</button><button class="btn primary" value="ok" id="pcOk">${esc(t('sec.addHere'))}</button></div></form>`;
    document.body.appendChild(dlg);
    const sel = dlg.querySelector('#pcSel'), box = dlg.querySelector('#pcNewBox'), inp = dlg.querySelector('#pcNew');
    sel.addEventListener('change', () => { box.hidden = sel.value !== '__new'; if (!box.hidden) inp.focus(); });
    dlg.addEventListener('close', () => {
      let id = null;
      if (dlg.returnValue === 'ok') {
        if (sel.value === '__new') { const name = inp.value.trim(); if (name) { const c = makeCore({ name }); S.cores.push(c); id = c.id; } }
        else id = sel.value;
      }
      dlg.remove(); resolve(id);
    });
    dlg.showModal();
  });
}
async function addFiles(files) {
  if (!files.length) return;
  if (blankStart) { toast(t('sec.needProject')); await showHome(); $('newProjOpen').click(); return; }   // V0.2: no images outside a project
  const coreId = await pickCore(files.length); if (!coreId) return;
  if (coreId !== S.curCore) activateCore(coreId);
  for (const file of files) {
    await busy(async () => {
      try {
        const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'image/jpeg' });
        const { w, h, rgba, k, fw, fh } = await decodeBytes(blob, file.name, file.type, { maxMP: S.settings.maxMP });
        const s = newSection({ name: file.name.replace(/\.[^.]+$/, ''), file: { name: file.name, type: file.type, blob }, w, h, orig: rgba, ds: k, full: { w: fw, h: fh } });
        const prev = sec();
        if (prev) { s.units = prev.units; s.top = prev.bottom; s.bottom = prev.bottom + (prev.bottom - prev.top); s.filters = { ...prev.filters }; s.preset = prev.preset; s.detect = { ...prev.detect }; enhance(s); }
        S.sections.push(s);
        selectSection(S.sections.length - 1, true); markDirty();
      } catch (e) { toast(t('err.image', { m: e.message || e })); }
    });
  }
  if (files.length === 1 && sec()) startCrop();   // V31: offer to cut scale bars or labels off a new image
}

async function loadExample() {
  for (const url of ['data/idealized_core_0-500cm.jpg']) {
    try {
      const bytes = new Uint8Array(await (await fetchAsset(url)).arrayBuffer());
      await flushSave(); resetState(); S.name = t('example.name');
      const { w, h, rgba } = await decodeBytes(bytes, url, 'image/jpeg', { k: 1 });
      const s = newSection({ name: t('example.name'), file: { name: 'idealized_core_0-500cm.jpg', type: 'image/jpeg', bytes }, w, h, orig: rgba, full: { w, h } });
      s.top = 0; s.bottom = 500; s.units = 'cm';
      s.detect = { ...DEFAULT_DETECT, method: 'global', polarity: 'dark', threshold: 6, minArea: 1, smooth: 0 };
      S.settings.binCm = 150 / pxPerCm(s);
      S.sections.push(s); syncSettingsForm(); selectSection(S.sections.length - 1, true);
      await detectSection(s); updateProjHeader(); renderRecList(); setAge(); await saveToDB();
      return true;
    } catch { /* try next */ }
  }
  return false;
}

/* ───────────── objects, undo ───────────── */

function newObject(s, cls, src) {
  const o = { id: s.nextId++, cls: cls || null, pred: null, conf: 0, src, area: 0, bbox: null, stats: null, feat: null };
  s.objects.set(o.id, o);
  return o;
}

function status(o) {
  if (o.cls) return 'labeled';
  if (o.pred && o.conf >= S.settings.predThr) return 'predicted';
  return 'candidate';
}

export function effClassId(o) {
  if (o.cls) return o.cls;
  if (S.settings.includePred && o.pred && o.conf >= S.settings.predThr) return o.pred;
  return S.settings.countCandidates ? 'undet' : null;
}

function refreshObjects(s, ids, region) {
  if (!s.orig) return;   // V0.1: stats are kept from the last time the pixels were in memory
  const R = region ? { x0: Math.max(0, region.x0), y0: Math.max(0, region.y0), x1: Math.min(s.w, region.x1), y1: Math.min(s.h, region.y1) } : null;
  const acc = objectStats(s.labels, s.w, s.h, s.orig, ids, R, s.stacks), ppu = pxPerCm(s);
  for (const id of ids) {
    const a = acc.get(id), o = s.objects.get(id);
    if (!o) continue;
    if (!a) { s.objects.delete(id); if (S.selected === id) S.selected = 0; continue; }
    if (o.emb && (a.n !== o.area || a.x0 !== o.bbox?.[0] || a.y0 !== o.bbox?.[1] || a.x1 !== o.bbox?.[2] || a.y1 !== o.bbox?.[3])) o.emb = null;   // V0.17: the trace changed
    o.area = a.n; o.bbox = [a.x0, a.y0, a.x1, a.y1]; o.stats = a; o.feat = features(a, ppu);
  }
}

function recomputeFeatures(s) { const ppu = pxPerCm(s); for (const o of s.objects.values()) if (o.stats) o.feat = features(o.stats, ppu); }

function beginOp(s) {
  s._mv = (s._mv || 0) + 1;   // V0.2: invalidates cached row counts and packed masks
  return { s, lm: [], ex: [], objs: [...s.objects.values()].map((o) => ({ ...o })), nextId: s.nextId, sel: S.selected, ext: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, touched: new Set() };
}
function setLabel(op, i, v) { const L = op.s.labels, o = L[i]; if (o !== v) { for (const id of idsAt(o, op.s.stacks)) op.touched.add(id); op.lm.push(i, o); L[i] = v; } }
/* V0.20: overlapping traces. With «Superponer» a new trace keeps what is underneath; without it, it replaces it (as before). */
const six = (s) => s._six || (s._six = stackIndex(s.stacks));
const topLab = (s, i) => topAt(s.labels[i], s.stacks);
/** V0.30: traces only overlap when their ichnotaxa differ; a trace of the same ichnotaxon underneath gives way to the new one. */
const clsKey = (s, id) => s.objects.get(id)?.cls ?? null;
const addPx = (op, i, id) => {
  const s = op.s, o = s.labels[i];
  if (!S.overlap) { if (o && o !== id) op.replaced = true; setLabel(op, i, id); return; }
  if (!o || o === id) { setLabel(op, i, id); return; }
  const c = clsKey(s, id), keep = idsAt(o, s.stacks).filter((x) => x !== id && clsKey(s, x) !== c);
  setLabel(op, i, codeFor([...keep, id], s.stacks, six(s)));
};
/** V0.30: after a class change, traces of the same ichnotaxon that overlap are merged into one. */
function mergeSameTaxon(s, ids) {
  for (const g of sameTaxonGroups(s.labels, s.w, s.stacks, s.objects, ids)) if (g.every((id) => s.objects.has(id))) mergeObjects(g);   // V0.42: edit.js
}
const subPx = (op, i, id) => setLabel(op, i, withoutId(op.s.labels[i], id, op.s.stacks, six(op.s)));
/** Remove a set of ids from every pixel. */
function dropIds(op, set) {
  const s = op.s, L = s.labels, st = s.stacks, w = s.w;
  // V0.44: only the union of the objects' rectangles is scanned (kept up to date by refreshObjects); a missing
  // rectangle falls back to the whole image
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const id of set) { const b = s.objects.get(id)?.bbox; if (!b) { x0 = 0; y0 = 0; x1 = w - 1; y1 = s.h - 1; break; } x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w - 1, x1); y1 = Math.min(s.h - 1, y1);
  for (let y = y0; y <= y1; y++) for (let i = y * w + x0, e = y * w + x1; i <= e; i++) {
    const v = L[i]; if (!v) continue;
    if (v > 0) { if (set.has(v)) setLabel(op, i, 0); }
    else if (st[-v].some((x) => set.has(x))) setLabel(op, i, codeFor(st[-v].filter((x) => !set.has(x)), st, six(s)));
  }
}
function setEx(op, i, v) { const E = op.s.exclude; if (E[i] !== v) { op.ex.push(i, E[i]); E[i] = v; } }
function grow(op, x, y) { const e = op.ext; if (x < e.x0) e.x0 = x; if (y < e.y0) e.y0 = y; if (x > e.x1) e.x1 = x; if (y > e.y1) e.y1 = y; }

let ovHint = false;
function finishPixelOp(op, target = 0) {
  const s = op.s;
  if (op.replaced && !ovHint) { ovHint = true; toast(t('ov.hint')); }   // V0.29: the user may have wanted the traces to overlap
  if (target) op.touched.add(target);
  if (op.touched.size) {
    const R = { ...op.ext };
    for (const o of op.objs) if (op.touched.has(o.id) && o.bbox) { R.x0 = Math.min(R.x0, o.bbox[0]); R.y0 = Math.min(R.y0, o.bbox[1]); R.x1 = Math.max(R.x1, o.bbox[2]); R.y1 = Math.max(R.y1, o.bbox[3]); }
    refreshObjects(s, op.touched, { x0: R.x0, y0: R.y0, x1: R.x1 + 1, y1: R.y1 + 1 });
  }
  for (const o of [...s.objects.values()]) if (!o.area) s.objects.delete(o.id); // created but empty
  commitOp(op);
  afterChange(s);
}

function commitOp(op, force = false) {
  if (!force && !op.lm.length && !op.ex.length) return;
  S.undo.push(op); if (S.undo.length > 30) S.undo.shift();
  // V0.41: the undo history also has a memory budget (~200 MB of changed pixels); the oldest steps go first
  const ub = (o) => 8 * ((o.lm?.length || 0) + (o.ex?.length || 0));
  let tot = S.undo.reduce((a, o) => a + ub(o), 0);
  while (S.undo.length > 1 && tot > 2e8) tot -= ub(S.undo.shift());
  $('undoBtn').disabled = false;
}

function undo() {
  const op = S.undo.pop(); if (!op) return;
  // V0.36: steps made together (e.g. assigning a class that joins traces of the same ichnotaxon) are undone together
  if (op.group && S.undo[S.undo.length - 1]?.group === op.group) { undoOne(op); undo(); return; }
  undoOne(op);
}
function undoOne(op) {
  const s = op.s;
  undoPixels(s.labels, s.exclude, op.lm, op.ex);   // V0.42: edit.js
  s.objects = new Map(op.objs.map((o) => [o.id, o])); s.nextId = op.nextId; S.selected = op.sel;
  $('undoBtn').disabled = !S.undo.length;
  if (s !== sec()) selectSection(S.sections.indexOf(s));
  afterChange(s);
}

function afterChange(s) { s._mv = (s._mv || 0) + 1; s.logVer = (s.logVer || 0) + 1; markDirty(); scheduleLog(); rebuildLUT(s); scheduleLearn(); scheduleAnalysis(); renderClasses(); renderObject(); requestRender(); scheduleEmbed(s); }

/* pixel-set edits from wand and lasso */
function applyPixels(pixels, mode) {
  const s = sec(); if (!pixels.length) return;
  const op = beginOp(s);
  let target = 0;
  if (mode === 'sub') target = 0;
  else if (mode === 'add' && S.selected && s.objects.has(S.selected)) target = S.selected;
  else target = newObject(s, S.active, S.tool).id;
  for (const i of pixels) {
    grow(op, i % s.w, (i / s.w) | 0);
    const old = s.labels[i];
    if (mode === 'sub') { if (old) { if (S.selected) { if (hasId(old, S.selected, s.stacks)) subPx(op, i, S.selected); } else setLabel(op, i, 0); } }
    else addPx(op, i, target);
  }
  finishPixelOp(op, target);
  if (target && s.objects.has(target)) select(target);
}

function deleteObject(id) { deleteObjects([id]); }
function deleteObjects(ids) {
  const s = sec(); if (!s) return;
  const objs = ids.map((id) => s.objects.get(id)).filter((o) => o?.bbox); if (!objs.length) return;
  const op = beginOp(s);
  for (const o of objs) {
    const [x0, y0, x1, y1] = o.bbox;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * s.w + x; if (hasId(s.labels[i], o.id, s.stacks)) subPx(op, i, o.id); }
    s.objects.delete(o.id);
  }
  S.selected = 0; S.multi.clear();
  commitOp(op, true); afterChange(s);
}

function assignClass(id, clsId) { assignClassMany([id], clsId); }
/** Assign one class to one or several objects (one undo step). The view does not move unless "jump to next" is on. */
function assignClassMany(ids, clsId) {
  const s = sec(); if (!s) return;
  const objs = ids.map((id) => s.objects.get(id)).filter(Boolean); if (!objs.length) return;
  const op = beginOp(s);
  for (const o of objs) { o.cls = clsId; o.pred = null; o.conf = 0; }
  const grp = op.group = uid();   // V0.36
  commitOp(op, true); afterChange(s);
  const n0 = S.undo.length; mergeSameTaxon(s, objs.map((o) => o.id));   // V0.30
  for (let k = n0; k < S.undo.length; k++) S.undo[k].group = grp;
  if (objs.length === 1 && $('autoNext').checked) nextReview();
}
/** Objects selected now: the multi-selection if any, else the single selected object. */
function selectedIds() { const s = sec(); if (!s) return []; const ids = S.multi.size ? [...S.multi] : S.selected ? [S.selected] : []; return ids.filter((id) => s.objects.has(id)); }

/* ───────────── V0.20: split a trace along a drawn line (scissors) and merge traces ───────────── */
/** Pixels of a 3-px-wide polyline (indices). */
function linePixels(s, pts) {
  const out = new Set();
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let q = 0; q <= n; q++) {
      const cx = ax + ((bx - ax) * q) / n, cy = ay + ((by - ay) * q) / n;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy;
        if (x >= 0 && y >= 0 && x < s.w && y < s.h) out.add(y * s.w + x);
      }
    }
  }
  return out;
}
function splitAlong(pts) {
  const s = sec(); if (!s || !pts || pts.length < 2) return;
  const cut = linePixels(s, pts), L = s.labels, st = s.stacks;
  let id = 0;
  if (S.selected && [...cut].some((i) => hasId(L[i], S.selected, st))) id = S.selected;
  else for (const i of cut) { const v = topAt(L[i], st); if (v) { id = v; break; } }
  const o = id && s.objects.get(id);
  if (!o?.bbox) { toast(t('cut.none')); return; }
  const [x0, y0] = o.bbox, { comp, bw, n, main } = splitPieces(L, s.w, st, o.bbox, id, cut);   // V0.42: edit.js
  if (n < 2) { toast(t('cut.noSplit')); return; }
  const op = beginOp(s), ids = [0];
  for (let k = 1; k <= n; k++) ids.push(k === main ? id : newObject(s, o.cls, o.src).id);
  for (let k = 1; k <= n; k++) if (k !== main) { const c = s.objects.get(ids[k]); c.pred = o.pred; c.conf = o.conf; c.nt = o.nt; op.touched.add(ids[k]); }
  for (let j = 0; j < comp.length; j++) {
    const k = comp[j]; if (k <= 0 || k === main) continue;
    const i = (y0 + ((j / bw) | 0)) * s.w + x0 + (j % bw); grow(op, i % s.w, (i / s.w) | 0);
    setLabel(op, i, renameId(L[i], id, ids[k], st, six(s)));
  }
  finishPixelOp(op, id);
  toast(t('cut.done', { n }));
}
/** Merge the selected traces into one (the largest with a class given by hand, else the largest, keeps its id and class). */
function mergeObjects(list) {
  const s = sec(); if (!s) return;
  const objs = list.map((id) => s.objects.get(id)).filter((o) => o?.bbox); if (objs.length < 2) return;
  const keep = mergeKeeper(objs), L = s.labels, st = s.stacks;   // V0.42: edit.js
  const op = beginOp(s);
  for (const o of objs) {
    if (o === keep) continue;
    const [x0, y0, x1, y1] = o.bbox; grow(op, x0, y0); grow(op, x1, y1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * s.w + x; if (hasId(L[i], o.id, st)) setLabel(op, i, renameId(L[i], o.id, keep.id, st, six(s))); }
  }
  S.multi.clear();
  finishPixelOp(op, keep.id);
  select(keep.id);
}

/* ───────────── detection ───────────── */

function runDetection() {
  const s = sec(); if (!s) return;
  if (s.detect.method !== 'unet') { busy(() => withPixels(s, detectSection)); return; }
  if (!UNET) { $('detectStatus').textContent = t('u.noModel'); return; }
  busy(() => withPixels(s, async (x) => { await unetProb(x); await detectSection(x); }));
}

/* ───────────── V0.15: U-Net (model trained with `sedcoretool unet train`, run with ONNX Runtime Web) ───────────── */
let UNET = null;   // { session, cfg, name, id }
const unetKey = (s) => UNET ? `${UNET.id}|${s.roi.x0},${s.roi.y0},${s.roi.x1},${s.roi.y1}|${s.w}x${s.h}|${pxPerCm(s).toFixed(4)}` : '';
async function loadOrt() {
  if (window.ort) return;
  const where = await loadLib('ort/ort.wasm.min.js');
  window.ort.env.wasm.wasmPaths = where === 'local' ? new URL('vendor/ort/', location.href).href : ORT_CDN;
  window.ort.env.wasm.numThreads = 1;   // works without cross-origin isolation (single file, browser, desktop)
}
/** Model files chosen by the user: the .onnx network and, optionally, the .json written next to it in training. */
async function loadUnet(files) {
  const onnx = files.find((f) => /\.onnx$/i.test(f.name)), js = files.find((f) => /\.json$/i.test(f.name));
  if (!onnx) { toast(t('u.needOnnx')); return; }
  await loadUnetBytes(new Uint8Array(await onnx.arrayBuffer()), js ? await js.text() : null, onnx.name);
}
/** V0.17: also used for models trained in the desktop program. */
async function loadUnetBytes(bytes, json, name) {
  await busy(async () => {
    try {
      await loadOrt();
      const cfg = { ...UNET_DEFAULTS, ...(json ? JSON.parse(json) : {}) };
      const session = await window.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
      UNET = { session, cfg, name, id: uid() };
      for (const s of S.cores.flatMap((c) => c.sections)) s._unet = null;
      toast(t('u.loaded', { n: name }));
    } catch (e) { UNET = null; toast(t('u.loadErr') + ' ' + (e?.message || e)); }
    renderDetectForm();
  });
}

/* ───────────── V0.17: descriptors from a pre-trained vision model (DINOv2) for the ichnotaxon classifier ───────────── */
let VIS = null, embTimer = 0, embRunning = false;   // VIS = { session, src }
const VIS_CACHE = 'corantool-models';
async function visionCached() { try { const r = await (await caches.open(VIS_CACHE)).match(VISION_MODEL.url); return r ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; } }
/** Loads the vision model from a chosen file, from the local cache, or (download = true) from Hugging Face, then caches it. */
async function loadVision(file = null, download = false) {
  const work = async () => {
    try {
      await loadOrt();
      let bytes = file ? new Uint8Array(await file.arrayBuffer()) : await visionCached();
      if (!bytes && download) {
        const r = await fetch(VISION_MODEL.url); if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob(); bytes = new Uint8Array(await blob.arrayBuffer());
        try { await (await caches.open(VIS_CACHE)).put(VISION_MODEL.url, new Response(blob)); } catch { /* no cache here (single offline file) */ }
      }
      if (!bytes) return;
      // V0.38: SHA-256 of the model file; vectors from different files are not comparable
      let sha = null; try { sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((x) => x.toString(16).padStart(2, '0')).join(''); } catch { /* no WebCrypto (file://) */ }
      if (sha && VISION_MODEL.sha256 && sha !== VISION_MODEL.sha256 && !file) toast(t('vis.shaExpected'), 9000);
      const ml = (S.settings.ml ||= { ...ML_DEFAULT });
      if (sha && ml.visionSha && ml.visionSha !== sha) toast(t('vis.shaDiff', { a: ml.visionSha.slice(0, 12), b: sha.slice(0, 12) }), 10000);
      else if (sha && !ml.visionSha) { ml.visionSha = sha; markDirty(); }
      const session = await window.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
      VIS = { session, src: file ? file.name : VISION_MODEL.name, sha256: sha };
      if (file || download) toast(t('vis.loaded', { n: VIS.src }));
    } catch (e) { VIS = null; toast(t('vis.err') + ' ' + (e?.message || e)); }
  };
  if (file || download) await busy(work); else await work();
  if ($('mlDlg')?.open) renderMl();
}
const pendingEmb = (secs = S.cores.flatMap((c) => c.sections)) => secs.reduce((n, s) => n + [...s.objects.values()].filter((o) => o.bbox && !o.emb).length, 0);
/** Vector of every trace (with a bounding box) that has none yet, in the given sections. */
async function computeEmbeddings(secs, progress = null) {
  if (!VIS) await loadVision();
  if (!VIS || embRunning) return 0;
  embRunning = true;
  const { session } = VIS, inName = session.inputNames[0], Z = VISION_MODEL.size, tot = pendingEmb(secs);
  let k = 0;
  try {
    for (const s of secs) {
      const objs = [...s.objects.values()].filter((o) => o.bbox && !o.emb); if (!objs.length) continue;
      await withPixels(s, async () => {
        for (const o of objs) {
          if (!o.bbox || o.emb) continue;
          const r = await session.run({ [inName]: new window.ort.Tensor('float32', traceInput(s.orig, s.w, s.h, traceWindow(o.bbox, VISION_MODEL.pad)), [1, 3, Z, Z]) });
          o.emb = pickEmbedding(Object.fromEntries(Object.entries(r).map(([n, v]) => [n, { data: v.data, dims: v.dims }])), session.outputNames);
          if (progress) progress(++k, tot);
        }
      });
    }
  } finally { embRunning = false; }
  if (k) { markDirty(); learnNow(); }
  return k;
}
/** In vision mode, new or edited traces of the open image get their vector shortly after the change. */
function scheduleEmbed(s) {
  if (!visionOn() || !VIS || !s) return;
  clearTimeout(embTimer); embTimer = setTimeout(() => { if (pendingEmb([s])) computeEmbeddings([s]).catch(() => {}); }, 700);
}

/* ───────────── V0.17: training the U-Net on this computer (desktop program) ───────────── */
const DESK = window.corantoolDesktop?.trainer || null;
const TR = { status: null, log: [], prog: null, running: false, last: null };
if (DESK) DESK.onEvent((type, d) => {
  if (type === 'log') { TR.log.push(d); if (TR.log.length > 300) TR.log.splice(0, TR.log.length - 300); }
  else if (type === 'progress') TR.prog = d;
  else if (type === 'state') TR.running = !!d.busy;
  else if (type === 'done') { TR.last = d; trainDone(d).catch((err) => toast(t('err.generic', { e: err?.message || String(err) }), 8000)); }
  if ($('trainDlg')?.open) renderTrain();
});
async function trainDone(d) {
  const m = await DESK.readModel(d.name);
  await loadUnetBytes(new Uint8Array(m.onnx), m.json, m.name + '.onnx');
  TR.status = await DESK.status();
  if ($('trainDlg')?.open) renderTrain();
}
/** Cores with reviewed traces (the ones that go into the training ZIP). */
function trainCores() {
  return S.cores.map((c) => { const imgs = c.sections.filter((s) => [...s.objects.values()].some((o) => o.cls)); return { c, imgs: imgs.length, traces: imgs.reduce((n, s) => n + [...s.objects.values()].filter((o) => o.cls).length, 0) }; }).filter((r) => r.imgs);
}
async function openTrain() {
  renderTrain(); if (!$('trainDlg').open) $('trainDlg').showModal();
  if (DESK) { TR.status = await DESK.status().catch((e) => ({ error: String(e) })); renderTrain(); }
}
function renderTrain() {
  const box = $('trainBody');
  if (!DESK) { box.innerHTML = `<p>${t('tr.web')}</p>`; return; }
  const st = TR.status, roles = (S.settings.trainRoles ||= {}), cores = trainCores();
  let h = `<p class="note">${t('tr.intro')}</p><h3>1. ${t('tr.module')}</h3>`;
  if (!st) h += `<p class="note">${t('busy')}</p>`;
  else if (!st.installed) {
    h += st.python && st.error ? `<p class="note">${esc(st.error)}</p>` : '';
    h += st.system || st.python ? `<p>${t('tr.noModule', { v: st.system?.version || '' })}</p><button class="btn primary" id="trInstall" ${TR.running ? 'disabled' : ''}>${t('tr.install')}</button>`
      : `<p>${t('tr.noPython')}</p>`;
  } else h += `<p>${t('tr.device', { n: esc(st.device?.name || '?'), d: st.device?.device || '?' })}</p>${st.device?.device === 'cpu' ? `<p class="note">${t('tr.cpu')}</p>` : ''}`;
  h += `<h3>2. ${t('tr.data')}</h3>`;
  if (!cores.length) h += `<p class="note">${t('u.noReviewed')}</p>`;
  else h += `<p class="note">${t('tr.roles')}</p><table class="dtable mtab"><thead><tr><th>${t('tr.core')}</th><th>${t('tr.imgs')}</th><th>${t('tr.traces')}</th><th>${t('tr.role')}</th></tr></thead><tbody>${cores.map(({ c, imgs, traces }) => `<tr><td class="txt">${esc(c.name)}</td><td>${imgs}</td><td>${traces}</td><td><select data-trrole="${esc(c.name)}">${['auto', 'val', 'test'].map((r) => `<option value="${r}" ${(roles[c.name] || 'auto') === r ? 'selected' : ''}>${t('tr.r.' + r)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>`;
  const o = (S.settings.trainOpt ||= { name: safe(S.name || 'modelo'), epochs: 60, pretrained: true });
  h += `<h3>3. ${t('tr.train')}</h3><div class="row" style="align-items:end;gap:12px"><label class="f"><span>${t('tr.name')}</span><input type="text" data-tropt="name" value="${esc(o.name)}"></label>
    <label class="f"><span>${t('tr.epochs')}</span><input type="number" data-tropt="epochs" min="1" max="500" value="${o.epochs}" style="width:80px"></label>
    <label class="chk"><input type="checkbox" data-tropt="pretrained" ${o.pretrained ? 'checked' : ''}><span>${t('tr.pretrained')}</span></label></div>
    <div class="row">${TR.running ? `<button class="btn" id="trCancel">${t('tr.cancel')}</button>` : `<button class="btn primary" id="trGo" ${st?.installed && cores.length ? '' : 'disabled'}>${t('tr.go')}</button><button class="btn" id="trResume" ${st?.installed ? '' : 'disabled'}>${t('tr.resume')}</button>`}</div>`;
  if (TR.prog) { const p = TR.prog; h += `<p><progress max="${p.epochs}" value="${p.epoch}" style="width:100%"></progress><br>${t('tr.prog', { e: p.epoch, n: p.epochs, d: fmt(p.val_dice, 3), b: fmt(p.best, 3), be: p.best_epoch, dev: p.device })}</p>`; }
  if (TR.last?.evaluation) { const q = TR.last.evaluation.pooled; h += `<p><b>${t('tr.test', { c: TR.last.evaluation.cores.join(', '), d: fmt(q.dice, 3), i: fmt(q.iou, 3) })}</b></p>`; }
  if (TR.log.length) h += `<details ${TR.running ? 'open' : ''}><summary>${t('tr.log')}</summary><pre class="trlog">${esc(TR.log.slice(-60).join('\n'))}</pre></details>`;
  const ms = st?.models || [];
  h += `<h3>4. ${t('tr.models')}</h3>` + (ms.length ? `<table class="dtable mtab"><thead><tr><th>${t('tr.name')}</th><th>${t('tr.valDice')}</th><th>${t('tr.testDice')}</th><th>${t('tr.date')}</th><th></th></tr></thead><tbody>${ms.map((m) => `<tr><td class="txt">${esc(m.name)}</td><td>${m.valDice != null ? fmt(m.valDice, 3) : '—'}</td><td>${m.test ? fmt(m.test.dice, 3) : '—'}</td><td class="txt">${esc(m.date.slice(0, 16).replace('T', ' '))}</td><td><button class="btn small" data-truse="${esc(m.name)}">${t('tr.use')}</button></td></tr>`).join('')}</tbody></table>` : `<p class="note">${t('tr.noModels')}</p>`)
    + `<p><button class="btn small ghost" id="trFolder">${t('tr.folder')}</button></p><p class="note">${t('tr.explain')}</p>`;
  box.innerHTML = h;
}
async function startTrain(resume) {
  const o = S.settings.trainOpt, roles = S.settings.trainRoles || {};
  TR.log = []; TR.prog = null; TR.last = null;
  try {
    const opt = { name: o.name, epochs: o.epochs, pretrained: o.pretrained, resume };
    if (!resume) {
      const z = await buildTrainingZip(); if (!z) return;
      const names = trainCores().map((r) => r.c.name);
      Object.assign(opt, { zip: new Uint8Array(await z.arrayBuffer()), val: names.filter((n) => roles[n] === 'val'), test: names.filter((n) => roles[n] === 'test') });
    }
    TR.running = true; renderTrain();
    await DESK.train(opt);
  } catch (e) { TR.log.push('✕ ' + (String(e?.message || e).includes('cancelled') ? t('tr.cancelled') : e?.message || e)); TR.running = false; renderTrain(); }
}
/** Probability map of bioturbation for the section (cached until the model, the analysis area or the scale change). */
async function unetProb(s) {
  const key = unetKey(s); if (s._unet?.key === key) return s._unet;
  const { session, cfg } = UNET, inName = session.inputNames[0], outName = session.outputNames[0];
  const run = async (data, T) => { const r = await session.run({ [inName]: new window.ort.Tensor('float32', data, [1, 3, T, T]) }); const o = r[outName]; return { data: o.data, channels: o.dims[1] }; };
  const scale = cfg.pxPerCm ? cfg.pxPerCm / pxPerCm(s) : 1;
  const res = await predictProb(run, s.orig, s.w, s.h, s.roi, cfg, scale, (k, n) => { $('detectStatus').textContent = t('u.progress', { k, n }); });
  s._unet = { key, prob: res.prob };
  return s._unet;
}

async function detectSection(s) {
  {
    const p = s.detect, prob = p.method === 'unet' && s._unet?.key === unetKey(s) ? s._unet.prob : null;
    if (s._eg && !s.enh) enhance(s);
    // V0.41: mask and components in the background worker (same functions), then applied here
    const enh = s.enh, roi = { ...s.roi }, exclude = s.exclude;
    const { labels: cl, count } = await offload('detect', { enh, w: s.w, h: s.h, roi, exclude, p: { ...p }, prob },
      () => components(detectMask(enh, s.w, s.h, roi, exclude, p, prob), s.w, s.h, p.minArea));
    const op = beginOp(s), L = s.labels;
    const cand = new Set();
    for (const o of s.objects.values()) if (!o.cls && o.src === 'auto') cand.add(o.id);
    if (cand.size) {
      dropIds(op, cand);
      for (const id of cand) s.objects.delete(id);
      if (cand.has(S.selected)) S.selected = 0;
    }
    const base = s.nextId;
    for (let i = 0; i < L.length; i++) { const k = cl[i]; if (k && !L[i]) { op.lm.push(i, 0); L[i] = base + k - 1; } }
    const ids = new Set();
    for (let k = 0; k < count; k++) { const o = newObject(s, null, 'auto'); ids.add(o.id); }
    const acc = objectStats(L, s.w, s.h, s.orig, ids, null, s.stacks), ppu = pxPerCm(s);
    let kept = 0;
    for (const id of ids) {
      const a = acc.get(id), o = s.objects.get(id);
      if (!a || a.n < p.minArea) {
        if (a) for (let y = a.y0; y <= a.y1; y++) for (let x = a.x0; x <= a.x1; x++) { const i = y * s.w + x; if (L[i] === id) { op.lm.push(i, id); L[i] = 0; } }
        s.objects.delete(id); continue;
      }
      o.area = a.n; o.bbox = [a.x0, a.y0, a.x1, a.y1]; o.stats = a; o.feat = features(a, ppu); kept++;
    }
    commitOp(op, true);
    $('detectStatus').textContent = t('d.result', { n: kept });
    afterChange(s);
  }
}

function clearCandidates() {
  const s = sec(); if (!s) return;
  const op = beginOp(s), cand = new Set([...s.objects.values()].filter((o) => !o.cls).map((o) => o.id));
  dropIds(op, cand);
  for (const id of cand) s.objects.delete(id);
  if (cand.has(S.selected)) S.selected = 0;
  commitOp(op, true); $('detectStatus').textContent = ''; afterChange(s);
}

/* ───────────── learning ───────────── */

let learnTimer = 0, learnIdle = 0;
function scheduleLearn() { clearTimeout(learnTimer); learnTimer = setTimeout(learnNow, (S.settings.ml?.method || 'knn') === 'knn' ? 60 : 500); }
/** Labelled examples of this project with a stable key; objects marked «not for training» (o.nt) are left out. */
function ownExamples(cores, withExcluded = false, withHoldout = false) {
  const ex = [];
  for (const c of cores) if (withHoldout || !c.holdout) for (const s of c.sections) for (const o of s.objects.values()) if (o.cls && xOf(o) && (withExcluded || !o.nt)) {
    const k = clsById(o.cls); if (k) ex.push({ key: `${S.id}|${c.id}|${s.id}|${o.id}`, g: `${S.id}|${c.id}|${s.id}`, y: k.name, x: xOf(o), c, s, o });
  }
  return ex;
}
function mlSets() {
  const grp = (k) => String(k).split('|').slice(0, 3).join('|');
  // V0.49: traces of reserved cores (final test) never train nor enter model selection, wherever they come from
  const held = new Set(S.cores.filter((c) => c.holdout).map((c) => `${S.id}|${c.id}|`)), notHeld = (e) => ![...held].some((h) => String(e.key || '').startsWith(h));
  // V0.58: external examples that may come from a reserved core (same core id or name, or identical descriptors) are left out
  const heldCores = S.cores.filter((c) => c.holdout);
  const reserved = heldCores.length ? { ids: new Set(heldCores.map((c) => c.id)), names: new Set(heldCores.map((c) => String(c.name || '').trim().toLowerCase()).filter(Boolean)),
    sigs: new Set(ownExamples(heldCores, true, true).map((e) => descriptorSig(e.x))) } : null;
  const libFree = independentExternalExamples(S.library, reserved, xOfLib), otherFree = independentExternalExamples(otherExamples, reserved, xOfLib);
  mlReservedDropped = S.library.length - libFree.length + otherExamples.length - otherFree.length;
  const lib = libFree.filter((e) => e.name && Array.isArray(xOfLib(e)) && notHeld(e)).map((e, i) => ({ key: e.key || `lib|${i}`, g: grp(e.key || `lib|${i}`), y: e.name, x: xOfLib(e), lib: e }));
  const cur = S.cores.find((c) => c.id === S.curCore), exCore = ownExamples(cur ? [cur] : []), exProj = ownExamples(S.cores);
  const keys = new Set([...exProj, ...lib].map((e) => e.key));
  // the same trace can exist in two projects (shared core, duplicated or imported project): identical descriptors are
  // used once, otherwise it would count twice and could be both trained on and tested in the evaluation
  const sig = (e) => e.x.map((v) => (+v).toFixed(3)).join(','), seen = new Set(exProj.concat(lib).map(sig));
  const other = otherFree.map((e) => ({ ...e, x: xOfLib(e) })).filter((e) => Array.isArray(e.x) && !mlExcluded.has(e.key) && !keys.has(e.key) && notHeld(e)).filter((e) => { const k = sig(e); if (seen.has(k)) return false; seen.add(k); return true; }).map((e) => ({ ...e, g: grp(e.key) }));
  // V0.17: only vectors of the current feature set and length
  const D = exProj[0]?.x.length ?? lib[0]?.x.length ?? other[0]?.x.length, ok = (e) => e.x.length === D;
  return { core: exCore.concat(lib).filter(ok), project: exProj.concat(lib).filter(ok), all: exProj.concat(lib, other).filter(ok) };
}
/* ───────────── V0.49: final test on reserved cores ─────────────
 * Cores marked as reserved (core.holdout) never train any model nor take part in choosing one (icnotaxa: example
 * sets and evaluation; multiproxy: training and cross-validation). The final test predicts their identified traces
 * (icnotaxa: the model in use) or described intervals (multiproxy: the trained classifier) once, and every run is
 * logged in S.finalTests so a re-test after changes is visible. */
const holdoutIds = () => new Set(S.cores.filter((c) => c.holdout).map((c) => c.id));
function logFinal(entry) {
  const prev = (S.finalTests || []).filter((q) => q.kind === entry.kind && q.target === entry.target).length;
  (S.finalTests ||= []).push({ ...entry, at: new Date().toISOString(), delivery: DELIVERY, repeat: prev });
  markDirty(); return prev;
}
function runFinalIchno() {
  const cores = S.cores.filter((c) => c.holdout), ex = ownExamples(cores, true, true);
  if (!cores.length) { toast(t('ft.noCores')); return; }
  learnNow();   // the model in use, refitted now without the reserved cores if they just changed
  if (!ex.length || !clf) { toast(t('ft.noTraces')); return; }
  const m = finalTestMetrics(ex.map((e) => ({ y: e.y, p: clf.predict(e.x)?.y ?? null })));
  const active = CLF_SCOPES.includes(S.settings.clfScope) ? S.settings.clfScope : 'project';
  const prev = logFinal({ kind: 'ichno', target: 'ichnotaxa', method: S.settings.ml?.method || 'knn', scope: active, cores: cores.map((c) => c.name), nTrain: mlSets()[active].length, ...m });
  if (prev) toast(t('ft.repeat', { n: prev + 1 }), 9000);
  renderMl();
}
function runFinalGeo(c) {
  const held = holdoutIds(); if (!held.size) { toast(t('ft.noCores')); return; }
  const run = geoRT.runs.get(c.id); if (!run) { toast(t('gx.untrained')); return; }
  if (run.held !== [...held].sort().join()) { toast(t('ft.retrain'), 8000); return; }   // trained with another reservation
  for (const [lid, r] of run.byTarget) {
    if (!r.model || !r.all) continue;
    const pairs = [];
    geoRT.samples.forEach((smp, i) => { const l = r.all[i]; if (held.has(smp.core) && l?.label && l.source !== 'rule') pairs.push({ y: l.label, p: r.preds[i]?.label ?? null }); });
    if (!pairs.length) continue;
    const m = finalTestMetrics(pairs), prev = logFinal({ kind: 'geo', target: geoLayer(lid)?.name || lid, classifier: c.name, method: c.method, cores: S.cores.filter((k) => k.holdout).map((k) => k.name), nTrain: r.model.n, ...m });
    if (prev) toast(t('ft.repeat', { n: prev + 1 }), 9000);
  }
  renderGeo();
}
function finalTestsHTML(kind) {
  const list = (S.finalTests || []).filter((q) => q.kind === kind).slice(-8).reverse();
  if (!list.length) return `<p class="note">${t('ft.none')}</p>`;
  return `<table class="tbl"><tr><th>${t('ft.when')}</th><th>${t('ft.what')}</th><th>${t('geo.bacc')}</th><th>${t('geo.acc')}</th><th>n</th></tr>${list.map((q) => `<tr><td>${esc(q.at.slice(0, 16).replace('T', ' '))}${q.repeat ? ` <span class="warn" title="${esc(t('ft.repeatTip'))}">(${q.repeat + 1}.ª)</span>` : ''}</td><td>${esc(q.target)} · ${esc(q.method)}${q.scope ? ' · ' + esc(q.scope) : ''}${q.classifier ? ' · ' + esc(q.classifier) : ''}<br><span class="note">${esc(q.cores.join(', '))}</span></td><td><b>${fmt(q.balanced * 100, 1)} %</b></td><td>${fmt(q.accuracy * 100, 1)} %</td><td>${q.n}</td></tr>`).join('')}</table>`;
}
function holdoutHTML() {
  if (S.cores.some((c) => c.holdout)) mlSets();   // updates the count of external examples left out
  return `${mlReservedDropped ? `<p class="note">${t('ft.dropped', { n: mlReservedDropped })}</p>` : ''}<div class="chk2">${S.cores.map((c) => `<label class="chk"><input type="checkbox" data-holdout="${esc(c.id)}" ${c.holdout ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')}</div>`;
}
document.addEventListener('change', (e) => {
  const id = e.target?.dataset?.holdout; if (id == null) return;
  const c = S.cores.find((k) => k.id === id); if (!c) return;
  c.holdout = e.target.checked; markDirty(); geoRT.dirty = true; mlEval = null; scheduleLearn();
  toast(t(c.holdout ? 'ft.reserved' : 'ft.released', { c: c.name }), 6000);
  if ($('mlDlg')?.open) renderMl();
});

/** V0.2: signature of a training set and of the model settings; the model is refitted only when it changes. */
function trainSig(set) {
  let h = 2166136261; const mix = (v) => { h = Math.imul(h ^ (typeof v === 'number' ? Math.round(v * 1e6) : [...String(v)].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 7)), 16777619); };
  mix(JSON.stringify(S.settings.ml || {})); mix(S.settings.novelty); mix(S.classes.map((c) => c.name).join('|'));
  for (const e of set || []) { mix(e.key); mix(e.y); for (const v of e.x || []) mix(v); }
  return h;
}
const clfSig = {}; let modelVer = 0;
function learnNow() {
  const sets = mlSets(), active = CLF_SCOPES.includes(S.settings.clfScope) ? S.settings.clfScope : 'project';
  const fitScope = (k) => {
    const sig = trainSig(sets[k]); if (clfs[k] && clfSig[k] === sig) return false;
    clfs[k] = mkModel(); clfs[k].cv = mlEval?.res?.[k]?.[clfs[k].method]?.balanced ?? null; clfs[k].fit(sets[k]); clfSig[k] = sig; return true;
  };
  if (fitScope(active) || clf !== clfs[active]) modelVer++; // the model in use is refitted at once (only if its examples changed); the other two when idle
  clearTimeout(learnIdle);
  learnIdle = setTimeout(() => { for (const k of CLF_SCOPES) if (k !== active) fitScope(k); renderLearn(); renderObject(); if ($('mlDlg')?.open) renderMl(); }, 350);
  clf = clfs[active];
  const idOf = (name) => S.classes.find((c) => c.name === name)?.id || null;
  for (const s of S.sections) {
    for (const o of s.objects.values()) {
      const x = xOf(o);
      if (o.cls || !x) { o.pred = null; o.conf = 0; o.novel = false; o._pv = 0; continue; }
      const xi = visionOn() ? o.emb : o.feat;
      if (o._pv === modelVer && o._pf === xi) continue;   // V0.2: prediction still valid
      o._pv = modelVer; o._pf = xi;
      const p = clf.predict(x);
      o.pred = p?.y ? idOf(p.y) : null; o.conf = o.pred ? p.conf : 0; o.novel = !!p?.novel;
    }
    rebuildLUT(s);
  }
  saveAllModel();
  renderLearn(); renderClasses(); renderObject(); scheduleAnalysis(); requestRender();
  if ($('mlDlg')?.open) renderMl();
}
/** Labelled examples of the other projects (light index), for the all-projects model. */
async function refreshOtherExamples() {
  if (!storageOK) return;
  const lites = await listLite().catch(() => []);
  otherExamples = lites.filter((l) => l.id !== S.id && l.kind !== 'multi').flatMap((l) => (l.examples || []).map((e, i) => ({ key: e.key || `${l.id}|${i}`, y: e.name, x: e.x, xv: e.xv, thumb: e.thumb || null, where: `${l.name} · ${e.core || ''}`, core: e.core || '', project: l.id })));
  scheduleLearn();
}
let allModelTimer = 0;
/** The all-projects model is kept in the browser preferences (available before the other projects are read). */
function saveAllModel() { clearTimeout(allModelTimer); allModelTimer = setTimeout(() => { if (storageOK && clfs.all.n) setPref('model.all', clfs.all.toJSON()).catch(() => {}); }, 3000); }
/** Stored models of the project ("weights"): the project model and one per core. */
function projectModels() {
  // the models already fitted (same method and settings as in use); the core model is kept per core as it was last fitted
  S.coreModels ||= {};
  if (S.curCore && clfs.core.n >= 2) S.coreModels[S.curCore] = clfs.core.toJSON();
  return { project: clfs.project.n ? clfs.project.toJSON() : null, all: null, cores: { ...S.coreModels } };
}

/* ───────────── analysis ───────────── */

let anaTimer = 0;
function scheduleAnalysis() { clearTimeout(anaTimer); anaTimer = setTimeout(() => { analyze(sec()); renderResults(); requestRender(); }, 100); }

export function effClassArray(s) {
  const eff = new Int16Array(s.nextId).fill(-1), idx = new Map(S.classes.map((c, k) => [c.id, k]));
  for (const o of s.objects.values()) {
    const c = effClassId(o); if (c == null) continue;
    const k = idx.get(c); if (k != null && S.classes[k].counts) eff[o.id] = k;
  }
  return eff;
}

function analyze(s) {
  if (!s) return;
  const eff = effClassArray(s);
  let h = 2166136261; for (let i = 0; i < eff.length; i++) h = Math.imul(h ^ (eff[i] + 2), 16777619);   // signature of the class of each object
  const key = `${s._mv || 0}|${s.w}x${s.h}|${s.roi.x0},${s.roi.y0},${s.roi.x1},${s.roi.y1}|${S.classes.length}|${eff.length}|${h}`;
  if (s._rc?.key !== key) s._rc = { key, counts: rowCounts({ labels: s.labels, width: s.w, roi: s.roi, exclude: s.exclude, effClass: eff, nClasses: S.classes.length, stacks: s.stacks }) };   // V0.2: cached
  const counts = s._rc.counts;
  s.bins = binRows(counts, { top: s.top, bottom: s.bottom, binPx: binRowsOf(s), minValid: (S.settings.minValid ?? 20) / 100 });
  const pad = (S.settings.noDataPad || 0) / UNIT_TO_CM[s.units];   // V0.3: widen the no-data zones by this length (cm) on each side
  if (pad > 0) {
    const gaps = s.bins.filter((b) => b.noData).map((b) => [b.dTop - pad, b.dBottom + pad]);
    for (const b of s.bins) if (!b.noData && gaps.some(([a, z]) => b.dBottom > a + 1e-9 && b.dTop < z - 1e-9)) Object.assign(b, { noData: true, pct: null, classPct: b.classPct.map(() => null) });
  }
  for (const b of s.bins) if (b.noData) { b.BI = null; b.ii = null; }
  for (const b of s.bins) {
    b.age = interpAge(S.age.model, b.depth);
    const ar = interpAgeRange(S.age.model, b.depth); b.ageMin = ar?.min ?? null; b.ageMax = ar?.max ?? null;   // V0.28
    const m = manualAt(s, b.depth); b.BIm = m?.BI ?? null; b.iim = m?.ii ?? null;
  }
}

/** V0.1: the analysis interval is set in cm; rows per interval in this section (may be fractional, at least 1). */
function binRowsOf(s) { return Math.max(1, (S.settings.binCm || 1) * pxPerCm(s)); }
function manualAt(s, d) { let hit = null; for (const m of s.manual) if (d >= m.from && d < m.to) hit = m; return hit; }
function setManual(s, b, key, val) {
  let m = s.manual.find((e) => Math.abs(e.from - b.dTop) < 1e-9 && Math.abs(e.to - b.dBottom) < 1e-9);
  if (!m) { m = { from: b.dTop, to: b.dBottom, BI: null, ii: null }; s.manual.push(m); }
  m[key] = val;
  if (m.BI == null && m.ii == null) s.manual.splice(s.manual.indexOf(m), 1);
}

/* ───────────── rendering ───────────── */

const view = $('view'), vctx = view.getContext('2d');
const prof = $('profile'), pctx = prof.getContext('2d');
let imgData = null, rq = false, cursor = null, lassoPts = null, roiDrag = null, boxDrag = null;

/** V0.2: ichnotaxa hidden while interpreting (view only: nothing is deleted; analysis and figures are unchanged). */
const hiddenCls = () => new Set(S.settings.hidden || []);
function rebuildLUT(s) {
  const n = s.nextId, fill = new Uint8ClampedArray(n * 4), line = new Uint8ClampedArray(n * 4), sty = new Uint8Array(n), hid = hiddenCls();
  for (const o of s.objects.values()) {
    const st = status(o), k = o.id * 4;
    if (hid.size && hid.has(st === 'labeled' ? o.cls : st === 'predicted' ? o.pred : 'undet')) { sty[o.id] = 3; continue; }
    let col, a;
    if (st === 'labeled') { col = hex(clsById(o.cls)?.color || '#ffffff'); a = S.ovAlpha; sty[o.id] = 0; }
    else if (st === 'predicted') { col = hex(clsById(o.pred)?.color || '#ffffff'); a = S.ovAlpha * 0.45; sty[o.id] = 1; }
    else { col = [255, 236, 150]; a = S.ovAlpha * 0.18; sty[o.id] = 2; }
    fill[k] = col[0]; fill[k + 1] = col[1]; fill[k + 2] = col[2]; fill[k + 3] = a * 255;
    line[k] = col[0]; line[k + 1] = col[1]; line[k + 2] = col[2]; line[k + 3] = 255;
  }
  s.lutFill = fill; s.lutLine = line; s.lutStyle = sty;
}

export function requestRender() { if (!rq) { rq = true; requestAnimationFrame(() => { rq = false; render(); renderProfile(); }); } }

function resizeCanvases() {
  for (const c of [view, prof]) {
    const w = Math.max(1, Math.round(c.clientWidth)), h = Math.max(1, Math.round(c.clientHeight));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  requestRender();
}

function render() {
  const s = sec(), cw = view.width, ch = view.height;
  $('empty').hidden = !!s;
  if (!s) { vctx.fillStyle = '#161a19'; vctx.fillRect(0, 0, cw, ch); return; }
  if (!s.orig) {   // V0.1: pixels are being read from disk
    vctx.fillStyle = '#161a19'; vctx.fillRect(0, 0, cw, ch); vctx.fillStyle = '#9aa7a3'; vctx.font = '14px "IBM Plex Sans", sans-serif'; vctx.textAlign = 'center';
    vctx.fillText(s._pxErr || t('mem.loading'), cw / 2, ch / 2); vctx.textAlign = 'start'; needPixels(s); return;
  }
  if (!s.lutFill || s.lutFill.length < s.nextId * 4) rebuildLUT(s);
  if (!imgData || imgData.width !== cw || imgData.height !== ch) imgData = vctx.createImageData(cw, ch);
  const stk = s.stacks, own = (w, id) => w === id || (w < 0 && stk[-w].includes(id));
  const d = imgData.data, src = S.showOrig ? s.orig : s.enh, lab = s.labels, ex = s.exclude, dprob = S.showDoubt && s._unet?.key === unetKey(s) ? s._unet.prob : null;
  const W = s.w, H = s.h, { x: vx, y: vy, zoom: z } = S.view, roi = s.roi;
  const fill = s.lutFill, line = s.lutLine, sty = s.lutStyle, sel = S.selected, step = Math.max(1, Math.round(1 / z));
  const inSel = new Uint8Array(s.nextId + 1); for (const id of S.multi) if (id <= s.nextId) inSel[id] = 1;
  const ixs = new Int32Array(cw);
  for (let sx = 0; sx < cw; sx++) ixs[sx] = Math.floor(vx + (sx + 0.5) / z);
  let o = 0;
  for (let sy = 0; sy < ch; sy++) {
    const iy = Math.floor(vy + (sy + 0.5) / z), rowIn = iy >= 0 && iy < H, base = iy * W, inY = iy >= roi.y0 && iy < roi.y1;
    for (let sx = 0; sx < cw; sx++, o += 4) {
      const ix = ixs[sx];
      if (!rowIn || ix < 0 || ix >= W) { d[o] = 22; d[o + 1] = 26; d[o + 2] = 25; d[o + 3] = 255; continue; }
      const i = base + ix, j = i * 4;
      let r = src[j], g = src[j + 1], b = src[j + 2];
      const v = lab[i], list = v < 0 ? stk[-v] : null;   // V0.20: overlaps are drawn bottom → top
      for (let q = 0, n = list ? list.length : v ? 1 : 0; q < n; q++) {
        const id = list ? list[q] : v; if (sty[id] === 3) continue;
        const k = id * 4, a = fill[k + 3] / 255;
        if (a) { r += (fill[k] - r) * a; g += (fill[k + 1] - g) * a; b += (fill[k + 2] - b) * a; }
        const edge = (ix < step || !own(lab[i - step], id)) || (ix + step >= W || !own(lab[i + step], id)) ||
          (iy < step || !own(lab[i - step * W], id)) || (iy + step >= H || !own(lab[i + step * W], id));
        if (edge) {
          if (id === sel || inSel[id]) { r = 255; g = 255; b = 255; }
          else if (sty[id] !== 1 || ((sx + sy) & 4)) { r = line[k]; g = line[k + 1]; b = line[k + 2]; }
        }
      }
      if (dprob && dprob[i] && doubtful(dprob[i]) && !((sx + sy) & 3)) { r = 236; g = 72; b = 214; }   // V0.15: U-Net doubtful zone
      if (ex[i]) { if (((sx + sy) & 7) < 2) { r = r * 0.3 + 70; g = g * 0.3 + 70; b = b * 0.3 + 80; } else { r *= 0.55; g *= 0.55; b *= 0.55; } }
      if (!inY || ix < roi.x0 || ix >= roi.x1) { r *= 0.42; g *= 0.42; b *= 0.42; }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  vctx.putImageData(imgData, 0, 0);
  const toS = (x, y) => [(x - vx) * z, (y - vy) * z];
  // analysis area
  vctx.save();
  vctx.strokeStyle = '#e0995a'; vctx.lineWidth = 1; vctx.setLineDash([6, 4]);
  const [rx0, ry0] = toS(roi.x0, roi.y0), [rx1, ry1] = toS(roi.x1, roi.y1);
  vctx.strokeRect(rx0 + 0.5, ry0 + 0.5, rx1 - rx0 - 1, ry1 - ry0 - 1);
  vctx.setLineDash([]);
  for (const r of [roiDrag, boxDrag]) if (r) { const [a, b2] = toS(r.x0, r.y0), [c, e] = toS(r.x1, r.y1); vctx.strokeStyle = '#fff'; vctx.setLineDash(r === boxDrag ? [4, 3] : []); vctx.strokeRect(a, b2, c - a, e - b2); vctx.setLineDash([]); }
  if (lassoPts && lassoPts.length > 1) {
    vctx.strokeStyle = '#fff'; vctx.lineWidth = 1.5; vctx.beginPath();
    lassoPts.forEach(([x, y], k) => { const [a, b2] = toS(x, y); k ? vctx.lineTo(a, b2) : vctx.moveTo(a, b2); });
    vctx.stroke();
  }
  if (cursor && ['brush', 'erase', 'exclude', 'include'].includes(S.tool)) {
    const [a, b2] = toS(cursor.x, cursor.y);
    vctx.strokeStyle = S.tool === 'brush' ? clsById(S.active)?.color || '#fff' : '#fff'; vctx.lineWidth = 1.5;
    vctx.beginPath(); vctx.arc(a, b2, Math.max(2, S.brushSize * z), 0, Math.PI * 2); vctx.stroke();
  }
  drawMarks(s, toS); drawComments(s, toS);
  drawRuler(s, ch);
  drawNav(s, cw, ch);   // V0.26
  drawEdges(s, ch, cw, toS);
  vctx.restore();
  $('zoomLbl').textContent = Math.round(z * 100) + '%';
}

/* ── V32: identification mode — marks of identified traces (point + ichnotaxon), no quantification ── */
export const idMode = () => !!S.settings.idMode;
export function clsAbbr() { return abbrevs(S.classes.map((c) => c.name)); }
/** Click with the Mark tool: add a mark of the active ichnotaxon, or remove the mark under the pointer (also with Alt). */
function toggleMark(s, p, remove) {
  if (!inImg(s, p)) return;
  s.marks ||= [];
  const z = S.view.zoom, hit = s.marks.findIndex((m) => Math.hypot((m.x - p.x) * z, (m.y - p.y) * z) <= 9);
  if (hit >= 0) s.marks.splice(hit, 1);
  else if (!remove) { const c = clsById(S.active); if (!c || c.id === 'artifact') { toast(t('id.pickCls')); return; } s.marks.push({ id: uid(), x: Math.round(p.x), y: Math.round(p.y), cls: c.id }); }
  s.logVer++; markDirty(); scheduleLog(); renderClasses(); requestRender();
}
/* ───────────── V0.8: comments with date, replies, resolve and delete (team work) ───────────── */
const authorName = () => { try { return localStorage.getItem('corantool.author') || ''; } catch { return ''; } };
/** Union of two comment lists by id (replies too); for the same comment the most recently edited state wins. */
function mergeComments(a, b) {
  const by = new Map();
  for (const c of [...a, ...b]) {
    const o = by.get(c.id);
    if (!o) { by.set(c.id, { ...c, replies: [...(c.replies || [])] }); continue; }
    const newer = (c.edited || c.date) > (o.edited || o.date) ? c : o, reps = new Map([...o.replies, ...(c.replies || [])].map((r) => [r.id, r]));
    by.set(c.id, { ...newer, replies: [...reps.values()].sort((x, y) => (x.date < y.date ? -1 : 1)) });
  }
  return [...by.values()].sort((x, y) => (x.date < y.date ? -1 : 1));
}
function drawComments(s, toS) {
  const list = (S.comments || []).filter((c) => c.sec === s.id && c.x != null && !c.done); if (!list.length) return;
  vctx.font = '600 10px "IBM Plex Sans", sans-serif'; vctx.textBaseline = 'middle'; vctx.textAlign = 'center';
  for (const c of list) {
    const [x, y] = toS(c.x, c.y), n = S.comments.indexOf(c) + 1;
    vctx.fillStyle = '#2f6fdf'; vctx.strokeStyle = '#fff'; vctx.lineWidth = 1.5;
    vctx.beginPath(); vctx.arc(x, y - 12, 9, 0, Math.PI * 2); vctx.moveTo(x - 4, y - 5); vctx.lineTo(x, y); vctx.lineTo(x + 4, y - 5); vctx.fill(); vctx.stroke();
    vctx.fillStyle = '#fff'; vctx.fillText(String(n), x, y - 12);
  }
  vctx.textAlign = 'start';
}
function renderComments() {
  const box = $('cmtBody'); if (!box) return;
  const s = sec(), f = $('cmtFilter')?.value || 'all', fmtD = (d) => new Date(d).toLocaleString();
  const list = (S.comments || []).map((c, i) => ({ c, n: i + 1 })).filter(({ c }) => f === 'all' || (f === 'open' && !c.done) || (f === 'sec' && s && c.sec === s.id));
  const where = (c) => { const q = c.sec && S.cores.flatMap((k) => k.sections.map((x) => ({ k, x }))).find((o) => o.x.id === c.sec); return q ? `${esc(q.k.name)} · ${esc(q.x.name)}${c.depth != null ? ` · ${fmt(c.depth, 4)} ${esc(q.x.units)}` : ''}` : esc(t('cmt.general')); };
  box.innerHTML = list.length ? list.map(({ c, n }) => `<div class="cmt ${c.done ? 'done' : ''}" data-id="${c.id}" style="border:1px solid var(--line,#d7ddda);border-radius:8px;padding:8px;margin:6px 0;${c.done ? 'opacity:.6' : ''}">
      <div class="row" style="justify-content:space-between;gap:6px"><b>#${n} ${esc(c.author || '—')}</b><span class="note">${fmtD(c.date)}</span></div>
      <div class="note">${where(c)} ${c.sec ? `<button class="btn small" data-act="go">${t('cmt.go')}</button>` : ''}</div>
      <div style="white-space:pre-wrap;margin:4px 0">${esc(c.text)}</div>
      ${(c.replies || []).map((r) => `<div data-rid="${r.id}" style="margin-left:14px;border-left:3px solid var(--line,#d7ddda);padding-left:8px;margin-top:4px"><div class="row" style="justify-content:space-between"><b>${esc(r.author || '—')}</b><span class="note">${fmtD(r.date)} <button class="btn small ghost" data-act="delr" title="${esc(t('cmt.del'))}">✕</button></span></div><div style="white-space:pre-wrap">${esc(r.text)}</div></div>`).join('')}
      <div class="row" style="gap:6px;margin-top:6px"><input type="text" data-reply placeholder="${esc(t('cmt.replyPh'))}" style="flex:1"><button class="btn small" data-act="reply">${t('cmt.reply')}</button>
      <button class="btn small" data-act="done">${t(c.done ? 'cmt.reopen' : 'cmt.resolve')}</button><button class="btn small danger" data-act="del">${t('cmt.del')}</button></div></div>`).join('')
    : `<p class="note">${t('cmt.none')}</p>`;
  $('cmtBtn').textContent = `💬 ${(S.comments || []).filter((c) => !c.done).length || ''}`.trim();
}
function openComments() { $('cmtAuthor').value = authorName(); $('cmtLink').disabled = !sec(); renderComments(); $('cmtDlg').showModal(); }
function addComment() {
  const text = $('cmtText').value.trim(); if (!text) return;
  const author = $('cmtAuthor').value.trim(); try { localStorage.setItem('corantool.author', author); } catch { /* storage blocked */ }
  const s = sec(), link = $('cmtLink').checked && s, now = new Date().toISOString();
  const cx = link ? Math.round(S.view.x + view.width / 2 / S.view.zoom) : null, cy = link ? Math.round(S.view.y + view.height / 2 / S.view.zoom) : null;
  (S.comments ||= []).push({ id: uid(), author, date: now, edited: now, text, sec: link ? s.id : null, x: cx, y: cy, depth: link ? depthAtRow(s, cy) : null, done: false, replies: [] });
  $('cmtText').value = ''; markDirty(); renderComments(); requestRender();
}
function drawMarks(s, toS) {
  if (!s.marks?.length) return;
  const ab = clsAbbr();
  vctx.font = '600 11px "IBM Plex Sans Condensed", sans-serif'; vctx.textBaseline = 'middle';
  const hid = hiddenCls();
  for (const m of s.marks) {
    const c = clsById(m.cls); if (!c || hid.has(c.id)) continue;
    const [x, y] = toS(m.x, m.y);
    vctx.fillStyle = c.color; vctx.strokeStyle = '#fff'; vctx.lineWidth = 1.5;
    vctx.save(); vctx.translate(x, y); vctx.scale(1.6, 1.6); const shape = new Path2D(traceSymbolPath(c.symbol)); vctx.fill(shape); vctx.stroke(shape); vctx.restore();
    const lab = ab.get(c.name) || ''; vctx.lineWidth = 3; vctx.strokeStyle = 'rgba(0,0,0,.75)'; vctx.strokeText(lab, x + 9, y - 9); vctx.fillStyle = '#fff'; vctx.fillText(lab, x + 9, y - 9);
  }
}
$('idMode').addEventListener('change', (e) => {
  S.settings.idMode = e.target.checked; markDirty();
  if (S.settings.idMode) { setTool('mark'); toast(t('id.on')); } else toast(t('id.off'));
  scheduleLog(); renderClasses();
});
/** Identified traces of the composite on the log axis: marks of every section, plus traced objects if wanted. */
export function compositeMarks(D) {
  const ab = clsAbbr(), out = [];
  for (const s of D.secs) for (const m of s.marks || []) {
    const c = clsById(m.cls); if (!c || m.y < s.roi.y0 || m.y >= s.roi.y1) continue;
    const d = depthAtRow(s, m.y) * D.f(s), a = D.axis === 'age' ? interpAge(D.model, d) : d; if (a == null) continue;
    out.push({ a, xf: (m.x - s.roi.x0) / Math.max(1, s.roi.x1 - s.roi.x0), color: c.color, abbr: ab.get(c.name), name: c.name, symbol: c.symbol || 'triDown', plain: !!c.plain, cls: c.id });
  }
  return out.sort((p, q) => p.a - q.a);
}
/** Ichnotaxa identified in each interval of the log (consecutive intervals with the same set are merged). */
export function idListOf(rows, marks) {
  const groups = [];
  for (const r of rows) {
    const inR = marks.filter((m) => m.a >= r.a0 && m.a < r.a1), seen = new Map();
    for (const m of inR) if (!seen.has(m.cls)) seen.set(m.cls, { name: m.name, abbr: m.abbr, color: m.color, plain: m.plain });
    const items = [...seen.values()], key = items.map((k) => k.name).sort().join('|'), last = groups[groups.length - 1];
    if (!items.length) continue;
    if (last && last.key === key && Math.abs(last.a1 - r.a0) < 1e-9) last.a1 = r.a1; else groups.push({ a0: r.a0, a1: r.a1, items, key });
  }
  return groups;
}
/** Colour legend of the ichnotaxa shown (traced, predicted or marked). */
export function legendOf(classes, marks) {
  const names = new Set(marks.map((m) => m.name));
  return S.classes.filter((c) => c.id !== 'artifact' && (names.has(c.name) || classes.some((k) => k.name === c.name))).map((c) => ({ name: c.name, color: c.color, symbol: c.symbol || 'triDown' }));
}

/* ── V31: Start/End markers of the analysed interval and the crop lines ── */
let cropState = null;   // {s, y0, y1} while cropping
function edgeYs(s) { return cropState?.s === s ? { a: cropState.y0, b: cropState.y1, crop: true } : { a: s.roi.y0, b: s.roi.y1, crop: false }; }
function drawEdges(s, ch, cw, toS) {
  const G = navGut(); vctx.save(); vctx.translate(G, 0);   // V0.27: right of the navigation gutter
  try { drawEdgesAt(s, ch, cw - G, toS); } finally { vctx.restore(); }
}
function drawEdgesAt(s, ch, cw, toS) {
  const E = edgeYs(s), [, ya] = toS(0, E.a), [, yb] = toS(0, E.b);
  if (E.crop) {   // darken what will be removed, dashed cut lines
    vctx.fillStyle = 'rgba(160,30,30,.38)';
    vctx.fillRect(54, 0, cw - 54, Math.max(0, ya)); vctx.fillRect(54, yb, cw - 54, Math.max(0, ch - yb));
    vctx.strokeStyle = '#ff6b5a'; vctx.lineWidth = 2; vctx.setLineDash([8, 5]);
    for (const y of [ya, yb]) { vctx.beginPath(); vctx.moveTo(54, y); vctx.lineTo(cw, y); vctx.stroke(); }
    vctx.setLineDash([]);
  }
  vctx.font = '600 10px "IBM Plex Sans Condensed", sans-serif'; vctx.textBaseline = 'middle';
  for (const [y, lab, up] of [[ya, E.crop ? 'Crop top' : 'Start', false], [yb, E.crop ? 'Crop bottom' : 'End', true]]) {
    if (y < -12 || y > ch + 12) continue;
    vctx.fillStyle = E.crop ? '#ff6b5a' : '#e0995a';
    vctx.beginPath(); vctx.moveTo(56, y - 9); vctx.lineTo(72, y); vctx.lineTo(56, y + 9); vctx.closePath(); vctx.fill();
    vctx.strokeStyle = '#14100c'; vctx.lineWidth = 1; vctx.stroke();
    const tw = vctx.measureText(lab).width + 8, ty = up ? y + 18 : y - 18;
    vctx.fillStyle = 'rgba(14,17,16,.85)'; vctx.fillRect(56, ty - 8, tw, 16);
    vctx.fillStyle = E.crop ? '#ff9b8f' : '#f0b87e'; vctx.fillText(lab, 60, ty);
  }
}
/** Which marker is under the pointer: 'a' (Start / crop top) or 'b' (End / crop bottom). */
function edgeHit(s, sx0, sy) {
  const sx = sx0 - navGut(), E = edgeYs(s), z = S.view.zoom, ya = (E.a - S.view.y) * z, yb = (E.b - S.view.y) * z;
  const near = (y) => (E.crop ? Math.abs(sy - y) <= 7 && sx >= 50 : sx >= 50 && sx <= 78 && Math.abs(sy - y) <= 11);
  return near(ya) ? 'a' : near(yb) ? 'b' : null;
}
function startCrop() {
  const s = sec(); if (!s?.orig) return;
  cropState = { s, y0: 0, y1: s.h }; $('cropBar').hidden = false; updateCropInfo(); requestRender();
}
function endCrop() { cropState = null; $('cropBar').hidden = true; requestRender(); }
function cropResult() {
  const c = cropState, s = c.s, adjust = document.querySelector('input[name=cropMode]:checked')?.value !== 'keep';
  const r0 = Math.max(s.roi.y0, c.y0), r1 = Math.min(s.roi.y1, c.y1);
  return adjust ? { top: depthAtRow(s, r0), bottom: depthAtRow(s, r1), roi: { x0: s.roi.x0, x1: s.roi.x1, y0: r0 - c.y0, y1: r1 - c.y0 } }
    : { top: s.top, bottom: s.bottom, roi: { x0: s.roi.x0, x1: s.roi.x1, y0: 0, y1: c.y1 - c.y0 } };
}
function updateCropInfo() {
  if (!cropState) return; const s = cropState.s, r = cropResult();
  $('cropInfo').textContent = t('crop.info', { h: cropState.y1 - cropState.y0, H: s.h, a: fmt(r.top, 3), b: fmt(r.bottom, 3), u: s.units });
}
/** Rectangle [x0,x1)×[y0,y1) of the working image (rotated frame) → rectangle in full-resolution pixels of the file. */
function workToFull(s, R) {
  let w = s.w, h = s.h, x0 = R.x0, y0 = R.y0, x1 = R.x1, y1 = R.y1;
  for (let r = 0; r < ((s.rot % 4) + 4) % 4; r++) {   // undo one clockwise turn: (x, y) in w×h → (y, w − x) in h×w
    [x0, y0, x1, y1] = [Math.min(y0, y1), Math.min(w - x0, w - x1), Math.max(y0, y1), Math.max(w - x0, w - x1)]; [w, h] = [h, w];
  }
  const c = s.crop || { x0: 0, y0: 0 }, k = s.ds;
  return { x0: c.x0 + x0 * k, y0: c.y0 + y0 * k, x1: c.x0 + x1 * k, y1: c.y0 + y1 * k };
}
/** Remove the rows outside [y0, y1) from the image and its masks. V0.1: the original file is kept; the crop is stored in full-resolution pixels. */
async function applyCrop() {
  const c = cropState; if (!c) return; const s = c.s, { y0, y1 } = c;
  if (y0 <= 0 && y1 >= s.h) { endCrop(); return; }
  if (y1 - y0 < 10) { toast(t('crop.small')); return; }
  const r = cropResult(), W = s.w, H = y1 - y0;
  const crop = workToFull({ w: s.w, h: s.h, rot: s.rot, ds: s.ds, crop: s.crop }, { x0: 0, y0, x1: W, y1 });
  await busy(async () => {
    const cut = (arr, ch) => arr.slice(y0 * W * ch, y1 * W * ch);
    s.orig = cut(s.orig, 4); s.labels = cut(s.labels, 1); s.exclude = cut(s.exclude, 1); s.h = H;
    s.marks = (s.marks || []).filter((m) => m.y >= y0 && m.y < y1).map((m) => ({ ...m, y: m.y - y0 }));
    s.top = r.top; s.bottom = r.bottom; s.roi = r.roi;
    s.crop = crop; s.logVer++;
    s.view = null;
    enhance(s); refreshObjects(s, new Set(s.objects.keys()), null);
    S.undo = S.undo.filter((op) => op.s !== s); $('undoBtn').disabled = !S.undo.length;
    endCrop(); selectSection(S.cur, true); afterChange(s);
    toast(t('crop.done', { a: fmt(s.top, 3), b: fmt(s.bottom, 3), u: s.units }));
  });
}
$('cropBtn').addEventListener('click', () => (cropState ? endCrop() : startCrop()));
$('cropApply').addEventListener('click', applyCrop);
$('cropCancel').addEventListener('click', endCrop);
$('cropBar').addEventListener('change', updateCropInfo);

function niceStep(pxPerUnit, minPx) {
  const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  return steps.find((v) => v * pxPerUnit >= minPx) || 10000;
}

/* ───────────── V0.26: navigation strip — the whole analysis area at the right edge of the view; click or drag to move ───────────── */
let navBox = null;
/** V0.27: width of the navigation gutter at the left of the depth ruler (0 when turned off). */
const navGut = () => (S.settings?.nav === false ? 0 : 66);
function drawNav(s, cw, ch) {
  navBox = null;
  const G = navGut(); if (!G) return;
  vctx.fillStyle = '#0e1110'; vctx.fillRect(0, 0, G, ch);
  vctx.fillStyle = '#262c2b'; vctx.fillRect(G - 1, 0, 1, ch);
  if (!s.orig) return;
  const roi = s.roi, rh = roi.y1 - roi.y0, rw = roi.x1 - roi.x0, H = ch - 30, z = S.view.zoom, y = 14;
  if (H < 60) return;
  const W = Math.round(Math.max(8, Math.min(24, (H * rw) / rh))), x = 6;
  const cv = sectionCanvas(s), kk = s._lc?.k || 1;
  try { vctx.drawImage(cv, roi.x0 * kk, roi.y0 * kk, rw * kk, rh * kk, x, y, W, H); } catch { /* pending */ }
  vctx.strokeStyle = '#3a4240'; vctx.lineWidth = 1; vctx.strokeRect(x - 0.5, y - 0.5, W + 1, H + 1);
  // its own small ruler: the whole section from top to bottom
  const span = s.bottom - s.top;
  if (span > 0) {
    const st = niceStep(H / span, 34), tx = x + W + 3;
    vctx.font = '9px "IBM Plex Mono", monospace'; vctx.textBaseline = 'middle'; vctx.textAlign = 'left';
    for (let v = Math.ceil(s.top / st - 1e-9) * st; v <= s.bottom + 1e-9; v += st) {
      const yy = Math.round(y + ((v - s.top) / span) * H) + 0.5;
      vctx.fillStyle = '#e6e1d6'; vctx.fillRect(x + W - 4, yy, 4, 1);   // tick on the strip edge, so it is not read as a minus sign
      vctx.fillStyle = '#a49d91'; vctx.fillText(fmt(v, 3), tx + 1, yy);
    }
  }
  const a = Math.max(0, (S.view.y - roi.y0) / rh), b = Math.min(1, (S.view.y + ch / z - roi.y0) / rh);
  vctx.fillStyle = 'rgba(224,153,90,.22)'; vctx.fillRect(x, y + a * H, W, Math.max(3, (b - a) * H));
  vctx.strokeStyle = '#e0995a'; vctx.lineWidth = 2; vctx.strokeRect(x - 1.5, y + a * H, W + 3, Math.max(3, (b - a) * H));
  navBox = { x: 0, y, w: G, h: H, roi };
}
function navTo(py) {
  const s = sec(); if (!s || !navBox) return;
  const f = Math.min(1, Math.max(0, (py - navBox.y) / navBox.h)), z = S.view.zoom;
  S.view.y = navBox.roi.y0 + f * (navBox.roi.y1 - navBox.roi.y0) - view.height / (2 * z); clampView(); requestRender();
}
view.addEventListener('pointerdown', (e) => {
  if (!navBox) return;
  const r = view.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (px < navBox.x || px > navBox.x + navBox.w || py < navBox.y - 3 || py > navBox.y + navBox.h + 3) return;
  e.stopImmediatePropagation(); e.preventDefault(); view.setPointerCapture(e.pointerId); navTo(py);
  const move = (ev) => navTo(ev.clientY - r.top), up = () => view.removeEventListener('pointermove', move, true);
  view.addEventListener('pointermove', move, true); view.addEventListener('pointerup', up, { once: true, capture: true });
}, true);
/** Whole analysis area in view (height fits). */
function fitAll() {
  const s = sec(); if (!s) return;
  const G = navGut(), rh = s.roi.y1 - s.roi.y0, rw = s.roi.x1 - s.roi.x0, z = Math.min(8, Math.max(0.02, Math.min((view.height - 24) / rh, (view.width - 76 - G) / rw)));
  S.view = { zoom: z, x: s.roi.x0 - (G + 62) / z, y: s.roi.y0 - 12 / z }; clampView(); requestRender();
}
$('zoomAll').addEventListener('click', fitAll);
/** Page Up / Page Down move one screen (90 %); Home / End go to the top or bottom of the analysis area. */
document.addEventListener('keydown', (e) => {
  if (mode !== 'section' || !sec() || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const s = sec(), z = S.view.zoom, page = (view.height / z) * 0.9;
  if (e.key === 'PageDown') S.view.y += page; else if (e.key === 'PageUp') S.view.y -= page;
  else if (e.key === 'Home') S.view.y = s.roi.y0 - 12 / z; else if (e.key === 'End') S.view.y = s.roi.y1 - view.height / z + 12 / z;
  else return;
  e.preventDefault(); clampView(); requestRender();
});

function drawRuler(s, ch) {
  const G = navGut(); vctx.save(); vctx.translate(G, 0);
  try { drawRulerAt(s, ch); } finally { vctx.restore(); }
}
function drawRulerAt(s, ch) {
  const span = s.bottom - s.top; if (!(span > 0)) return;
  const z = S.view.zoom, pxu = ((s.roi.y1 - s.roi.y0) / span) * z, st = niceStep(pxu, 56);
  const d0 = Math.max(s.top, depthAtRow(s, S.view.y)), d1 = Math.min(s.bottom, depthAtRow(s, S.view.y + ch / z));
  vctx.fillStyle = 'rgba(14,17,16,.78)'; vctx.fillRect(0, 0, 54, ch);
  vctx.strokeStyle = '#8f8a80'; vctx.fillStyle = '#e6e1d6'; vctx.font = '11px "IBM Plex Mono", monospace'; vctx.textBaseline = 'middle';
  const minor = st / 5;
  for (let v = Math.ceil(d0 / minor) * minor; v <= d1 + 1e-9; v += minor) {
    const y = Math.round((rowAtDepth(s, v) - S.view.y) * z) + 0.5, major = Math.abs(v / st - Math.round(v / st)) < 1e-6;
    vctx.beginPath(); vctx.moveTo(major ? 40 : 47, y); vctx.lineTo(54, y); vctx.stroke();
    if (major) vctx.fillText(fmt(v, 3), 4, y);
  }
  vctx.fillStyle = '#e0995a'; vctx.fillText(s.units, 4, ch - 10);
}

/* V0.21: side column — adjustable width (drag its left edge), fixed scales on top, and records from Data as extra tracks. */
const sideCache = new WeakMap();   // V0.41: side-column series cached per section until records, age model or units change
function sideSeries(s) {
  const wantL = S.settings.sideRecs || [], base0 = S.sections[0]?.units || s.units;
  const key = `${wantL.join('\u0001')}|${S.age.text}|${s.units}|${base0}|` + (S.records || []).map((r) => `${r.id}:${r.axis}:` + r.series.filter((se) => wantL.includes(se.name)).map((se) => `${se.name}/${se.color}/${!!se.reverse}/${se.x.length}/${se.y[0]}/${se.y[se.y.length - 1]}`).join(',')).join(';');
  const hit = sideCache.get(s); if (hit?.key === key) return hit.out;
  const out = sideSeriesCalc(s); sideCache.set(s, { key, out }); return out;
}
function sideSeriesCalc(s) {
  const want = new Set(S.settings.sideRecs || []), out = [], base = S.sections[0]?.units || s.units, inv = S.age.model ? invertModel(S.age.model) : null;
  for (const r of S.records || []) for (const se of r.series) {
    if (!want.has(se.name)) continue;
    const pts = [];
    for (let i = 0; i < se.x.length; i++) {
      const d = toAxis(se.x[i], r.axis, 'depth', S.age.model, inv), v = se.y[i];
      if (d == null || v == null || !Number.isFinite(+v)) continue;
      pts.push([(d * UNIT_TO_CM[base]) / UNIT_TO_CM[s.units], +v]);
    }
    if (!pts.length) continue;
    let lo = Infinity, hi = -Infinity; for (const [, v] of pts) { if (v < lo) lo = v; if (v > hi) hi = v; }
    out.push({ name: se.name, color: se.color || '#7fb8d4', reverse: !!se.reverse, pts, lo, hi: hi > lo ? hi : lo + 1 });
  }
  return out;
}
const tickTxt = (v) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v) ? v.toExponential(0) : String(+v.toPrecision(3)));
let profLayout = [];   // V0.24: tracks of the side column [{ id, x0, x1 }] for resizing them from the header
function renderProfile() {
  const s = sec(), W = prof.width, H = prof.height, HEAD = 36;
  pctx.fillStyle = '#121615'; pctx.fillRect(0, 0, W, H); profLayout = [];
  if (!s || !s.bins?.length) return;
  // V0.24: each track has its own width (S.settings.sideW, px; the bioturbation track fills the rest unless set) and can be hidden (sideHide)
  const SW = S.settings.sideW || {}, HID = new Set(S.settings.sideHide || []), showP = !HID.has('pct'), showB = !HID.has('BI'), showI = !HID.has('ii');
  const recs = sideSeries(s), gap = 6, x0 = 8, colW = Math.max(18, Math.min(30, W * 0.13)), recW = Math.max(48, Math.min(90, W * 0.22));
  const wB = SW.BI || colW, wI = SW.ii || colW, wR = recs.map((r) => SW['rec:' + r.name] || recW);
  const fixed = (showB ? wB + gap : 0) + (showI ? wI + gap : 0) + wR.reduce((a, w) => a + w + gap, 0);
  const pw = showP ? SW.pct || Math.max(40, W - x0 - fixed) : 0;
  let x = x0 + (showP ? pw + gap : 0); const bx = x; if (showB) x += wB + gap; const ix = x; if (showI) x += wI + gap;
  const rxs = wR.map((w) => { const a = x; x += w + gap; return a; });
  if (showP) profLayout.push({ id: 'pct', x0, x1: x0 + pw });
  if (showB) profLayout.push({ id: 'BI', x0: bx, x1: bx + wB });
  if (showI) profLayout.push({ id: 'ii', x0: ix, x1: ix + wI });
  recs.forEach((r, k) => profLayout.push({ id: 'rec:' + r.name, x0: rxs[k], x1: rxs[k] + wR[k] }));
  const z = S.view.zoom, vy = S.view.y, yOf = (r) => (s.roi.y0 + r - vy) * z;
  pctx.strokeStyle = '#2c3331'; pctx.lineWidth = 1;
  if (showP) for (const p of [0, 25, 50, 75, 100]) { const xx = Math.round(x0 + (p / 100) * pw) + 0.5; pctx.beginPath(); pctx.moveTo(xx, HEAD); pctx.lineTo(xx, H); pctx.stroke(); }
  const cols = S.classes.map((c) => hex(c.color));
  const pts = [];
  for (const b of s.bins) {
    const y0 = yOf(b.r0), y1 = yOf(b.r1);
    if (y1 < HEAD || y0 > H) continue;
    const hgt = Math.max(1, y1 - y0);
    if (showP) {
      // V0.20: with overlapping traces the class percentages may add up to more than the total: the stack is scaled to the total
      const sum = b.classPct.reduce((a, v) => a + (v || 0), 0), k0 = b.pct != null && sum > b.pct && sum > 0 ? b.pct / sum : 1;
      let acc = 0;
      const spH = new Set(S.logView?.style?.speciesHide || []);   // V0.31
      b.classPct.forEach((v, k) => {
        if (!v || spH.has(S.classes[k]?.name)) return;
        const [r, g, bl] = cols[k]; pctx.fillStyle = `rgba(${r},${g},${bl},.75)`;
        pctx.fillRect(x0 + (acc / 100) * pw, y0, ((v * k0) / 100) * pw, hgt); acc += v * k0;
      });
      if (b.pct != null) pts.push([x0 + (b.pct / 100) * pw, (y0 + y1) / 2]);
    }
    for (const [on, xx, w, val, max, man] of [[showB, bx, wB, b.BI, 6, b.BIm], [showI, ix, wI, b.ii, 6, b.iim]]) {
      if (!on) continue;
      if (val != null) { pctx.fillStyle = '#e0995a'; pctx.fillRect(xx, y0, (val / max) * w, Math.max(1, hgt - (hgt > 3 ? 1 : 0))); }
      if (man != null) { pctx.strokeStyle = '#ffffff'; pctx.strokeRect(xx + (man / max) * w - 1.5, y0 + 0.5, 3, Math.max(1, hgt - 1)); }
    }
  }
  pctx.strokeStyle = '#f3ece0'; pctx.lineWidth = 1.5; pctx.beginPath();
  pts.forEach(([px, py], k) => (k ? pctx.lineTo(px, py) : pctx.moveTo(px, py))); pctx.stroke();
  recs.forEach((r, k) => {   // records: own scale per track (min–max of the whole series)
    const xa = rxs[k], rw = wR[k], xOf = (v) => xa + 2 + (((r.reverse ? r.hi - v : v - r.lo) / (r.hi - r.lo)) * (rw - 4));
    pctx.strokeStyle = '#2c3331'; pctx.lineWidth = 1; pctx.strokeRect(xa + 0.5, HEAD + 0.5, rw - 1, H - HEAD - 1);
    pctx.save(); pctx.beginPath(); pctx.rect(xa, HEAD, rw, H - HEAD); pctx.clip();
    pctx.strokeStyle = r.color; pctx.lineWidth = 1.4; pctx.beginPath(); let on = false;
    for (const [d, v] of r.pts) {
      const yy = (rowAtDepth(s, d) - vy) * z;
      if (d < Math.min(s.top, s.bottom) || d > Math.max(s.top, s.bottom)) { on = false; continue; }
      if (on) pctx.lineTo(xOf(v), yy); else { pctx.moveTo(xOf(v), yy); on = true; }
    }
    pctx.stroke(); pctx.restore();
  });
  // fixed header: titles and horizontal scales (they stay while the view scrolls)
  pctx.fillStyle = '#121615'; pctx.fillRect(0, 0, W, HEAD);
  pctx.strokeStyle = '#3a4240'; pctx.beginPath(); pctx.moveTo(0, HEAD - 0.5); pctx.lineTo(W, HEAD - 0.5); pctx.stroke();
  pctx.fillStyle = '#b5aea2'; pctx.font = '600 10.5px "IBM Plex Sans Condensed", sans-serif'; pctx.textBaseline = 'middle'; pctx.textAlign = 'left';
  const clip = (txt, w) => { let t2 = txt; while (t2.length > 2 && pctx.measureText(t2).width > w) t2 = t2.slice(0, -2) + '…'; return t2; };
  if (showP) pctx.fillText(clip(t('p.pct'), pw), x0, 10); if (showB) pctx.fillText('BI', bx, 10); if (showI) pctx.fillText('ii', ix, 10);
  recs.forEach((r, k) => { pctx.fillStyle = r.color; pctx.fillText(clip(r.name, wR[k] - 2), rxs[k], 10); });
  pctx.font = '9.5px "IBM Plex Mono", monospace'; pctx.fillStyle = '#8f8a80';
  const tick = (xx, txt, align) => { pctx.textAlign = align; pctx.fillText(txt, xx, 26); pctx.fillRect(Math.round(xx), HEAD - 4, 1, 4); };
  if (showP) for (const p of pw < 110 ? [0, 50, 100] : [0, 25, 50, 75, 100]) tick(x0 + (p / 100) * pw, String(p), p === 0 ? 'left' : p === 100 ? 'right' : 'center');
  for (const [on, xx, w] of [[showB, bx, wB], [showI, ix, wI]]) if (on) { tick(xx, '0', 'left'); tick(xx + w, '6', 'right'); }
  recs.forEach((r, k) => {   // narrow tracks: the second number is left out when the two would touch
    const xa = rxs[k], lo = tickTxt(r.reverse ? r.hi : r.lo), hi = tickTxt(r.reverse ? r.lo : r.hi);
    tick(xa + 2, lo, 'left'); if (pctx.measureText(lo).width + pctx.measureText(hi).width + 6 < wR[k] - 4) tick(xa + wR[k] - 2, hi, 'right');
  });
  pctx.fillStyle = '#5b6763'; for (const L of profLayout) pctx.fillRect(Math.round(L.x1) + 2, 3, 1, HEAD - 6);   // resize handles
  pctx.textAlign = 'left';
}
/** Width of the side column: drag its left edge (double click restores it). */
const PROF_EDGE = 6;
function applyProfWidth() { const w = panelPrefs.profW; const vp = prof.parentElement; if (w) vp.style.setProperty('--pw', w + 'px'); else vp.style.removeProperty('--pw'); requestAnimationFrame(() => resizeCanvases()); }
const trackEdge = (e) => (e.offsetY <= 36 ? profLayout.find((L) => Math.abs(e.offsetX - (L.x1 + 2)) <= 4) : null);
prof.addEventListener('pointermove', (e) => { if (!prof._drag) prof.style.cursor = e.offsetX <= PROF_EDGE || trackEdge(e) ? 'col-resize' : ''; });
prof.addEventListener('pointerdown', (e) => {   // V0.24: drag the right edge of a track in the header to change its width
  const L = e.offsetX > PROF_EDGE && trackEdge(e); if (!L) return;
  e.preventDefault(); e.stopImmediatePropagation(); prof.setPointerCapture(e.pointerId); prof._drag = true;
  const r = prof.getBoundingClientRect();
  const move = (ev) => { (S.settings.sideW ||= {})[L.id] = Math.round(Math.max(16, ev.clientX - r.left - L.x0)); requestRender(); };
  const up = () => { prof._drag = false; prof.removeEventListener('pointermove', move); markDirty(); if ($('profMenu').open) renderProfMenu(); };
  prof.addEventListener('pointermove', move); prof.addEventListener('pointerup', up, { once: true });
});
prof.addEventListener('pointerdown', (e) => {
  if (e.offsetX > PROF_EDGE) return;
  e.preventDefault(); prof.setPointerCapture(e.pointerId); prof._drag = true;
  const vp = prof.parentElement, r = vp.getBoundingClientRect();
  const move = (ev) => { const w = Math.round(Math.max(140, Math.min(r.width - 200, r.right - ev.clientX))); panelPrefs.profW = w; vp.style.setProperty('--pw', w + 'px'); resizeCanvases(); };
  const up = () => { prof._drag = false; prof.removeEventListener('pointermove', move); savePanels(); };
  prof.addEventListener('pointermove', move); prof.addEventListener('pointerup', up, { once: true });
});
prof.addEventListener('dblclick', (e) => { if (e.offsetX <= PROF_EDGE) { delete panelPrefs.profW; savePanels(); applyProfWidth(); } });
/** Menu of the side column: each track shown or hidden, its width, and records from Data. */
function renderProfMenu() {
  const box = $('profRecs'); if (!box) return;
  const names = [...new Set((S.records || []).flatMap((r) => r.series.map((x) => x.name)))], on = new Set(S.settings.sideRecs || []), hid = new Set(S.settings.sideHide || []), SW = S.settings.sideW || {};
  const row = (id, label, checked, attr) => `<div class="row" style="gap:6px;flex-wrap:nowrap"><label class="chk" style="flex:1;min-width:0"><input type="checkbox" ${attr} ${checked ? 'checked' : ''}><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span></label><input type="number" data-sw="${esc(id)}" min="16" max="800" step="5" value="${SW[id] ?? ''}" placeholder="${t('fig.auto2')}" title="${esc(t('p.width'))}" style="width:62px"></div>`;
  box.innerHTML = `<b style="font-size:11px">${t('p.tracks')}</b>${row('pct', t('p.pct'), !hid.has('pct'), 'data-sh="pct"')}${row('BI', 'BI', !hid.has('BI'), 'data-sh="BI"')}${row('ii', 'ii', !hid.has('ii'), 'data-sh="ii"')}
    <b style="font-size:11px;margin-top:4px">${t('log.records')}</b>${names.length ? names.map((n) => row('rec:' + n, n, on.has(n), `data-rec="${esc(n)}"`)).join('') : `<p class="note">${t('p.noRecs')}</p>`}
    <p class="note">${t('p.widthNote')}</p>`;
}
$('profRecs').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.sw != null) { const W = (S.settings.sideW ||= {}); if (+el.value >= 16) W[el.dataset.sw] = Math.min(800, +el.value); else delete W[el.dataset.sw]; }
  else if (el.dataset.sh) { const h = new Set(S.settings.sideHide || []); if (el.checked) h.delete(el.dataset.sh); else h.add(el.dataset.sh); S.settings.sideHide = [...h]; }
  else S.settings.sideRecs = [...$('profRecs').querySelectorAll('[data-rec]:checked')].map((i) => i.dataset.rec);
  markDirty(); requestRender();
});
$('profMenu').addEventListener('toggle', () => { if ($('profMenu').open) renderProfMenu(); });

/* ───────────── view ───────────── */

function clampView() {
  const s = sec(); if (!s) return;
  const z = S.view.zoom, cw = view.width / z, ch = view.height / z;
  S.view.x = Math.min(Math.max(S.view.x, -cw + 40 / z), s.w - 40 / z);
  S.view.y = Math.min(Math.max(S.view.y, -ch + 40 / z), s.h - 40 / z);
}
function fitView() {
  const s = sec(); if (!s) return;
  const G = navGut(), rw = s.roi.x1 - s.roi.x0, z = Math.min(8, Math.max(0.02, (view.width - 76 - G) / rw));
  S.view = { zoom: z, x: s.roi.x0 - (62 + G) / z, y: s.roi.y0 - 12 / z };
  requestRender();
}
function zoomAt(sx, sy, f) {
  const z0 = S.view.zoom, z = Math.min(40, Math.max(0.02, z0 * f));
  S.view.x += sx / z0 - sx / z; S.view.y += sy / z0 - sy / z; S.view.zoom = z;
  clampView(); requestRender();
}
function centerOn(o) {
  const [x0, y0, x1, y1] = o.bbox;   // pans only: the zoom chosen by the user is kept
  const z = S.view.zoom;
  S.view.x = (x0 + x1) / 2 - view.width / (2 * z); S.view.y = (y0 + y1) / 2 - view.height / (2 * z);
  clampView(); requestRender();
}

/* ───────────── pointer tools ───────────── */

let drag = null, spaceDown = false;
function toImg(e) { const r = view.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; return { sx, sy, x: S.view.x + sx / S.view.zoom, y: S.view.y + sy / S.view.zoom }; }
const inImg = (s, p) => p.x >= 0 && p.y >= 0 && p.x < s.w && p.y < s.h;

function paintAt(op, cx, cy) {
  const s = op.s, r = S.brushSize, r2 = r * r;
  const xa = Math.max(0, Math.floor(cx - r)), xb = Math.min(s.w - 1, Math.ceil(cx + r)), ya = Math.max(0, Math.floor(cy - r)), yb = Math.min(s.h - 1, Math.ceil(cy + r));
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r2) continue;
    const i = y * s.w + x; grow(op, x, y);
    if (op.mode === 'brush') addPx(op, i, op.target);
    else if (op.mode === 'erase') { if (op.only) subPx(op, i, op.only); else setLabel(op, i, 0); }   // V0.20: Mayús = only the selected trace
    else setEx(op, i, op.mode === 'exclude' ? 1 : 0);
  }
}
function paintSeg(op, a, b) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(dist / Math.max(1, S.brushSize / 3)));
  for (let k = 1; k <= n; k++) paintAt(op, a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
}

view.addEventListener('pointerdown', (e) => {
  const s = sec(); if (!s || !s.orig) return;
  view.setPointerCapture(e.pointerId);
  const p = toImg(e);
  if (e.button === 1 || S.tool === 'pan' || spaceDown) { drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y }; return; }
  if (e.button !== 0) return;
  const eh = edgeHit(s, p.sx, p.sy);
  if (eh) { drag = { type: 'edge', which: eh }; return; }
  const tool = S.tool;
  // Selection: click selects; Shift/Ctrl+click adds or removes; dragging draws a box (Shift/Ctrl adds to the selection).
  if (tool === 'select') drag = { type: 'select', sx: e.clientX, sy: e.clientY, moved: false, p, add: e.shiftKey || e.ctrlKey || e.metaKey };
  else if ((tool === 'exclude' || tool === 'include') && (e.shiftKey || S.exShape === 'rect')) { boxDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; drag = { type: 'exrect', mode: tool }; }
  else if (tool === 'roi') { roiDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; drag = { type: 'roi' }; }
  else if (tool === 'mark') { toggleMark(s, p, e.altKey); return; }
  else if (tool === 'cut') { lassoPts = [[p.x, p.y]]; drag = { type: 'cut' }; }
  else if (tool === 'lasso') { lassoPts = [[p.x, p.y]]; drag = { type: 'lasso', mode: e.altKey ? 'sub' : e.shiftKey ? 'add' : 'new' }; }
  else if (tool === 'wand') {
    if (!inImg(s, p)) return;
    const seed = Math.floor(p.y) * s.w + Math.floor(p.x);
    applyPixels(regionGrow(S.showOrig ? s.orig : s.enh, s.w, s.h, seed, S.wandTol, s.roi, s.exclude), e.altKey ? 'sub' : e.shiftKey ? 'add' : 'new');
  } else {
    const op = beginOp(s); op.mode = tool;
    if (tool === 'brush') {
      const under = inImg(s, p) ? topLab(s, Math.floor(p.y) * s.w + Math.floor(p.x)) : 0;
      op.target = e.shiftKey && S.selected ? S.selected : ((!S.overlap || s.objects.get(under)?.cls === S.active) && under) || newObject(s, S.active, 'brush').id;   // V0.30: over a trace of the active ichnotaxon the brush extends it   // V0.20: with «Superponer», a new trace
      rebuildLUT(s);
    }
    if (tool === 'erase' && e.shiftKey && S.selected) op.only = S.selected;
    paintAt(op, p.x, p.y);
    drag = { type: 'paint', op, last: p };
    requestRender();
  }
});

view.addEventListener('pointermove', (e) => {
  const s = sec(); if (!s) return;
  const p = toImg(e); cursor = p;
  updateStatus(s, p);
  if (!drag) { view.style.cursor = edgeHit(s, p.sx, p.sy) ? 'ns-resize' : ''; if (['brush', 'erase', 'exclude', 'include'].includes(S.tool)) requestRender(); return; }
  if (drag.type === 'edge') {
    const y = Math.round(Math.min(s.h, Math.max(0, p.y)));
    if (cropState?.s === s) { if (drag.which === 'a') cropState.y0 = Math.min(y, cropState.y1 - 10); else cropState.y1 = Math.max(y, cropState.y0 + 10); updateCropInfo(); }
    else if (drag.which === 'a') s.roi = { ...s.roi, y0: Math.min(y, s.roi.y1 - 4) }; else s.roi = { ...s.roi, y1: Math.max(y, s.roi.y0 + 4) };
    requestRender(); return;
  }
  if (drag.type === 'select') {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    boxDrag = { x0: drag.p.x, y0: drag.p.y, x1: p.x, y1: p.y }; drag = { type: 'box', add: drag.add }; requestRender();
  } else if (drag.type === 'pan') {
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    S.view.x = drag.vx - dx / S.view.zoom; S.view.y = drag.vy - dy / S.view.zoom; clampView(); requestRender();
  } else if (drag.type === 'paint') { paintSeg(drag.op, drag.last, p); drag.last = p; requestRender(); }
  else if (drag.type === 'lasso' || drag.type === 'cut') { lassoPts.push([p.x, p.y]); requestRender(); }
  else if (drag.type === 'roi') { roiDrag.x1 = p.x; roiDrag.y1 = p.y; requestRender(); }
  else if (drag.type === 'box' || drag.type === 'exrect') { boxDrag.x1 = p.x; boxDrag.y1 = p.y; requestRender(); }
});

function endDrag() {
  const s = sec(); const d = drag; drag = null; if (!d || !s) return;
  if (d.type === 'edge') { if (!cropState) setRoi(s, { ...s.roi }); return; }
  if (d.type === 'select') {
    const p = d.p, v = inImg(s, p) ? s.labels[Math.floor(p.y) * s.w + Math.floor(p.x)] : 0, ids = idsAt(v, s.stacks);
    // V0.20: clicking again on an overlap selects the trace underneath
    const k = ids.indexOf(S.selected), id = ids.length > 1 && k >= 0 ? ids[(k + ids.length - 1) % ids.length] : topAt(v, s.stacks);
    if (d.add) toggleSelect(id); else select(id);
  } else if (d.type === 'exrect') {
    const r = boxDrag; boxDrag = null;
    const x0 = Math.max(0, Math.floor(Math.min(r.x0, r.x1))), x1 = Math.min(s.w - 1, Math.ceil(Math.max(r.x0, r.x1)));
    const y0 = Math.max(0, Math.floor(Math.min(r.y0, r.y1))), y1 = Math.min(s.h - 1, Math.ceil(Math.max(r.y0, r.y1)));
    if (x1 <= x0 || y1 <= y0) { requestRender(); return; }
    const op = beginOp(s); op.mode = d.mode;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { setEx(op, y * s.w + x, d.mode === 'exclude' ? 1 : 0); }
    grow(op, x0, y0); grow(op, x1, y1);
    finishPixelOp(op, 0);
  } else if (d.type === 'box') {
    const r = boxDrag; boxDrag = null;
    const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
    if (!d.add) S.multi.clear(); else if (S.selected) S.multi.add(S.selected);
    for (const o of s.objects.values()) { if (!o.bbox) continue; const cx = (o.bbox[0] + o.bbox[2]) / 2, cy = (o.bbox[1] + o.bbox[3]) / 2; if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) S.multi.add(o.id); }
    S.selected = [...S.multi][0] || 0; renderObject(); requestRender(); if (S.multi.size) showTab('object', true);
  } else if (d.type === 'paint') finishPixelOp(d.op, d.op.mode === 'brush' ? d.op.target : 0);
  else if (d.type === 'cut') { const pts = lassoPts; lassoPts = null; splitAlong(pts); requestRender(); }
  else if (d.type === 'lasso') {
    const pts = lassoPts; lassoPts = null;
    applyPixels(polygonPixels(pts, s.w, s.roi), d.mode); requestRender();
  } else if (d.type === 'roi') {
    const r = roiDrag; roiDrag = null;
    const x0 = Math.max(0, Math.round(Math.min(r.x0, r.x1))), x1 = Math.min(s.w, Math.round(Math.max(r.x0, r.x1)));
    const y0 = Math.max(0, Math.round(Math.min(r.y0, r.y1))), y1 = Math.min(s.h, Math.round(Math.max(r.y0, r.y1)));
    if (x1 - x0 > 4 && y1 - y0 > 4) setRoi(s, { x0, y0, x1, y1 });
    setTool(S.prevTool);
  }
}
view.addEventListener('pointerup', endDrag);
view.addEventListener('pointercancel', endDrag);
view.addEventListener('pointerleave', () => { cursor = null; requestRender(); });
view.addEventListener('wheel', (e) => {
  if (!sec()) return;
  e.preventDefault();
  const k = e.deltaMode === 1 ? 16 : 1;
  if (e.ctrlKey || e.metaKey) { const p = toImg(e); zoomAt(p.sx, p.sy, Math.exp(-e.deltaY * k * 0.0025)); }
  else { S.view.x += (e.shiftKey ? e.deltaY : e.deltaX) * k / S.view.zoom; if (!e.shiftKey) S.view.y += e.deltaY * k / S.view.zoom; clampView(); requestRender(); }
}, { passive: false });

function updateStatus(s, p) {
  const inside = inImg(s, p);
  $('stDepth').textContent = inside ? t('status.depth', { d: fmt(depthAtRow(s, p.y), 3), u: s.units }) : '';
  $('stPx').textContent = inside ? `x ${Math.floor(p.x)} · y ${Math.floor(p.y)}` : '';
  const id = inside ? topLab(s, Math.floor(p.y) * s.w + Math.floor(p.x)) : 0, o = id && s.objects.get(id);
  $('stObj').textContent = o ? `#${o.id} ${clsById(o.cls || o.pred)?.name || t('obj.unassigned')} · ${t('obj.' + status(o))}` : '';
}

function setRoi(s, roi) {
  s.roi = roi; s.logVer++; markDirty(); if (s.filters.autoLevels) enhance(s); recomputeFeatures(s); scheduleLearn(); scheduleAnalysis(); renderSectionForm(); requestRender();
}

/* ───────────── keyboard ───────────── */

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog')) return;
  // shortcuts belong to the Bioturbation image only: not on the start screen, not in other modes, and a focused button keeps Space/Enter
  if (mode !== 'section' || !$('home').hidden || tourStep >= 0 || (e.target.closest('button, a, summary, [role=tab], label') && (e.key === ' ' || e.key === 'Enter'))) return;
  const k = e.key, s = sec();
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (!singleKeys && k.length === 1 && k !== ' ' && !e.ctrlKey && !e.metaKey) return;   // V0.39: single-character shortcuts can be turned off (WCAG 2.1.4)
  if (k === ' ') { spaceDown = true; view.classList.add('pan'); e.preventDefault(); return; }
  const tools = { v: 'select', w: 'wand', b: 'brush', l: 'lasso', c: 'cut', e: 'erase', x: 'exclude', h: 'pan', m: 'mark' };
  if (tools[k.toLowerCase()] && !e.ctrlKey && !e.metaKey) { setTool(tools[k.toLowerCase()]); return; }
  if (k.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) { setOverlap(!S.overlap); toast(t(S.overlap ? 'ov.on' : 'ov.off')); return; }   // V0.29
  if (!s) return;
  if (/^[0-9]$/.test(k)) {
    const c = k === '0' ? clsById('artifact') : S.classes[+k - 1];
    if (!c) return;
    const ids = selectedIds();
    if (ids.length) assignClassMany(ids, c.id); else setActive(c.id);
    return;
  }
  switch (k) {
    case 'Escape': select(0); break;
    case 'Delete': case 'Backspace': { const ids = selectedIds(); if (ids.length) { e.preventDefault(); deleteObjects(ids); } break; }
    case 'Enter': acceptSuggestions(selectedIds()); break;
    case 'n': case 'N': e.preventDefault(); nextReview(e.shiftKey); break;
    case 'o': case 'O': $('showOrig').checked = S.showOrig = !S.showOrig; requestRender(); break;
    case 'f': case 'F': fitView(); break;
    case '+': case '=': zoomAt(view.width / 2, view.height / 2, 1.25); break;
    case '-': zoomAt(view.width / 2, view.height / 2, 0.8); break;
    case '[': setBrush(S.brushSize - Math.max(1, Math.round(S.brushSize * 0.15))); break;
    case ']': setBrush(S.brushSize + Math.max(1, Math.round(S.brushSize * 0.15))); break;
  }
});
document.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; view.classList.toggle('pan', S.tool === 'pan'); } });

function nextReview(back = false) {
  const s = sec(); if (!s) return;
  const list = [...s.objects.values()].filter((o) => !o.cls && o.bbox).sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
  if (!list.length) { select(0); return; }
  const cur = s.objects.get(S.selected);
  let o;
  if (!cur?.bbox) o = list[0];
  else {
    const key = (q) => q.bbox[1] * 1e6 + q.bbox[0] + q.id * 1e-6, kc = key(cur);
    o = back ? [...list].reverse().find((q) => key(q) < kc) || list[list.length - 1] : list.find((q) => key(q) > kc) || list[0];
  }
  select(o.id); centerOn(o); showTab('object');
}

/* ───────────── UI: panels ───────────── */

function setTool(tool) {
  if (tool === 'roi') S.prevTool = S.tool === 'roi' ? S.prevTool : S.tool;
  S.tool = tool;
  document.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
  $('optSize').hidden = !['brush', 'erase', 'exclude', 'include'].includes(tool);
  $('optTol').hidden = tool !== 'wand';
  $('optShape').hidden = !['exclude', 'include'].includes(tool);
  $('optOverlap').hidden = !['brush', 'wand', 'lasso'].includes(tool);
  view.classList.toggle('pan', tool === 'pan');
  requestRender();
}
$('exShape').addEventListener('change', (e) => { S.exShape = e.target.value; });
/* V0.29: «Superponer» is on by default and remembered in the browser; key S toggles it */
try { S.overlap = localStorage.getItem('ichantool.overlap') !== '0'; } catch { S.overlap = true; }
$('overlapMode').checked = S.overlap;
function setOverlap(on) { S.overlap = !!on; $('overlapMode').checked = S.overlap; try { localStorage.setItem('ichantool.overlap', S.overlap ? '1' : '0'); } catch { /* storage blocked */ } }
$('overlapMode').addEventListener('change', (e) => setOverlap(e.target.checked));
function setBrush(v) { S.brushSize = Math.max(1, Math.min(120, v)); $('brushSize').value = S.brushSize; $('brushOut').textContent = S.brushSize; requestRender(); }
function setActive(id) { S.active = id; if (S.settings.solo) { setHidden(S.classes.filter((c) => c.id !== id).map((c) => c.id)); } renderClasses(); renderSelTools(sec()); }
function select(id) { S.selected = id || 0; S.multi.clear(); renderObject(); requestRender(); if (id) showTab('object', true); }
function toggleSelect(id) {
  if (!id) return;
  if (S.selected && !S.multi.size) S.multi.add(S.selected);
  if (S.multi.has(id)) S.multi.delete(id); else S.multi.add(id);
  S.selected = S.multi.has(id) ? id : [...S.multi][0] || 0;
  if (S.multi.size === 1) S.multi.clear();
  renderObject(); requestRender(); showTab('object', true);
}
/** Select every object of the section that matches a filter (e.g. all suggested as a class). */
function selectWhere(fn) {
  const s = sec(); if (!s) return;
  S.multi = new Set([...s.objects.values()].filter((o) => o.bbox && fn(o)).map((o) => o.id));
  S.selected = [...S.multi][0] || 0; if (S.multi.size === 1) S.multi.clear();
  renderObject(); requestRender();
}

function showTab(name, soft = false) {
  if (soft && $('sideTabs').querySelector('[aria-selected="true"]')?.dataset.tab === 'results') return;
  setTimeout(() => { if (typeof updateTip === 'function') updateTip(); }, 0);
  $('sideTabs').querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.dataset.pane !== name));
}

function renderClasses() {
  const s = sec(), nObj = {}, nEx = {}, hid = hiddenCls();
  if (s) for (const o of s.objects.values()) { const c = effClassId(o); if (c) nObj[c] = (nObj[c] || 0) + 1; }
  for (const x of S.sections) for (const o of x.objects.values()) if (o.cls) nEx[o.cls] = (nEx[o.cls] || 0) + 1;
  $('classList').innerHTML = S.classes.map((c) => `
    <li data-id="${c.id}" class="${c.id === S.active ? 'active' : ''} ${c.plain ? 'plain' : ''} ${hid.has(c.id) ? 'hid' : ''}">
      <button class="eye ${hid.has(c.id) ? 'off' : ''}" title="${esc(t(hid.has(c.id) ? 'cls.show' : 'cls.hide'))}" aria-label="${esc(t(hid.has(c.id) ? 'cls.show' : 'cls.hide'))}">👁</button>
      <kbd>${keyOf(c)}</kbd>
      <input type="color" value="${c.color}" aria-label="${t('a11y.color')}">
      <input class="name" type="text" value="${esc(c.name)}" aria-label="${t('a11y.name')}">
      <span class="cnt">${idMode() ? t('id.count', { n: S.sections.reduce((a, x) => a + (x.marks || []).filter((m) => m.cls === c.id).length, 0) }) : t('cls.counts', { n: nObj[c.id] || 0, e: nEx[c.id] || 0 })}</span>
      ${c.fixed ? `<span title="${esc(t('gx.fixedCls'))}"></span>` : `<button class="del" title="${esc(t('gx.delCls'))}" aria-label="${esc(t('gx.delCls'))}">✕</button>`}
    </li>`).join('');
}
/** Two-step confirmation for actions that cannot be undone: the first click arms the button (text and colour change) for 4 s. */
function armed(btn, msg) {
  if (!btn) return true;
  if (btn.dataset.armed === '1') { btn.dataset.armed = ''; clearTimeout(btn._armT); btn.textContent = btn._armTxt; btn.classList.remove('danger'); return true; }
  btn._armTxt = btn.textContent; btn.dataset.armed = '1'; btn.textContent = msg || t('confirm.click'); btn.classList.add('danger');
  btn._armT = setTimeout(() => { btn.dataset.armed = ''; btn.textContent = btn._armTxt; btn.classList.remove('danger'); }, 4000);
  return false;
}
export const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

function setHidden(ids) {
  S.settings.hidden = [...ids]; for (const x of S.sections) rebuildLUT(x);
  markDirty(); renderClasses(); requestRender();
}
$('clsSolo').addEventListener('click', () => { S.settings.solo = true; setHidden(S.classes.filter((c) => c.id !== S.active).map((c) => c.id)); });   // follows the active ichnotaxon until «Show all»
$('clsShowAll').addEventListener('click', () => { S.settings.solo = false; setHidden([]); });
$('classList').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  if (e.target.classList.contains('eye')) { S.settings.solo = false; const h = hiddenCls(), id = li.dataset.id; if (h.has(id)) h.delete(id); else h.add(id); setHidden(h); return; }
  if (e.target.classList.contains('del')) {
    const id = li.dataset.id;
    for (const s of S.sections) for (const o of s.objects.values()) { if (o.cls === id) o.cls = null; if (o.pred === id) o.pred = null; }
    S.classes = S.classes.filter((c) => c.id !== id);
    if (S.active === id) S.active = 'undet';
    for (const s of S.sections) rebuildLUT(s);
    scheduleLearn(); renderClasses(); requestRender(); return;
  }
  if (e.target.tagName !== 'INPUT') setActive(li.dataset.id);
});
$('classList').addEventListener('input', (e) => {
  const li = e.target.closest('li'), c = clsById(li?.dataset.id); if (!c) return;
  if (e.target.type === 'color') { c.color = e.target.value; for (const s of S.sections) rebuildLUT(s); requestRender(); }
  else c.name = e.target.value;
});
$('classList').addEventListener('change', () => { renderObject(); renderLearn(); renderResults(); });
$('addClass').addEventListener('click', () => {
  const palette = ['#5ec2b7', '#c77dff', '#ffb703', '#e76f51', '#90be6d', '#4ea8de', '#f4978e', '#9a8c98'];
  const c = { id: 'c' + uid(), name: t('cls.new'), color: palette[S.classes.length % palette.length], counts: true };
  S.classes.splice(S.classes.length - 1, 0, c); setActive(c.id);
  const inp = document.querySelector(`#classList li[data-id="${c.id}"] input.name`); inp?.focus(); inp?.select();
});

/** Accept the automatic suggestion of each object that has one (one undo step). */
function acceptSuggestions(ids) {
  const s = sec(); if (!s) return;
  const objs = ids.map((id) => s.objects.get(id)).filter((o) => o?.pred && !o.cls); if (!objs.length) return;
  const op = beginOp(s);
  for (const o of objs) { o.cls = o.pred; o.pred = null; o.conf = 0; }
  commitOp(op, true); afterChange(s);
}

function renderSelTools(s) {
  const el = $('selTools'); if (!el) return;
  const c = clsById(S.active);
  el.innerHTML = s ? `<button class="btn small" id="selPred">${t('obj.selPred', { c: esc(c?.name || '') })}</button><button class="btn small" id="selCand">${t('obj.selCand')}</button>` : '';
  if (!s) return;
  $('selPred').onclick = () => selectWhere((o) => !o.cls && o.pred === S.active);
  $('selCand').onclick = () => selectWhere((o) => !o.cls);
}

function renderMulti(s, box) {
  const objs = [...S.multi].map((id) => s.objects.get(id)).filter(Boolean);
  const n = (f) => objs.filter(f).length;
  const opts = S.classes.map((c) => `<option value="${c.id}" ${c.id === S.active ? 'selected' : ''}>${keyOf(c) ? keyOf(c) + ' · ' : ''}${esc(c.name)}</option>`).join('');
  box.innerHTML = `<p><b>${t('obj.multiN', { n: objs.length })}</b></p>
    <p class="note">${t('obj.multiDetail', { m: n((o) => o.cls), p: n((o) => !o.cls && o.pred), c: n((o) => !o.cls && !o.pred) })}</p>
    <select id="multiCls" style="width:100%">${opts}</select><div class="row"><button class="btn small primary" id="multiAssign">${t('obj.multiAssign')}</button>
    ${n((o) => !o.cls && o.pred) ? `<button class="btn small" id="multiAccept">${t('obj.multiAccept')}</button>` : ''}<button class="btn small" id="multiClear">${t('obj.multiClear')}</button><button class="btn small" id="multiMerge" data-tip="${esc(t('obj.mergeTip'))}">${t('obj.merge')}</button><button class="btn small" id="multiDel">${t('obj.multiDel')}</button></div>
    <p class="note">${t('obj.multiHint')}</p>`;
  $('multiAssign').onclick = () => assignClassMany(objs.map((o) => o.id), $('multiCls').value);
  if ($('multiAccept')) $('multiAccept').onclick = () => acceptSuggestions(objs.map((o) => o.id));
  $('multiClear').onclick = () => select(0);
  $('multiDel').onclick = () => deleteObjects(objs.map((o) => o.id));
  $('multiMerge').onclick = () => mergeObjects(objs.map((o) => o.id));
}

/** The list follows the current selection; without one it can show all traces in the section. */
let objListHasSelection = false;
function renderObjectList(s) {
  const list = $('objList'), ids = selectedIds(), selected = ids.length > 0;
  if (selected !== objListHasSelection) { list.open = selected; objListHasSelection = selected; }
  list.hidden = !s;
  if (!s) return;
  const objs = (selected ? ids.map((id) => s.objects.get(id)) : [...s.objects.values()])
    .filter((o) => o?.bbox).sort((a, b) => a.bbox[1] - b.bbox[1] || a.id - b.id);
  list.querySelector('summary').textContent = t(selected ? 'obj.listSelected' : 'obj.listAll', { n: objs.length });
  const items = list.querySelector('.obj-list-items');
  if (!list.open) { items.innerHTML = ''; return; }
  items.innerHTML = objs.map((o) => {
    const name = clsById(o.cls || o.pred)?.name || t('obj.unassigned');
    const depth = `${fmt(depthAtRow(s, o.bbox[1]), 3)}–${fmt(depthAtRow(s, o.bbox[3] + 1), 3)} ${s.units}`;
    return `<button class="btn small" data-obj-id="${o.id}" title="${esc(t(selected ? 'obj.listFocus' : 'obj.listSelect'))}">#${o.id} · ${esc(name)} · ${esc(depth)}</button>`;
  }).join('') || `<p class="note">${t('obj.listEmpty')}</p>`;
}
$('objList').addEventListener('toggle', () => renderObjectList(sec()));
$('objList').addEventListener('click', (e) => {
  const button = e.target.closest('[data-obj-id]'), s = sec();
  const o = button && s?.objects.get(Number(button.dataset.objId));
  if (!o?.bbox) return;
  if (!selectedIds().length) select(o.id);
  centerOn(o);
});

function renderObject() {
  const s = sec(), o = s?.objects.get(S.selected), box = $('objInfo');
  renderSelTools(s);
  renderObjectList(s);
  if (s && S.multi.size > 1) { renderMulti(s, box); return; }
  if (!o) { box.innerHTML = `<p class="note">${t('obj.none')}</p>`; return; }
  const st = status(o), ppu = pxPerCm(s), f = o.feat || {}, [, y0, , y1] = o.bbox;
  const opts = [`<option value="">${t('obj.unassigned')}</option>`].concat(S.classes.map((c) => `<option value="${c.id}" ${c.id === o.cls ? 'selected' : ''}>${keyOf(c) ? keyOf(c) + ' · ' : ''}${esc(c.name)}</option>`)).join('');
  const sugg = o.pred ? `<span class="swatch" style="background:${clsById(o.pred)?.color}"></span>${esc(clsById(o.pred)?.name || '')} · ${Math.round(o.conf * 100)}%` : o.novel ? t('obj.novel') : '—';
  const u = s.units, toU = (cm) => cm / UNIT_TO_CM[u];
  box.innerHTML = `
    <dl class="kv">
      <dt>${t('obj.class')}</dt><dd><select id="objCls">${opts}</select></dd>
      <dt>${t('obj.status')}</dt><dd><span class="pill ${st}">${t('obj.' + st)}</span></dd>
      ${o.cls ? '' : `<dt>${t('obj.suggest')}</dt><dd>${sugg}</dd>`}
      ${o.cls || !xOf(o) ? '' : `<dt>${t('obj.probs')}</dt><dd>${probTable(o)}</dd>`}
      <dt>${t('obj.depth')}</dt><dd>${fmt(depthAtRow(s, y0), 3)}–${fmt(depthAtRow(s, y1 + 1), 3)} ${u}</dd>
      <dt>${t('obj.size')}</dt><dd>${fmt(toU(f.majorCm), 3)} × ${fmt(toU(f.minorCm), 3)} ${u}</dd>
      <dt>${t('obj.area')}</dt><dd>${fmt(o.area / (ppu * ppu) / UNIT_TO_CM[u] ** 2, 4)} ${u}² · ${o.area} px</dd>
      <dt>${t('obj.shape')}</dt><dd>${t('obj.elong')} ${fmt(f.elong, 1)} · ${t('obj.vert')} ${fmt(f.vert, 2)}</dd>
    </dl>
    <div class="row">${o.pred && !o.cls ? `<button class="btn small primary" id="objAccept">${t('obj.accept')}</button>` : ''}<button class="btn small" id="objDel">${t('obj.delete')}</button></div>
    <p class="note">${t('obj.multiHint')}</p>`;
  $('objCls').onchange = (e) => { const v = e.target.value || null; if (v) assignClass(o.id, v); else { const op = beginOp(s); o.cls = null; commitOp(op, true); afterChange(s); } };
  $('objDel').onclick = () => deleteObject(o.id);
  if ($('objAccept')) $('objAccept').onclick = () => assignClass(o.id, o.pred);
}

/** Probability of each ichnotaxon for one object according to the three models (top 4 classes). */
function probTable(o) {
  const x = xOf(o); if (!x) return '—';
  const P = Object.fromEntries(CLF_SCOPES.map((k) => [k, clfs[k].predict(x)]));
  const tot = {}; for (const k of CLF_SCOPES) for (const [n, v] of Object.entries(P[k]?.probs || {})) tot[n] = (tot[n] || 0) + v;
  const names = Object.keys(tot).sort((a, b) => tot[b] - tot[a]).slice(0, 4);
  if (!names.length) return '—';
  const sc = S.settings.clfScope || 'project', col = (n) => S.classes.find((c) => c.name === n)?.color || '#999';
  return `<table class="dtable mtab"><thead><tr><th></th>${CLF_SCOPES.map((k) => `<th${k === sc ? ' class="on"' : ''}>${t('l.scope.' + k)}</th>`).join('')}</tr></thead><tbody>${
    names.map((n) => `<tr><td class="txt"><span class="swatch" style="background:${col(n)}"></span>${esc(n)}</td>${CLF_SCOPES.map((k) => `<td${k === sc ? ' class="on"' : ''}>${P[k] ? Math.round((P[k].probs[n] || 0) * 100) + '%' : '—'}</td>`).join('')}</tr>`).join('')}${
    CLF_SCOPES.some((k) => P[k]?.novel) ? `<tr><td class="txt" colspan="4">${t('obj.novelBy', { m: CLF_SCOPES.filter((k) => P[k]?.novel).map((k) => t('l.scope.' + k)).join(', ') })}</td></tr>` : ''}</tbody></table>`;
}

function renderLearn() {
  const counts = clf.counts || {}, total = clf.n || 0, s = sec();
  const sc = S.settings.clfScope || 'project';
  $('clfScopeBox').innerHTML = `<p class="note" style="margin:0">${t('ml.p.method')}: <b>${t('ml.m.' + (S.settings.ml?.method || 'knn'))}</b></p><label class="f"><span>${t('l.scope')}</span><select id="clfScope">${CLF_SCOPES.map((k) => `<option value="${k}" ${k === sc ? 'selected' : ''}>${t('l.scope.' + k)}</option>`).join('')}</select></label>
    <table class="dtable mtab"><thead><tr><th></th>${CLF_SCOPES.map((k) => `<th>${t('l.scope.' + k)}</th>`).join('')}</tr></thead><tbody>
    <tr><td class="txt">${t('l.examples')}</td>${CLF_SCOPES.map((k) => `<td>${clfs[k].n || 0}</td>`).join('')}</tr>
    <tr><td class="txt">${t('l.accuracy')}</td>${CLF_SCOPES.map((k) => `<td>${clfs[k].accuracy == null ? '—' : Math.round(clfs[k].accuracy * 100) + '%'}</td>`).join('')}</tr></tbody></table>`;
  $('clfScope').onchange = (e) => { S.settings.clfScope = e.target.value; markDirty(); learnNow(); };
  const pending = s ? [...s.objects.values()].filter((o) => status(o) === 'predicted').length : 0;
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
    const c = clsById(id); return c ? `<div><span><span class="swatch" style="background:${c.color}"></span>${esc(c.name)}</span><em>${n}</em></div>` : '';
  }).join('');
  $('learnStats').innerHTML = total ? `
    <div class="stat"><div><b>${total}</b><span>${t('l.examples')}</span></div>
      <div><b>${clf.accuracy == null ? '—' : Math.round(clf.accuracy * 100) + '%'}</b><span>${clf.accuracy == null ? t('l.accNA') : t('l.accuracy')}</span></div>
      <div><b>${pending}</b><span>${t('l.pending', { n: '' }).trim()}</span></div></div>
    <div class="bars">${rows}</div>
    ${S.library.length ? `<p class="note">${t('l.library')}: ${S.library.length}</p>` : ''}` : `<p class="note">${t('l.none')}</p>`;
  $('acceptPred').disabled = !pending;
}

function renderResults() {
  const s = sec(), sum = $('resSummary'), tab = $('resTable');
  if (!s || !s.bins?.length) { sum.innerHTML = `<p class="note">${t('r.empty')}</p>`; tab.innerHTML = ''; return; }
  let v = 0, b = 0; const cls = new Array(S.classes.length).fill(0);
  for (const x of s.bins) { if (!x.valid) continue; v += x.valid; b += (x.pct / 100) * x.valid; x.classPct.forEach((p, k) => (cls[k] += ((p || 0) / 100) * x.valid)); }
  const eff = effClassArray(s); let nObj = 0; for (const o of s.objects.values()) if (eff[o.id] >= 0) nObj++;
  const ppu = pxPerCm(s), area = v / (ppu * ppu) / UNIT_TO_CM[s.units] ** 2;
  const bars = S.classes.map((c, k) => ({ c, p: v ? (cls[k] / v) * 100 : 0 })).filter((x) => x.p > 0).sort((a, c) => c.p - a.p)
    .map(({ c, p }) => `<div><span>${esc(c.name)}<i style="width:${Math.max(2, p)}%;background:${c.color}"></i></span><em>${fmt(p, 2)}%</em></div>`).join('');
  sum.innerHTML = `
    <div class="stat"><div><b>${fmt(v ? (b / v) * 100 : null, 1)}%</b><span>${t('r.mean')}</span></div>
      <div><b>${fmt(area, area < 10 ? 2 : 0)}</b><span>${t('r.area')} (${s.units}²)</span></div>
      <div><b>${nObj}</b><span>${t('r.objects')}</span></div></div>
    ${bars ? `<div class="lbl">${t('r.byClass')}</div><div class="bars">${bars}</div>` : ''}`;
  const MAX = 600, hasAge = !!S.age.model;
  const opt = (lo, val) => `<option value=""></option>` + Array.from({ length: 7 - lo }, (_, k) => k + lo).map((n) => `<option ${val === n ? 'selected' : ''}>${n}</option>`).join('');
  const rows = s.bins.slice(0, MAX).map((x) => `<tr data-i="${x.index}"><td>${fmt(x.depth, 3)}</td>${hasAge ? `<td>${fmt(x.age, 3)}</td>` : ''}<td>${fmt(x.pct, 2)}</td>
    <td>${x.BI ?? '—'}</td><td><select data-k="BI" aria-label="BI ${t('r.manual')}">${opt(0, x.BIm)}</select></td>
    <td>${x.ii ?? '—'}</td><td><select data-k="ii" aria-label="ii ${t('r.manual')}">${opt(1, x.iim)}</select></td></tr>`).join('');
  tab.innerHTML = `<div class="tablewrap"><table><thead><tr><th>${t('r.depth')} (${s.units})</th>${hasAge ? `<th>${t('r.age')} (${esc(S.age.units)})</th>` : ''}<th>%</th><th>BI</th><th>BI ${t('r.manual')}</th><th>ii</th><th>ii ${t('r.manual')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${s.bins.length > MAX ? `<p class="note">${t('r.tooMany', { n: MAX })}</p>` : ''}`;
}
$('resTable').addEventListener('change', (e) => {
  const sel = e.target.closest('select'), tr = e.target.closest('tr'), s = sec(); if (!sel || !tr || !s) return;
  const b = s.bins[+tr.dataset.i]; setManual(s, b, sel.dataset.k, sel.value === '' ? null : +sel.value);
  analyze(s); requestRender();
});

/* section form */
function renderSectionForm() {
  const s = sec();
  $('secSel').innerHTML = S.sections.map((x, k) => `<option value="${k}" ${k === S.cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  for (const id of ['secName', 'secTop', 'secBottom', 'secUnits', 'secDel', 'roiBtn', 'roiReset', 'rotL', 'rotR', 'detectBtn', 'clearCand', 'secRes', 'resAll']) $(id).disabled = !s;
  if (!s) return;
  $('secName').value = s.name; $('secTop').value = s.top; $('secBottom').value = s.bottom; $('secUnits').value = s.units;
  const ppu = pxPerCm(s);
  $('roiInfo').textContent = `x ${s.roi.x0}–${s.roi.x1} · y ${s.roi.y0}–${s.roi.y1} px · ${fmt(ppu * UNIT_TO_CM[s.units], 2)} px/${s.units}`;
  renderFilterForm(); renderDetectForm(); renderBinNote(); renderResForm(s);
}

/* ── V0.1: working resolution of a section, recomputed from the full-resolution original ── */
const RES_FACTORS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32];
function renderResForm(s) {
  const sel = $('secRes'); sel.disabled = $('resAll').disabled = !s; if (!s) return;
  const span = s.crop ? { w: s.crop.x1 - s.crop.x0, h: s.crop.y1 - s.crop.y0 } : s.full;
  const ppcFull = pxPerCm(s) * s.ds;   // px/cm of the original file
  if (!span) { sel.innerHTML = `<option>${t('sec.resUnknown', { k: s.ds })}</option>`; $('resNote').textContent = ''; return; }
  const ks = RES_FACTORS.filter((k) => k === s.ds || Math.min(span.w, span.h) / k >= 20);
  sel.innerHTML = ks.map((k) => {
    const W = Math.floor(span.w / k), H = Math.floor(span.h / k);
    return `<option value="${k}" ${k === s.ds ? 'selected' : ''}>${k === 1 ? t('sec.resFull') : '1/' + k} · ${fmt(ppcFull / k, 3)} px/cm · ${fmt((W * H) / 1e6, 2)} MP</option>`;
  }).join('');
  $('resNote').textContent = t('sec.resNote', { mb: Math.round((13 * s.w * s.h) / 2 ** 20) });
}
/** Recompute the working image of s at factor k2 from the original; masks, marks and analysis area follow (nearest pixel). */
async function changeResolution(s, k2) {
  if (!s || k2 === s.ds) return;
  await withPixels(s, async () => {
    const k1 = s.ds, turns = ((s.rot % 4) + 4) % 4, r = await decodeWorking(s, k2), q = k1 / k2;
    const U2 = turns % 2 ? { w: r.h, h: r.w } : { w: r.w, h: r.h };
    const remap = (arr, Type) => {
      let a = arr, w = s.w, h = s.h;
      for (let i = 0; i < turns; i++) { a = rotate90(a, w, h, 1, -1); [w, h] = [h, w]; }
      const out = new Type(U2.w * U2.h), xs = Int32Array.from({ length: U2.w }, (_, x) => Math.min(w - 1, Math.floor((x + 0.5) / q)));
      for (let y = 0; y < U2.h; y++) { const sy = Math.min(h - 1, Math.floor((y + 0.5) / q)) * w, o = y * U2.w; for (let x = 0; x < U2.w; x++) out[o + x] = a[sy + xs[x]]; }
      let b = out; w = U2.w; h = U2.h;
      for (let i = 0; i < turns; i++) { b = rotate90(b, w, h, 1, 1); [w, h] = [h, w]; }
      return b;
    };
    const pt = (x, y) => {   // continuous coordinates, old working frame → new working frame
      let w = s.w, h = s.h;
      for (let i = 0; i < turns; i++) { [x, y] = [y, w - x]; [w, h] = [h, w]; }
      x *= q; y *= q; w = U2.w; h = U2.h;
      for (let i = 0; i < turns; i++) { [x, y] = [h - y, x]; [w, h] = [h, w]; }
      return [x, y];
    };
    const clampR = (v, m) => Math.max(0, Math.min(m, Math.round(v)));
    const labels = remap(s.labels, Int32Array), exclude = remap(s.exclude, Uint8Array);
    const [ax, ay] = pt(s.roi.x0, s.roi.y0), [bx, by] = pt(s.roi.x1, s.roi.y1);
    const full = s.roi.x0 === 0 && s.roi.y0 === 0 && s.roi.x1 === s.w && s.roi.y1 === s.h;
    const roi = full ? { x0: 0, y0: 0, x1: r.w, y1: r.h } : { x0: clampR(Math.min(ax, bx), r.w), y0: clampR(Math.min(ay, by), r.h), x1: clampR(Math.max(ax, bx), r.w), y1: clampR(Math.max(ay, by), r.h) };
    s.marks = (s.marks || []).map((m) => { const [x, y] = pt(m.x + 0.5, m.y + 0.5); return { ...m, x: Math.min(r.w - 1, Math.floor(x)), y: Math.min(r.h - 1, Math.floor(y)) }; });
    s.w = r.w; s.h = r.h; s.orig = r.rgba; s.labels = labels; s.exclude = exclude; s.roi = roi; s.ds = k2;
    s.view = null; s._lc = null; s._lb = null; s._fc = null; s.logVer++;
    enhance(s); refreshObjects(s, new Set(s.objects.keys()), null);
    S.undo = S.undo.filter((op) => op.s !== s); $('undoBtn').disabled = !S.undo.length;
  });
  pxTouch(s);
  if (s === sec()) selectSection(S.cur, true);
  afterChange(s); renderSectionForm();
}
$('secRes').addEventListener('change', (e) => { const s = sec(), k = +e.target.value; if (s && k) busy(() => changeResolution(s, k)); });
$('resAll').addEventListener('click', () => {
  const s = sec(); if (!s) return; const target = pxPerCm(s);
  busy(async () => {
    for (const o of S.sections) if (o !== s) await changeResolution(o, Math.max(1, Math.round((pxPerCm(o) * o.ds) / target)));
    toast(t('sec.resAllDone', { p: fmt(target, 3) }));
  });
});

function selectSection(k, fresh = false) {
  if (cropState) endCrop();
  const prev = sec(); if (prev) prev.view = { ...S.view };
  S.cur = k; S.selected = 0;
  const s = sec();
  if (s && !s.orig) ensurePixels(s).then(() => { if (sec() === s) { renderSectionForm(); requestRender(); } }).catch(() => requestRender());   // V0.1
  else if (s) pxTouch(s);
  renderSectionForm();
  if (s) { rebuildLUT(s); if (s.view && !fresh) { S.view = { ...s.view }; requestRender(); } else requestAnimationFrame(fitView); }
  analyze(s); renderResults(); renderClasses(); renderObject(); renderLearn(); requestRender();
}

const FILTER_SLIDERS = [['blackPoint', 0, 254, 1], ['whitePoint', 1, 255, 1], ['gamma', 0.2, 3, 0.01], ['brightness', -100, 100, 1], ['contrast', -100, 100, 1], ['saturation', 0, 300, 1], ['vibrance', -100, 100, 1], ['claheBlock', 0, 400, 1], ['claheSlope', 1, 10, 0.1], ['localAmount', 0, 100, 1], ['localRadius', 2, 150, 1]];
const BUILTIN_PRESETS = ['none', 'dorador2014', 'clahe2019', 'levels', 'local', 'strong'];
const DETECT_SLIDERS = [['offset', 1, 80, 1, 'adaptive'], ['radius', 3, 200, 1, 'adaptive'], ['threshold', 0, 255, 1, 'global'], ['pThr', 0.05, 0.95, 0.05, 'unet'], ['minArea', 1, 2000, 1], ['smooth', 0, 4, 1]];
let userPresets = [];
const slider = (prefix, [k, min, max, step]) => `<div class="slider" data-only="${''}"><span data-i18n="${prefix}.${k}" id="${prefix}l-${k}">${t(prefix + '.' + k)}</span><output id="${prefix}o-${k}" for="${prefix}-${k}"></output><input type="range" id="${prefix}-${k}" data-k="${k}" min="${min}" max="${max}" step="${step}" aria-labelledby="${prefix}l-${k}"></div>`;   // V0.39: accessible name

function buildForms() {
  $('filterCtl').innerHTML = FILTER_SLIDERS.map((d) => slider('f', d)).join('');
  $('detectCtl').innerHTML = DETECT_SLIDERS.map((d) => slider('d', d).replace('data-only=""', `data-only="${d[4] || ''}"`)).join('');
  renderPresetOptions();
  $('fChannel').innerHTML = ['rgb', 'gray', 'r', 'g', 'b'].map((c) => `<option value="${c}">${t('ch.' + c)}</option>`).join('');
}

function renderFilterForm() {
  const s = sec(); if (!s) return; const f = s.filters;
  const ef = effectiveFilters(s);
  for (const [k] of FILTER_SLIDERS) { $('f-' + k).value = ef[k] ?? DEFAULT_FILTERS[k]; $('fo-' + k).textContent = ef[k] ?? DEFAULT_FILTERS[k]; }
  for (const k of ['blackPoint', 'whitePoint']) $('f-' + k).disabled = !!f.autoLevels;
  $('f-gamma').disabled = !!f.autoGamma;
  $('fAuto').checked = !!f.autoLevels; $('fAutoG').checked = !!f.autoGamma;
  renderPresetOptions(); $('fPreset').value = s.preset || 'custom';
  $('presetDel').disabled = !String(s.preset || '').startsWith('u:');
  $('presetNote').textContent = BUILTIN_PRESETS.includes(s.preset) ? t('f.src.' + s.preset) : ''; $('fChannel').value = f.channel; $('fEqualize').checked = f.equalize; $('fInvert').checked = f.invert;
}
function renderDetectForm() {
  const s = sec(); if (!s) return; const p = s.detect;
  for (const [k] of DETECT_SLIDERS) { const v = p[k] ?? DEFAULT_DETECT[k]; $('d-' + k).value = v; $('do-' + k).textContent = v; }
  $('dMethod').value = p.method; $('dPol').value = p.polarity; $('dFill').checked = !!p.fillHoles;
  const u = p.method === 'unet'; $('unetBox').hidden = !u; $('dPolBox').hidden = u;   // V0.15
  $('unetName').textContent = UNET ? t('u.model', { n: UNET.name, c: (UNET.cfg.classes || []).join(', '), p: UNET.cfg.pxPerCm ? fmt(UNET.cfg.pxPerCm, 3) : '—' }) : t('u.noModel');
  document.querySelectorAll('#detectCtl [data-only]').forEach((el) => (el.hidden = !!el.dataset.only && el.dataset.only !== p.method));
}
function renderBinNote() {
  const s = sec(), cm = S.settings.binCm || 1; $('binCm').value = +cm.toPrecision(6);
  $('binNote').textContent = s ? t('a.binNote', { n: fmt(cm * pxPerCm(s), 3), p: fmt(pxPerCm(s), 3), m: Math.ceil((s.roi.y1 - s.roi.y0) / binRowsOf(s)) }) + (cm * pxPerCm(s) < 1 ? ' ' + t('a.binMin') : '') : '';
}

let filterTimer = 0;
function refilter() {
  const s = sec(); if (!s) return;
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => enhanceAsync(s).then((last) => { if (!last) return; s.logVer++; markDirty(); scheduleLog(); requestRender(); }).catch((e) => toast(t('err.generic', { e: e.message || e }))), 90);   // V0.41: in the worker
}
$('filterCtl').addEventListener('input', (e) => {
  const s = sec(), k = e.target.dataset.k; if (!s || !k) return;
  s.filters[k] = +e.target.value; $('fo-' + k).textContent = e.target.value; s.preset = 'custom'; $('fPreset').value = 'custom'; refilter();
});
$('fPreset').addEventListener('change', (e) => {
  const s = sec(), v = e.target.value; if (!s || v === 'custom') return;
  s.preset = v;
  if (v.startsWith('u:')) {
    const u = userPresets.find((x) => 'u:' + x.id === v); if (!u) return;
    s.filters = { ...DEFAULT_FILTERS, ...u.filters }; if (u.detect) s.detect = { ...DEFAULT_DETECT, ...u.detect };
  } else s.filters = { ...FILTER_PRESETS[v] };
  renderFilterForm(); renderDetectForm(); refilter();
});
/**
 * Choose the setting (built-in or user) that best separates two grey-level groups in the analysis area
 * (Otsu separability η on a reduced copy of the image). Own procedure; see docs/TECHNICAL_DOCUMENTATION.md §7.3.
 */
/**
 * V0.28: ranks enhancement settings (presets and their single-channel variants). With traces identified by hand in
 * this section it measures how well each one separates those traces from the matrix as the detection sees them
 * (`traceSeparation`); without them, the local grey-level separability (`localSeparability`).
 */
function rankPresets(s) {
  const k = Math.max(1, Math.round(Math.sqrt((s.w * s.h) / 4e5)));
  const sm = downsampleRGBA(s.orig, s.w, s.h, k);
  const roi = { x0: Math.floor(s.roi.x0 / k), y0: Math.floor(s.roi.y0 / k), x1: Math.max(1, Math.floor(s.roi.x1 / k)), y1: Math.max(1, Math.floor(s.roi.y1 / k)) };
  const base = [...BUILTIN_PRESETS.map((v) => ({ id: v, name: t('f.p.' + v), filters: { ...FILTER_PRESETS[v] } })),
    ...userPresets.map((u) => ({ id: 'u:' + u.id, name: u.name, filters: { ...DEFAULT_FILTERS, ...u.filters }, detect: u.detect }))];
  const cands = [];
  for (const c of base) {
    cands.push(c);
    if (!c.id.startsWith('u:') && c.id !== 'none' && ['rgb', 'gray'].includes(c.filters.channel || 'rgb'))
      for (const ch of ['r', 'g', 'b']) cands.push({ ...c, id: 'custom', name: `${c.name} · ${t('ch.' + ch)}`, filters: { ...c.filters, channel: ch } });
  }
  // pixels of the downsampled image: 1 = trace identified by hand (a class that counts), 2 = matrix (no trace, or artefact), 0 = unused
  const cls = new Uint8Array(sm.w * sm.h), countable = new Set(S.classes.filter((c) => c.counts).map((c) => c.id));
  const own = new Set([...s.objects.values()].filter((o) => o.cls && countable.has(o.cls)).map((o) => o.id));
  // V0.37: each downsampled pixel takes the majority of its k×k block (mixed or mostly excluded blocks are not used)
  let nT = 0;
  if (own.size) for (let y = roi.y0; y < roi.y1; y++) for (let x = roi.x0; x < roi.x1; x++) {
    let nt = 0, nm = 0, nb = 0;
    for (let yy = y * k; yy < Math.min(s.h, (y + 1) * k); yy++) for (let xx = x * k; xx < Math.min(s.w, (x + 1) * k); xx++) {
      const i = yy * s.w + xx; nb++; if (s.exclude[i]) continue;
      const v = s.labels[i], id = v ? topAt(v, s.stacks) : 0, o = id && s.objects.get(id);
      if (!id || (o && o.cls && !countable.has(o.cls))) nm++; else if (own.has(id)) nt++;
    }
    if (nt * 2 > nb) { cls[y * sm.w + x] = 1; nT++; } else if (nm * 2 > nb) cls[y * sm.w + x] = 2;
  }
  const supervised = nT >= 50, dp = s.detect || DEFAULT_DETECT;
  const opt = { local: dp.method === 'adaptive', radius: (dp.radius || 40) / k, polarity: dp.polarity || 'dark' };   // V0.37: k-means and U-Net are not local
  const out = cands.map((c) => {
    const tmp = { filters: c.filters, orig: sm.rgba, w: sm.w, h: sm.h, roi };
    const enh = applyFilters(sm.rgba, sm.w, sm.h, effectiveFilters(tmp));
    return { ...c, eta: supervised ? traceSeparation(enh, sm.w, sm.h, roi, cls, opt).score : localSeparability(enh, sm.w, sm.h, roi, Math.max(16, Math.round(96 / k))) };
  }).sort((a, b) => b.eta - a.eta);
  // V0.37: without traces, a preset must beat the image without enhancement clearly, or no enhancement is proposed
  const ref = out.find((c) => c.id === 'none');
  if (!supervised && ref && out[0] !== ref && out[0].eta - ref.eta < Math.max(0.005, 0.05 * ref.eta)) { out.splice(out.indexOf(ref), 1); out.unshift(ref); out.noGain = true; }
  out.mode = supervised ? 'traces' : 'local'; out.nTraces = own.size; out.ref = ref?.eta ?? null;
  return out;
}
$('presetBest').addEventListener('click', () => busy(() => {
  const s = sec(); if (!s?.orig) return;
  const r = rankPresets(s), best = r[0];
  s.preset = best.id; s.filters = { ...best.filters }; if (best.detect) s.detect = { ...DEFAULT_DETECT, ...best.detect };
  renderFilterForm(); renderDetectForm(); refilter();
  $('presetRank').textContent = t(r.mode === 'traces' ? 'f.rankT' : 'f.rankL', { n: r.nTraces, list: r.slice(0, 4).map((c) => `${c.name} ${c.eta.toFixed(3)}`).join('; ') }) + (r.noGain ? ' ' + t('f.rankNoGain') : '');
}));
$('fAuto').addEventListener('change', (e) => { const s = sec(); if (!s) return; s.filters.autoLevels = e.target.checked; s.preset = 'custom'; renderFilterForm(); refilter(); });
$('fAutoG').addEventListener('change', (e) => { const s = sec(); if (!s) return; s.filters.autoGamma = e.target.checked; s.preset = 'custom'; renderFilterForm(); refilter(); });
$('dFill').addEventListener('change', (e) => { const s = sec(); if (s) s.detect.fillHoles = e.target.checked; });

/* user presets: enhancement + detection settings saved by the user, shared by all projects */
function renderPresetOptions() {
  const cur = $('fPreset').value;
  $('fPreset').innerHTML = `<optgroup label="${t('f.builtin')}">${BUILTIN_PRESETS.map((p) => `<option value="${p}">${t('f.p.' + p)}</option>`).join('')}</optgroup>`
    + (userPresets.length ? `<optgroup label="${t('f.mine')}">${userPresets.map((u) => `<option value="u:${u.id}">${esc(u.name)}</option>`).join('')}</optgroup>` : '')
    + `<option value="custom">${t('f.p.custom')}</option>`;
  if (cur) $('fPreset').value = cur;
}
async function storePresets() {
  try { localStorage.setItem('ichantool.presets', JSON.stringify(userPresets)); } catch { /* storage blocked */ }
  if (storageOK) await setPref('presets', userPresets).catch(() => {});
  scheduleBackup();
}
async function loadPresets() {
  let list = null;
  if (storageOK) list = await getPref('presets').catch(() => null);
  if (!list) { try { list = JSON.parse(localStorage.getItem('ichantool.presets') || 'null'); } catch { /* storage blocked */ } }
  userPresets = Array.isArray(list) ? list : [];
  renderPresetOptions();
}
function mergePresets(list) {
  let added = 0;
  for (const u of list || []) if (u?.id && !userPresets.some((x) => x.id === u.id)) { userPresets.push(u); added++; }
  if (added) { storePresets(); renderPresetOptions(); }
  return added;
}
$('presetSave').addEventListener('click', () => {
  const s = sec(); if (!s) return;
  const name = $('presetName').value.trim() || `${t('f.mine')} ${userPresets.length + 1}`;
  const u = { id: uid(), name, created: new Date().toISOString(), filters: { ...s.filters }, detect: { ...s.detect } };
  userPresets.push(u); $('presetName').value = ''; s.preset = 'u:' + u.id;
  storePresets(); renderFilterForm(); markDirty(); toast(t('f.saved', { n: name }));
});
$('presetDel').addEventListener('click', (e) => {
  const s = sec(); const v = s?.preset || ''; if (!v.startsWith('u:')) return;
  if (!armed(e.currentTarget)) return;
  userPresets = userPresets.filter((u) => 'u:' + u.id !== v); s.preset = 'custom';
  storePresets(); renderFilterForm();
});
$('presetAll').addEventListener('click', () => {
  const s = sec(); if (!s) return;
  busy(() => {
    for (const o of S.sections) if (o !== s) { o.filters = { ...s.filters }; o.preset = s.preset; o.detect = { ...s.detect }; enhance(o); o.logVer++; }
    markDirty(); scheduleLog(); toast(t('f.appliedAll', { n: S.sections.length }));
  });
});

$('fChannel').addEventListener('change', (e) => { const s = sec(); if (!s) return; s.filters.channel = e.target.value; s.preset = 'custom'; $('fPreset').value = 'custom'; refilter(); });
for (const [id, key] of [['fEqualize', 'equalize'], ['fInvert', 'invert']]) $(id).addEventListener('change', (e) => { const s = sec(); if (!s) return; s.filters[key] = e.target.checked; s.preset = 'custom'; $('fPreset').value = 'custom'; refilter(); });

$('detectCtl').addEventListener('input', (e) => { const s = sec(), k = e.target.dataset.k; if (!s || !k) return; s.detect[k] = +e.target.value; $('do-' + k).textContent = e.target.value; });
$('unetFile').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) loadUnet(f); });   // V0.15
$('showDoubt').addEventListener('change', (e) => { S.showDoubt = e.target.checked; requestRender(); });
$('trainOpen').addEventListener('click', openTrain);   // V0.17
$('trainClose').addEventListener('click', () => $('trainDlg').close());
$('trainBody').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.trrole) { (S.settings.trainRoles ||= {})[el.dataset.trrole] = el.value; markDirty(); }
  else if (el.dataset.tropt) { const k = el.dataset.tropt; S.settings.trainOpt[k] = k === 'pretrained' ? el.checked : k === 'epochs' ? Math.max(1, +el.value || 60) : el.value.trim() || 'modelo'; markDirty(); }
});
$('trainBody').addEventListener('click', async (e) => {
  const el = e.target;
  if (el.id === 'trInstall') { TR.log = []; TR.running = true; renderTrain(); try { await DESK.install(); } catch (err) { TR.log.push('✕ ' + (err?.message || err)); } TR.running = false; TR.status = await DESK.status(); renderTrain(); }
  else if (el.id === 'trGo') startTrain(false);
  else if (el.id === 'trResume') { if (await DESK.unfinished(S.settings.trainOpt.name)) startTrain(true); else toast(t('tr.noResume')); }
  else if (el.id === 'trCancel') DESK.cancel();
  else if (el.id === 'trFolder') DESK.openFolder();
  else if (el.dataset.truse) { const m = await DESK.readModel(el.dataset.truse); await loadUnetBytes(new Uint8Array(m.onnx), m.json, m.name + '.onnx'); }
});
$('dMethod').addEventListener('change', (e) => { const s = sec(); if (s) { s.detect.method = e.target.value; renderDetectForm(); } });
$('dPol').addEventListener('change', (e) => { const s = sec(); if (s) s.detect.polarity = e.target.value; });
$('detectBtn').addEventListener('click', runDetection);
$('clearCand').addEventListener('click', clearCandidates);

$('maxMP').addEventListener('change', (e) => { S.settings.maxMP = +e.target.value; });
for (const [id, key, max] of [['minValid', 'minValid', 100], ['noDataPad', 'noDataPad', 1e6]]) $(id).addEventListener('change', (e) => {   // V0.3
  const v = Math.max(0, Math.min(max, +e.target.value || 0)); S.settings[key] = v; e.target.value = v;
  for (const s of S.sections) s.logVer++; markDirty(); scheduleAnalysis(); scheduleLog(); if (mode === 'fig') scheduleFigure();
});
$('binCm').addEventListener('change', (e) => { const v = +e.target.value; if (!(v > 0)) { renderBinNote(); return; } S.settings.binCm = v; markDirty(); renderBinNote(); scheduleAnalysis(); scheduleLog(); });
$('inclPred').addEventListener('change', (e) => { S.settings.includePred = e.target.checked; scheduleAnalysis(); renderClasses(); });
$('countCand').addEventListener('change', (e) => { S.settings.countCandidates = e.target.checked; scheduleAnalysis(); renderClasses(); });
$('predThr').addEventListener('input', (e) => { S.settings.predThr = +e.target.value; $('thrOut').textContent = Math.round(S.settings.predThr * 100) + '%'; for (const s of S.sections) rebuildLUT(s); renderLearn(); renderClasses(); scheduleAnalysis(); requestRender(); });
$('novelty').addEventListener('input', (e) => { S.settings.novelty = +e.target.value; $('novOut').textContent = '×' + S.settings.novelty; scheduleLearn(); });
$('acceptPred').addEventListener('click', () => {
  const s = sec(); if (!s) return; const op = beginOp(s);
  for (const o of s.objects.values()) if (status(o) === 'predicted') { o.cls = o.pred; o.pred = null; o.conf = 0; }
  commitOp(op, true); afterChange(s);
});

$('secSel').addEventListener('change', (e) => selectSection(+e.target.value));
$('secName').addEventListener('input', (e) => { const s = sec(); if (!s) return; s.name = e.target.value; $('secSel').options[S.cur].textContent = s.name; });
for (const id of ['secTop', 'secBottom', 'secUnits']) $(id).addEventListener('change', () => {
  const s = sec(); if (!s) return;
  const top = parseFloat($('secTop').value), bottom = parseFloat($('secBottom').value);
  if (Number.isFinite(top) && Number.isFinite(bottom) && bottom > top) { s.top = top; s.bottom = bottom; }
  s.units = $('secUnits').value;
  recomputeFeatures(s); renderSectionForm(); scheduleLearn(); scheduleAnalysis(); requestRender();
});
$('secDel').addEventListener('click', (e) => {
  if (!sec()) return;
  if (!armed(e.currentTarget, t('confirm.secDel', { n: [...sec().objects.values()].filter((o) => o.cls).length }))) return;
  S.sections.splice(S.cur, 1); S.undo = S.undo.filter((op) => S.sections.includes(op.s)); $('undoBtn').disabled = !S.undo.length;
  selectSection(Math.min(S.cur, S.sections.length - 1)); scheduleLearn();
});
$('roiBtn').addEventListener('click', () => setTool('roi'));
$('roiReset').addEventListener('click', () => { const s = sec(); if (s) setRoi(s, { x0: 0, y0: 0, x1: s.w, y1: s.h }); });
for (const [id, dir] of [['rotL', -1], ['rotR', 1]]) $(id).addEventListener('click', () => {
  const s = sec(); if (!s?.orig) return;
  busy(() => {
    s.orig = rotate90(s.orig, s.w, s.h, 4, dir); s.labels = rotate90(s.labels, s.w, s.h, 1, dir); s.exclude = rotate90(s.exclude, s.w, s.h, 1, dir);
    s.marks = (s.marks || []).map((m) => (dir > 0 ? { ...m, x: s.h - 1 - m.y, y: m.x } : { ...m, x: m.y, y: s.w - 1 - m.x }));
    [s.w, s.h] = [s.h, s.w]; s.rot += dir; s.roi = { x0: 0, y0: 0, x1: s.w, y1: s.h };
    enhance(s);
    refreshObjects(s, new Set(s.objects.keys()), null);
    S.undo = S.undo.filter((op) => op.s !== s); $('undoBtn').disabled = !S.undo.length;
    selectSection(S.cur, true); afterChange(s);
  });
});

function setAge() {
  S.age.text = $('ageText').value; S.age.units = $('ageUnits').value;
  const parsed = parseAgeModelDetailed(S.age.text); S.age.model = parsed.model;
  const m = S.age.model;
  $('ageStatus').textContent = m ? t('age.ok', { n: m.depth.length, a: fmt(Math.min(...m.age), 3), b: fmt(Math.max(...m.age), 3), u: S.age.units }) + (m.reversals ? ' ' + t('age.reversal', { n: m.reversals }) : '') + (m.bacon ? ' ' + t('age.baconPasted') : '') + (m.rangeIgnored ? ' ' + t('age.rangeIgnored', { n: m.rangeIgnored }) : '')
    : parsed.issue?.kind === 'dupDepth' ? t('age.dupDepth', { d: fmt(parsed.issue.depth, 4) }) : t('age.none');
  $('ageStatus').classList.toggle('warn', !!(m?.reversals || m?.bacon || m?.rangeIgnored || parsed.issue));
  const c = curCore(); if (c) c.ageText = S.age.text;
  scheduleAnalysis(); markDirty(); scheduleLog(); if (geoRT) geoRT.dirty = true;
  $('logAxis').querySelector('[value=age]').disabled = !m;
}
$('ageText').addEventListener('input', setAge);
$('ageUnits').addEventListener('change', setAge);
$('ageFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return; const txt = decodeText(await f.arrayBuffer()); e.target.value = '';
  // V0.28: a Bacon table (*_ages.txt) is converted to core units; other files are read as "depth, age[, min, max]"
  const units = S.sections[0]?.units || curCore()?.units || 'cm', div = { a: 1, ka: 1000, Ma: 1e6 }[$('ageUnits').value] || 1000;
  const bac = baconToAgeText(txt, { center: S.age.center || 'median', depthUnit: units, ageDiv: div });
  if (bac) { S.age.bacon = txt; $('ageText').value = `# ${t('age.baconHead', { f: f.name, c: t('age.c.' + (S.age.center || 'median')), u: units, a: $('ageUnits').value })}\n# ${t('age.cols')}\n` + bac.join('\n'); toast(t('age.baconOk', { n: bac.length })); }
  else { S.age.bacon = null; $('ageText').value = txt; }
  setAge(); renderAgeCenter();
});
/** V0.28: median or mean of a Bacon model (re-converted from the stored table). */
function renderAgeCenter() { $('ageCenterRow').hidden = !S.age.bacon; $('ageCenter').value = S.age.center || 'median'; }
$('ageCenter').addEventListener('change', (e) => {
  S.age.center = e.target.value; if (!S.age.bacon) return;
  const units = S.sections[0]?.units || curCore()?.units || 'cm', div = { a: 1, ka: 1000, Ma: 1e6 }[$('ageUnits').value] || 1000;
  const bac = baconToAgeText(S.age.bacon, { center: S.age.center, depthUnit: units, ageDiv: div }); if (!bac) return;
  $('ageText').value = `# ${t('age.baconHead', { f: 'Bacon', c: t('age.c.' + S.age.center), u: units, a: $('ageUnits').value })}\n# ${t('age.cols')}\n` + bac.join('\n'); setAge();
});

/* toolbar */
document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('brushSize').addEventListener('input', (e) => setBrush(+e.target.value));
$('wandTol').addEventListener('input', (e) => { S.wandTol = +e.target.value; $('tolOut').textContent = S.wandTol; });
$('showOrig').addEventListener('change', (e) => { S.showOrig = e.target.checked; requestRender(); });
$('ovAlpha').addEventListener('input', (e) => { S.ovAlpha = +e.target.value / 100; for (const s of S.sections) rebuildLUT(s); requestRender(); });
$('zoomIn').addEventListener('click', () => zoomAt(view.width / 2, view.height / 2, 1.25));
$('zoomOut').addEventListener('click', () => zoomAt(view.width / 2, view.height / 2, 0.8));
$('zoomFit').addEventListener('click', fitView);
$('undoBtn').addEventListener('click', undo);
$('nextReview').addEventListener('click', () => nextReview());
try { $('autoNext').checked = localStorage.getItem('ichantool.autoNext') === '1'; } catch { $('autoNext').checked = false; }
$('autoNext').addEventListener('change', (e) => { try { localStorage.setItem('ichantool.autoNext', e.target.checked ? '1' : '0'); } catch { /* storage blocked */ } });
$('sideTabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

for (const id of ['addImg', 'addImg2']) $(id).addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
$('loadExample').addEventListener('click', loadExample);
const vp = $('viewport');
vp.addEventListener('dragover', (e) => { e.preventDefault(); vp.classList.add('drop'); });
vp.addEventListener('dragleave', () => vp.classList.remove('drop'));
vp.addEventListener('drop', (e) => { e.preventDefault(); vp.classList.remove('drop'); const f = [...e.dataTransfer.files]; if (f.length) addFiles(f); });

/* ───────────── files out ───────────── */

export async function saveFile(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const dl = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename: name, data: blob }); toast(t('saved')); }
    catch (e) { if (e?.code !== 'declined') toast(e?.message || String(e)); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
export const safe = (s) => String(s).replace(/[^\w.-]+/g, '_').slice(0, 80) || 'section';

$('expCSV').addEventListener('click', () => {
  const counted = S.classes.map((c, k) => [c.name, k]).filter(([, k]) => S.classes[k].counts);
  for (const s of S.sections) analyze(s);
  const rows = bioturbationTable(S.sections, { counted, range: !!S.age.model?.min, ageUnits: S.age.model ? S.age.units : null });   // V0.44: exportio.js
  analyze(sec());
  saveFile(`${safe(S.name)}_bioturbation.csv`, withProv(toCSV(rows)), 'text/csv');
});

$('expObjects').addEventListener('click', () => {
  const items = [];
  for (const s of S.sections) {
    const eff = effClassArray(s);
    for (const o of s.objects.values()) items.push({ section: s.name, units: s.units, o, cls: clsById(o.cls)?.name, status: status(o), pred: clsById(o.pred)?.name, counted: eff[o.id] >= 0, depth: (row) => depthAtRow(s, row) });
  }
  saveFile(`${safe(S.name)}_objects.csv`, withProv(toCSV(objectsTable(items))), 'text/csv');   // V0.44: exportio.js
});

$('expMask').addEventListener('click', () => {
  const s = sec(); if (!s) return;
  busy(async () => {
    const eff = effClassArray(s), cols = S.classes.map((c) => hex(c.color));
    const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
    const x = c.getContext('2d'), im = x.createImageData(s.w, s.h), d = im.data;
    for (let i = 0, j = 0; i < s.labels.length; i++, j += 4) {
      const k = s.labels[i] ? eff[topLab(s, i)] : -1;
      if (k >= 0 && !s.exclude[i]) { d[j] = cols[k][0]; d[j + 1] = cols[k][1]; d[j + 2] = cols[k][2]; }
      d[j + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await saveFile(`${safe(s.name)}_mask.png`, blob, 'image/png');
  });
});

/** V0.15: training set for the U-Net — for every image with reviewed traces, the original ROI (PNG), its label mask
 * (PNG, value = class index + 1, 0 = matrix or artefact, 255 = excluded or not reviewed) and manifest.json. */
$('expTrain').addEventListener('click', () => busy(async () => {
  const zip = await buildTrainingZip(); if (zip) await saveFile(`${safe(S.name)}_segmentation_dataset.zip`, zip, 'application/zip');
}));
/** The ZIP described above (Blob), or null with a message when no trace has been reviewed. */
async function buildTrainingZip() {
  const classes = S.classes.filter((c) => c.counts), idx = new Map(classes.map((c, k) => [c.id, k + 1]));
  const files = [], items = [];
  const png = async (rgba, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0); return new Promise((r) => c.toBlob(r, 'image/png')); };
  for (const core of S.cores) for (const s of core.sections) {
    const objs = [...s.objects.values()], reviewed = objs.filter((o) => o.cls);
    if (!reviewed.length) continue;
    await withPixels(s, async () => {
      const lab = new Int16Array(s.nextId).fill(-1);
      for (const o of objs) if (o.cls) lab[o.id] = idx.get(o.cls) ?? 0;   // classes that do not count (artefacts) = matrix
      const roi = s.roi, w = roi.x1 - roi.x0, h = roi.y1 - roi.y0, m = trainingMask(s.labels, s.w, roi, s.exclude, lab, s.stacks);
      const g = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < m.length; i++) { g[i * 4] = g[i * 4 + 1] = g[i * 4 + 2] = m[i]; g[i * 4 + 3] = 255; }
      const base = `${safe(core.name)}__${safe(s.name)}`;
      files.push({ name: `images/${base}.png`, data: await png(cropRGBA(s.orig, s.w, roi), w, h) }, { name: `masks/${base}.png`, data: await png(g, w, h) });
      items.push({ image: `images/${base}.png`, mask: `masks/${base}.png`, core: core.name, section: s.name, top: s.top, bottom: s.bottom, units: s.units,
        pxPerCm: +pxPerCm(s).toFixed(5), width: w, height: h, downsample: s.ds || 1, objects: objs.length, reviewed: reviewed.length, unreviewed: objs.length - reviewed.length });
    });
  }
  if (!items.length) { toast(t('u.noReviewed')); return null; }
  const manifest = { app: APP, kind: 'segmentation-dataset', version: 1, delivery: DELIVERY, created: new Date().toISOString(), ignore: IGNORE,
    classes: classes.map((c, k) => ({ index: k + 1, name: c.name, color: c.color })), items };
  files.push({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
  return zipFiles(files);
}

$('expPalette').addEventListener('click', () => {
  const pal = Object.fromEntries(S.classes.filter((c) => c.counts).map((c) => [c.name, c.color]));
  saveFile(`${safe(S.name)}_palette.json`, JSON.stringify(pal, null, 2), 'application/json');
});

function modelExamples() {
  const ex = [];
  for (const e of ownExamples(S.cores.filter((c) => c.id === S.curCore), true, true)) ex.push({ key: e.key, name: e.y, x: e.x.map((v) => +v.toFixed(5)) });
  return ex.concat(S.library.filter((e) => Array.isArray(xOfLib(e))).map((e) => ({ ...e, x: xOfLib(e), xv: undefined })));
}
$('exportModel').addEventListener('click', () => {
  const used = new Set(modelExamples().map((e) => e.name));
  const model = { app: APP, kind: 'model', version: 1, features: featNames(), classes: S.classes.filter((c) => used.has(c.name)).map(({ name, color, counts }) => ({ name, color, counts })), examples: modelExamples() };
  saveFile('sedcoretool_model.json', JSON.stringify(model), 'application/json');
});
$('importModel').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const m = JSON.parse(await f.text());
    const vis = JSON.stringify(m.features) === JSON.stringify(visionFeatureId());   // V0.17: models of vision vectors
    if (m.kind !== 'model' || (!vis && JSON.stringify(m.features) !== JSON.stringify(FEATURES))) throw new Error();
    for (const c of m.classes) if (!S.classes.some((k) => k.name === c.name)) S.classes.splice(S.classes.length - 1, 0, { id: 'c' + uid(), name: c.name, color: c.color, counts: c.counts !== false });
    const D = vis ? VISION_MODEL.dim : FEATURES.length;
    S.library = S.library.concat(m.examples.filter((x) => Array.isArray(x.x) && x.x.length === D).map((x) => (vis ? { name: x.name, key: x.key, xv: x.x } : x)));
    scheduleLearn(); renderClasses();
  } catch { toast(t('err.project')); }
});
$('clearLib').addEventListener('click', (e) => { if (!S.library.length || !armed(e.currentTarget)) return; S.library = []; markDirty(); scheduleLearn(); });

/* ───────────── cores of a project ─────────────
   A project holds several cores. Each core has its image sections (bioturbation), external records,
   imported numeric data (imp), user columns, age model and log view. The active core's arrays are
   exposed as S.sections / S.records / S.age / S.logView so the image tools work unchanged.
   core.depth / core.age / core.proxies are derived (images + records + imported + user + computed). */

const VIEW_ONLY = /(^|[#&])win=/.test(location.hash);
export const curCore = () => S.cores.find((c) => c.id === S.curCore);

function makeCore(q = {}) {
  const lv = defaultLogView();
  const c = {
    id: q.id || 'c' + uid(), name: q.name || t('core.new'), lat: q.lat ?? null, lon: q.lon ?? null, waterDepth: q.waterDepth ?? null, holdout: !!q.holdout,
    units: q.units || 'm', source: q.source || null, notes: q.notes || '',
    imp: q.imp || null, user: q.user || {}, edits: q.edits || {}, records: q.records || [], sections: [],
    logView: { ...lv, ...(q.logView || {}), tracks: { ...lv.tracks, ...(q.logView?.tracks || {}) } },
    ageModel: { text: q.age?.text || q.ageText || '', units: q.age?.units || 'ka', model: null, bacon: q.age?.bacon || null, center: q.age?.center || 'median' },
    depth: null, age: null, proxies: {}, src: {}, ageText: '',
  };
  c.ageModel.model = parseAgeModel(c.ageModel.text);
  return c;
}

/** Make a core the working core of the image tools and the composite log. */
function activateCore(id, silent = false) {
  const c = S.cores.find((x) => x.id === id) || S.cores[0]; if (!c) return;
  S.curCore = c.id;
  S.sections = c.sections; S.records = c.records; S.age = c.ageModel; S.logView = c.logView;
  S.undo = []; S.selected = 0; S.multi.clear(); $('undoBtn').disabled = true;
  $('ageText').value = S.age.text; $('ageUnits').value = S.age.units; renderAgeCenter?.();
  const keep = loading; loading = true; setAge(); loading = keep;
  selectSection(S.sections.length ? 0 : -1, true);
  renderRecList(); renderLogPanel(); renderCoreBar(); scheduleLog(0);
  if (S.geo) S.geo.view.core = c.id;
  scheduleLearn(); // the core model depends on the open core
  if (!silent) { markDirty(); scheduleGeo(); renderData(); }
}

/** Series of one core from its images (bioturbation per interval) and external records, in core units. */
function coreImageParts(c) {
  const parts = [], base = c.units || 'm', model = c.ageModel.model;
  if (c.sections.length) {
    const f = (s) => UNIT_TO_CM[s.units] / UNIT_TO_CM[base];
    for (const s of c.sections) analyze(s);
    const rows = compositeRows(c.sections.map((s) => ({ name: s.name, bins: s.bins.map((b) => ({ ...b, dTop: b.dTop * f(s), dBottom: b.dBottom * f(s), depth: b.depth * f(s) })) })), { axis: 'depth', model });
    const vals = { [t('geo.p.bio')]: rows.map((r) => r.pct), BI: rows.map((r) => r.BI), ii: rows.map((r) => r.ii) };
    S.classes.forEach((k, j) => { if (k.counts && rows.some((r) => r.classPct[j] > 0)) vals[`% ${k.name}`] = rows.map((r) => r.classPct[j]); });
    parts.push({ depth: rows.map((r) => r.depth), age: null, vals, src: 'img' });
  }
  const inv = model ? invertModel(model) : null;
  for (const rec of c.records) for (const se of rec.series) {
    const depth = rec.axis === 'age' ? (inv ? se.x.map((a) => interpAge(inv, a)) : null) : se.x;
    if (depth) parts.push({ depth, age: rec.axis === 'age' ? se.x : null, vals: { [se.name]: se.y }, src: 'rec' });
  }
  return parts;
}

/** Recompute the derived arrays of a core (all sources merged on the union of depths). */
function refreshCoreData(c) {
  if (c.frozen) return; // read-only copy (windows built from the light index)
  const parts = coreImageParts(c), model = c.ageModel.model;
  if (c.imp) parts.push({ depth: c.imp.depth, age: c.imp.age, vals: c.imp.proxies || {}, src: 'imp' });
  for (const [name, u] of Object.entries(c.user || {})) parts.push({ depth: u.d, age: null, vals: { [name]: u.v }, src: 'man' });
  c.ageText = c.ageModel.text; c.src = {};
  const withDepth = parts.filter((q) => q.depth);
  let rows = [];
  if (withDepth.length) {
    for (const q of withDepth) q.depth.forEach((d, i) => { if (d != null) rows.push({ d, a: q.age?.[i] ?? null, q, i }); });
    rows.sort((x, y) => x.d - y.d);
    c.depth = rows.map((r) => r.d);
    const ages = rows.map((r) => r.a ?? (model ? interpAge(model, r.d) : null));
    c.age = ages.some((v) => v != null) ? ages : null;
  } else {
    const q = parts.find((x) => x.age); // age-only core (no depth anywhere)
    if (q) q.age.forEach((a, i) => rows.push({ d: null, a, q, i }));
    c.depth = null; c.age = rows.length ? rows.map((r) => r.a) : null;
  }
  c.proxies = {};
  for (const q of parts) for (const name of Object.keys(q.vals)) { c.proxies[name] = rows.map(() => null); c.src[name] = q.src; }
  rows.forEach((r, k) => { for (const [name, arr] of Object.entries(r.q.vals)) c.proxies[name][k] = arr?.[r.i] ?? null; });
  applyCellEdits(c);   // V0.35
  applyComputedColumns(c);
}
function refreshAllCores() { for (const c of S.cores) refreshCoreData(c); }

/**
 * V0.35: cells edited by hand in the Data sheet. c.edits[column][axisValue] = { v: new value (null = deleted), o: original
 * value, at: ISO date }. They are applied over the merged data (so analyses and computed columns use them) and the
 * original is kept to show and restore it. Rows are matched by depth (or age for age-only cores).
 */
function applyCellEdits(c) {
  if (!c.edits) return;
  const ax = c.depth || c.age || [], pos = new Map();
  ax.forEach((x, k) => { const key = String(x); if (!pos.has(key)) pos.set(key, k); });
  for (const [name, e] of Object.entries(c.edits)) {
    const arr = c.proxies[name]; if (!arr) continue;
    for (const [key, ed] of Object.entries(e)) { const k = pos.get(key); if (k == null) continue; ed.o = arr[k]; arr[k] = ed.v; }
  }
}
const cellEdit = (c, name, x) => c.edits?.[name]?.[String(x)] || null;
const editCount = (cores) => cores.reduce((n, c) => n + Object.values(c.edits || {}).reduce((m, e) => m + Object.keys(e).length, 0), 0);

/** Computed columns of the Data tab (formulas over the core's columns), applied after merging. */
function applyComputedColumns(c) {
  const n = (c.depth || c.age || []).length;
  for (const col of S.sheet.columns) {
    if (col.core && col.core !== 'all' && col.core !== c.id) continue;
    try {
      const cols = { ...c.proxies, depth: c.depth || new Array(n).fill(null), age: c.age || new Array(n).fill(null) };
      // V0.35: columns measured at different depths are interpolated to every row (linear, no extrapolation)
      if (col.interp !== false) { const x = c.depth || c.age || []; for (const r of formulaRefs(col.formula)) if (c.proxies[r]) cols[r] = fillLinear(x, c.proxies[r]); }
      const v = evalColumn(col.formula, cols, n);
      c.proxies[col.name] = v; c.src[col.name] = 'calc';
    } catch (e) { col.error = e.message; continue; }
    col.error = null;
  }
}

function projectMeta() {
  return { id: S.id, name: S.name, updated: Date.now(), sections: S.cores.reduce((n, c) => n + c.sections.length, 0), cores: S.cores.length,
    coreNames: S.cores.map((c) => c.name), kind: S.kind || 'normal' };
}
/** Light copy of the numeric data of the project, for the all-projects view and multiproject maps. */
function liteSnapshot() {
  return {
    id: S.id, name: S.name, updated: Date.now(), kind: S.kind || 'normal',
    examples: S.cores.flatMap((c) => c.sections.flatMap((s) => [...s.objects.values()].filter((o) => o.cls && !o.nt && clsById(o.cls) && (o.feat || o.emb)).map((o) => ({   // V0.17: both vector sets
      key: `${S.id}|${c.id}|${s.id}|${o.id}`, name: clsById(o.cls).name, x: o.feat ? vec(o.feat).map((v) => +v.toFixed(4)) : null, ...(o.emb ? { xv: o.emb } : {}), core: c.name, thumb: thumbOf(s, o) })))),
    layers: S.geo.layers, intervals: S.geo.intervals, geo: (({ cores: _c, ...g }) => g)(S.geo),
    cores: S.cores.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lon: c.lon, units: c.units, ageText: c.ageText, depth: c.depth, age: c.age, proxies: c.proxies, src: c.src, nImages: c.sections.length })),
  };
}

let bc = null; try { bc = new BroadcastChannel('ichantool'); } catch { bc = null; }
function broadcast(msg) { try { bc?.postMessage(msg); } catch { /* channel unavailable */ } }

/* core bar in the header */
function renderCoreBar() {
  const sel = $('coreSel'); if (!sel) return;
  sel.innerHTML = S.cores.map((c) => `<option value="${c.id}" ${c.id === S.curCore ? 'selected' : ''}>${esc(c.name)}${c.sections.length ? ` · ${c.sections.length} img` : ''}</option>`).join('');
}
$('coreSel').addEventListener('change', (e) => { activateCore(e.target.value); });
$('coreAdd').addEventListener('click', () => openCoreDlg(null));
$('coreEdit').addEventListener('click', () => openCoreDlg(curCore()));
let coreDlgFor = null;
function openCoreDlg(c) {
  coreDlgFor = c;
  $('cdTitle').textContent = t(c ? 'core.edit' : 'core.add');
  $('cdName').value = c?.name || ''; $('cdLat').value = c?.lat ?? ''; $('cdLon').value = c?.lon ?? ''; $('cdWd').value = c?.waterDepth ?? ''; $('cdUnits').value = c?.units || 'm';
  $('cdNotes').value = c?.notes || ''; $('cdDel').hidden = !c || S.cores.length < 2; $('cdDel').dataset.armed = '';
  $('cdDel').textContent = t('core.del');
  $('coreDlg').showModal();
}
$('cdCancel').addEventListener('click', () => $('coreDlg').close());
$('cdOk').addEventListener('click', () => {
  const num = (v) => (v === '' ? null : +v);
  const vals = { name: $('cdName').value.trim() || t('core.new'), lat: num($('cdLat').value), lon: num($('cdLon').value), waterDepth: num($('cdWd').value), units: $('cdUnits').value, notes: $('cdNotes').value };
  if (coreDlgFor) Object.assign(coreDlgFor, vals);
  else { const c = makeCore(vals); S.cores.push(c); refreshCoreData(c); activateCore(c.id, true); }
  $('coreDlg').close(); renderCoreBar(); refreshAllCores(); geoMarkDirty(); markDirty(); scheduleGeo(); renderData();
});
$('cdDel').addEventListener('click', () => {
  const b = $('cdDel'), c = coreDlgFor; if (!c) return;
  if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = t('proj.delConfirm'); return; }
  S.cores = S.cores.filter((x) => x !== c); S.geo.intervals = S.geo.intervals.filter((q) => q.core !== c.id);
  $('coreDlg').close(); activateCore(S.cores[0].id); geoMarkDirty();
});

/* ───────────── projects: serialisation ───────────── */

/**
 * One section in a project. V0.1 (format v4): the image is a reference to the image store (`file.key`), or, before it
 * is stored, the Blob itself (`file.blob`); `projectForExport` turns both into image files of a package or folder. Object statistics
 * (`st`) are saved so that a section can be used without decoding its picture.
 */
function serSection(s) {
  const o2 = (o) => ({ id: o.id, cls: o.cls, src: o.src, ...(o.nt ? { nt: 1 } : {}), ...(o.stats ? { st: o.stats } : {}), ...(o.cls && o._thumb ? { th: o._thumb } : {}), ...(o.emb ? { em: o.emb } : {}) });
  // V0.41: the file keeps only the overlap stacks still in use (renumbered on a copy; memory and undo keep theirs)
  let lab = s._mk.labels.rle(), stacks;
  if (s.stacks.length > 1) { lab = Array.from(lab); stacks = compactStacks(lab, s.stacks, 2); if (stacks.length < 2) stacks = undefined; }
  return {
    id: s.id, name: s.name, ds: s.ds, rot: s.rot, w: s.w, h: s.h, crop: s.crop || null, full: s.full || null,
    file: s.file.key ? { name: s.file.name, type: s.file.type, key: s.file.key, size: s.file.size } : { name: s.file.name, type: s.file.type, blob: s.file.blob },
    top: s.top, bottom: s.bottom, units: s.units, roi: s.roi, filters: s.filters, preset: s.preset, detect: s.detect, manual: s.manual,
    nextId: s.nextId, objects: [...s.objects.values()].map(o2),
    labels: lab, stacks, exclude: s._mk.exclude.rle(), marks: s.marks || [],
  };
}

/** Project file, format v3: project → cores (images, imported data, records, age model, intervals by core id). */
function serialize() {
  const { cores: _c, ...geo } = S.geo;
  return {
    app: APP, kind: 'project', version: FORMAT_VERSION, appVersion: VERSION, delivery: DELIVERY, saved: new Date().toISOString(),
    id: S.id, name: S.name, notes: S.notes, comments: S.comments || [], classes: S.classes, active: S.active, settings: S.settings, library: S.library,
    projectKind: S.kind || 'normal', multiSource: S.multiSource || null, models: projectModels(), finalTests: S.finalTests || [],
    geo, sheet: S.sheet, fig: S.fig, curCore: S.curCore, plots: S.plots || [], plotCur: S.plotCur || 0,
    cores: S.cores.map((c) => ({
      id: c.id, name: c.name, lat: c.lat, lon: c.lon, waterDepth: c.waterDepth ?? null, units: c.units, source: c.source || null, notes: c.notes || '', holdout: c.holdout || undefined,
      imp: c.imp, user: c.user || {}, edits: c.edits && Object.keys(c.edits).length ? c.edits : undefined, records: c.records, logView: c.logView, age: { text: c.ageModel.text, units: c.ageModel.units, bacon: c.ageModel.bacon || undefined, center: c.ageModel.center || undefined },
      sections: c.sections.map((q) => serSection(q)),
    })),
  };
}

/** V0.1: a section is opened without decoding its picture; files from older versions are decoded once (sizes, object statistics). */
async function loadSection(q) {
  const f = q.file, legacy = !f.key;
  const file = legacy ? { name: f.name, type: f.type, blob: f.blob || new Blob([f.bytes ? new Uint8Array(f.bytes) : b64decode(f.b64)], { type: f.type || 'image/jpeg' }) } : { name: f.name, type: f.type, key: f.key, size: f.size };
  let w = q.w, h = q.h, orig = null;
  const mk = (s) => Object.assign(s, { id: q.id, rot: q.rot || 0, crop: q.crop || null, top: q.top, bottom: q.bottom, units: q.units, roi: q.roi, filters: q.filters, preset: q.preset, detect: q.detect, manual: q.manual || [], nextId: q.nextId, marks: q.marks || [] });
  if (!w || !h) {   // very old files without sizes
    const tmp = mk(newSection({ name: q.name, file, w: 1, h: 1, orig: null, ds: q.ds || 1 }));
    const r = await decodeWorking(tmp, q.ds || 1); ({ w, h } = r); orig = r.rgba;
  }
  if (q.$missing) throw new Error(t('load.badMask', { s: q.name || '?', k: 'section' }));   // V0.44: section record missing in the library
  // V0.36: a damaged mask stops the load instead of being saved over the good copy
  for (const k of ['labels', 'exclude']) if (q[k] != null && !rleValid(q[k], w * h)) throw new Error(t('load.badMask', { s: q.name || '?', k }));
  const s = mk(newSection({ name: q.name, file, w, h, orig, ds: q.ds || 1, full: q.full || null, labels: { rle: q.labels }, exclude: { rle: q.exclude } }));
  if (q.stacks) { s.stacks = compactStacks(q.labels, q.stacks, 2); s._six = null; }   // V0.20: overlaps (RLE values renumbered before first unpack)
  const ppu = pxPerCm(s);
  for (const o of q.objects) {
    const st = o.st || null;
    s.objects.set(o.id, { id: o.id, cls: o.cls, src: o.src, nt: !!o.nt, pred: null, conf: 0, area: st?.n || 0, bbox: st ? [st.x0, st.y0, st.x1, st.y1] : null, stats: st, feat: st ? features(st, ppu) : null, ...(o.th ? { _thumb: o.th } : {}), ...(o.em ? { emb: o.em } : {}) });
  }
  if (q.objects.some((o) => !o.st)) {   // older files: object statistics need the pixels once
    await withPixels(s, (x) => refreshObjects(x, new Set(x.objects.keys()), null));
    s._mk.labels.pack(); s._mk.exclude.pack();
  }
  if (legacy) loadMigrated = true;
  return s;
}
let loadMigrated = false;

/* V0.36: version 5 = trace overlaps (stacks, V0.20), cell edits (V0.35). A newer file opens read-only. */
const FORMAT_VERSION = 5;
let readOnlyProject = false;

async function loadProject(p) {
  blankStart = false;
  resetState(); loading = true; loadMigrated = false; clearTimeout(saveTimer);
  readOnlyProject = (p?.version || 0) > FORMAT_VERSION;   // V0.36: written by a newer SedCoreTool
  try {
    p = upgradeProject(p);
    S.id = p.id || uid(); S.name = p.name || APP; S.notes = p.notes || ''; S.comments = p.comments || [];
    S.classes = p.classes || defaultClasses(); S.active = p.active || 'undet';
    Object.assign(S.settings, p.settings || {}); S.library = p.library || []; S.kind = p.projectKind || 'normal'; S.multiSource = p.multiSource || null; S.plots = p.plots || []; S.plotCur = p.plotCur || 0; S.coreModels = p.models?.cores || {};
    S.sheet = { columns: [], cells: {}, ...(p.sheet || {}) };
    S.fig = { ...defaultFig(), ...(p.fig || {}) }; S.finalTests = p.finalTests || [];
    S.geo = normalizeGeo(p.geo);
    geoReset();
    S.cores = [];
    for (const q of p.cores || []) {
      const c = makeCore(q);
      for (const sq of q.sections || []) c.sections.push(await loadSection(sq));
      S.cores.push(c);
    }
    if (!S.cores.length) S.cores.push(makeCore({ name: t('core.first') }));
    if (S.settings.binPx != null) {   // V0.1: before V0.1 (V33) the interval was given in pixel rows
      const s0 = S.cores.flatMap((c) => c.sections)[0];
      if (p.settings?.binCm == null) S.settings.binCm = s0 ? S.settings.binPx / pxPerCm(s0) : 1;
      delete S.settings.binPx;
    }
  } catch (err) {
    // V0.36: a failed load never leaves a half-built project that the autosave would write over the stored one
    console.error(err); loading = false; clearTimeout(saveTimer);
    resetState(); blankStart = true; dirty = false; readOnlyProject = false; setSaveState('off');
    toast(t('load.failed', { e: err?.message || String(err) }), 9000);
    return false;
  } finally { loading = false; }
  if (readOnlyProject) setTimeout(() => { setSaveState('off'); toast(t('load.newer', { v: p.delivery || p.version }), 10000); }, 300);
  const cur = S.cores.find((c) => c.id === p.curCore) || S.cores[0];
  activateCore(cur.id, true);
  syncSettingsForm(); learnNow(); updateProjHeader(); refreshOtherExamples(); setTimeout(updateTip, 0);
  refreshAllCores();
  if (S.geo.trained) setTimeout(() => { geoTrain(true).catch(() => { /* retrained on demand */ }); }, 0); else scheduleGeo(0);
  try { localStorage.setItem('ichantool.last', S.id); } catch { /* storage blocked */ }
  dirty = false; setSaveState(storageOK ? 'saved' : 'off');
  if (loadMigrated) markDirty();   // V0.1: move images of older projects to the image store
  renderComments();
}

function resetState() {
  blankStart = false; clearTimeout(saveTimer);   // V0.36: a pending save of the previous project must not run afterwards
  const maxMP = S.settings.maxMP || 8;
  S.id = uid(); S.name = t('proj.untitled'); S.notes = ''; S.comments = []; S.finalTests = [];
  MEM.px.length = 0; MEM.mask.length = 0; pxWanted.clear();   // V0.1: pictures of the previous project can be freed
  S.undo = []; S.selected = 0; S.multi.clear(); S.library = []; S.sheet = { columns: [], cells: {} }; S.fig = defaultFig(); S.kind = 'normal'; S.multiSource = null; S.plots = []; S.plotCur = 0; S.coreModels = {};
  S.geo = defaultGeo(); geoReset();
  S.classes = defaultClasses(); S.active = 'undet';
  S.settings = { binCm: 1, minValid: 20, noDataPad: 0, includePred: true, predThr: 0.7, countCandidates: true, novelty: 3, maxMP, clfScope: 'project', ml: { ...ML_DEFAULT } };
  $('undoBtn').disabled = true; $('detectStatus').textContent = '';
  S.cores = [makeCore({ name: t('core.first') })];
  activateCore(S.cores[0].id, true);
}

/* ───────────── projects: library and autosave ───────────── */

let storageOK = false, loading = false, dirty = false, saveTimer = 0;

function setSaveState(st) { $('saveState').textContent = t('save.' + st); $('saveState').dataset.state = st; }

export function markDirty() {
  if (loading || VIEW_ONLY) return;
  blankStart = false;   // V0.2: work started without creating a project is saved as a new project
  scheduleFloat();
  dirty = true; setSaveState(storageOK && !readOnlyProject ? 'dirty' : 'off');
  clearTimeout(saveTimer); if (storageOK) saveTimer = setTimeout(saveToDB, 1500);
}

let savePromise = null, lastSaveError = null;
/** Save the open project; saves never overlap (a new save waits for the one in progress). */
let blankStart = true;   // V31: nothing is saved until the user creates or opens a project
async function saveToDB() {
  if (blankStart || loading || readOnlyProject) return;   // V0.36: never during a load nor over a file of a newer version
  if (!S.id || !S.cores.length) return;   // V0.36: the initial state (before startup) is not a project
  if (!storageOK) return;
  clearTimeout(saveTimer);
  if (savePromise) { await savePromise.catch(() => {}); if (!dirty && !savePromise) return; }
  savePromise = (async () => {
    try {
      setSaveState('saving'); dirty = false;
      await storePendingImages();
      await putProject(projectMeta(), serialize());
      try { await putLite(S.id, liteSnapshot()); } catch { /* lite index is optional */ }
      broadcast({ type: 'saved', id: S.id });
      if (saveCount++ % 10 === 0) checkQuota();   // V0.36
      try { localStorage.setItem('ichantool.last', S.id); } catch { /* storage blocked */ }
      setSaveState(dirty ? 'dirty' : 'saved'); scheduleBackup();
    } catch (e) {
      dirty = true; lastSaveError = e; setSaveState('error'); console.error(e);
      if (e?.name === 'QuotaExceededError') toast(t('save.quota'));
    }
  })();
  try { await savePromise; } finally { savePromise = null; }
}
/** V0.36: the daily copies are kept for 30 days; older ones only the first of each month, for 12 months. */
async function rotateHistory(hist) {
  const names = []; for await (const [name, h] of hist.entries()) if (h.kind === 'file' && /^\d{4}-\d{2}-\d{2}\.json$/.test(name)) names.push(name);
  names.sort().reverse();   // newest first
  const keep = new Set(names.slice(0, 30)), months = [];
  for (const n of [...names.slice(30)].reverse()) { const mo = n.slice(0, 7); if (!months.some((x) => x.mo === mo)) months.push({ mo, n }); }   // first copy of each older month
  for (const { n } of months.sort((a, b) => b.mo.localeCompare(a.mo)).slice(0, 12)) keep.add(n);
  for (const n of names) if (!keep.has(n)) await hist.removeEntry(n);
}
/** V0.36: warn when the browser storage is almost full (once per session). */
let quotaWarned = false;
async function checkQuota() {
  try {
    const e = await navigator.storage?.estimate?.(); if (!e?.quota) return;
    const f = e.usage / e.quota; $('saveState').title = t('quota.use', { u: (e.usage / 1e6).toFixed(0), q: (e.quota / 1e6).toFixed(0), p: (f * 100).toFixed(0) });
    if (f > 0.8 && !quotaWarned) { quotaWarned = true; toast(t('quota.high', { p: (f * 100).toFixed(0) }), 10000); }
  } catch { /* not available */ }
}
let saveCount = 0;
async function flushSave() { if (savePromise) await savePromise; if (dirty) await saveToDB(); if (backupPending) await backupNow(); }
/* V0.36: do not lose the last changes when the page or the program is closed */
let closeOK = false;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) saveToDB(); });
window.addEventListener('pagehide', () => { if (dirty) saveToDB(); });
window.addEventListener('beforeunload', (e) => {
  if ((!dirty && !savePromise) || closeOK || readOnlyProject || blankStart) return;
  e.preventDefault(); e.returnValue = '';
  if (window.corantoolDesktop) desktopClose();
});
/** V0.57 desktop: save, then close; if the changes cannot be saved, ask instead of refusing to close in silence. */
function desktopClose() {
  if (document.querySelector('dialog.saveFail')) return;
  flushSave().then(() => { if (dirty) saveFailDialog(lastSaveError); else { closeOK = true; window.close(); } }).catch((err) => { console.error(err); saveFailDialog(err); });
}
function saveFailDialog(err) {
  const dlg = document.createElement('dialog'); dlg.className = 'saveFail';
  const reason = !storageOK ? t('close.noStorage') : err?.name === 'QuotaExceededError' ? t('save.quota') : err?.message || '';
  dlg.innerHTML = `<form method="dialog" style="display:grid;gap:10px;max-width:460px"><h3 style="margin:0">${esc(t('close.failTitle'))}</h3><p style="margin:0">${esc(t('close.failText'))}</p>${reason ? `<p class="note" style="margin:0">${esc(reason)}</p>` : ''}
    <div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class="btn" value="cancel">${esc(t('cl.cancel'))}</button><button class="btn" value="discard">${esc(t('close.discard'))}</button><button class="btn" value="export">${esc(t('close.export'))}</button><button class="btn primary" value="retry" autofocus>${esc(t('close.retry'))}</button></div></form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', async () => {
    const v = dlg.returnValue; dlg.remove();
    if (v === 'retry') desktopClose();
    else if (v === 'discard') { closeOK = true; window.close(); }
    else if (v === 'export') {
      try { await saveFile(`${safe(S.name)}.sedcoretool`, await packageProjects([serialize()]), 'application/zip'); toast(t('close.exported'), 8000); }
      catch (e2) { console.error(e2); toast(t('close.exportFail'), 8000); }
    }
  });
  dlg.showModal();
}

function updateProjHeader() {
  $('projName').textContent = S.name;
  const multi = S.kind === 'multi';
  document.querySelector('#projBtn .lbl').textContent = t(multi ? 'mp.label' : 'proj.label');
  $('projClose').textContent = t(multi ? 'mp.back' : 'home.back');
}

/** Identity of a core across projects: the same name (ignoring case, spaces and punctuation). */
const coreKey = (name) => String(name ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
/** For each core identity, the projects that contain it (from the light index). */
function sharedCores(lites) {
  const m = new Map();
  for (const l of lites) if (l.kind !== 'multi') for (const c of l.cores || []) { const k = coreKey(c.name); if (!k) continue; if (!m.has(k)) m.set(k, new Map()); m.get(k).set(l.id, l.name); }
  return m;
}
/** Saved cross-project analyses (kind 'multi'), listed in the «Entre proyectos» tab, never among the projects (V24). */
function renderAnalyses(list, q = '') {
  const box = $('mpList'); if (!box) return;
  const shown = list.filter((p) => !q || coreKey(p.name).includes(q) || (p.coreNames || []).some((n) => coreKey(n).includes(q)));
  $('mpSaved').hidden = !list.length;
  box.innerHTML = shown.map((p) => `<article class="pcard ${p.id === S.id ? 'current' : ''}" data-id="${p.id}" tabindex="0" aria-label="${esc(p.name)}">
    <h3>${esc(p.name)}</h3>
    <p class="facts"><span>${t('home.cores', { n: p.cores ?? (p.coreNames || []).length })}</span><span class="note">${esc((p.coreNames || []).slice(0, 8).join(', '))}${(p.coreNames || []).length > 8 ? '…' : ''}</span>${p.id === S.id ? `<span>${t('proj.current')}</span>` : ''}</p>
    <div class="pacts"><button class="btn small primary" data-act="open">${t('proj.open')}</button><button class="btn small" data-act="mpupdate">${t('mp.update')}</button><button class="btn small" data-act="rename">${t('proj.rename')}</button><button class="btn small" data-act="del">${t('proj.del')}</button></div>
  </article>`).join('') || `<p class="note">${t('home.noMatch')}</p>`;
}
async function renderProjects() {
  const box = $('projList');
  if (!storageOK) { box.innerHTML = `<p class="note">${t('save.off')}</p>`; return; }
  let [list, lites] = await Promise.all([listProjects().catch(() => []), listLite().catch(() => [])]);
  list.sort((a, b) => b.updated - a.updated);
  const L = new Map(lites.map((l) => [l.id, l])), shared = sharedCores(lites), q = coreKey($('homeSearch').value);
  renderAnalyses(list.filter((p) => p.kind === 'multi'), q);   // V24: cross-project analyses are not projects
  list = list.filter((p) => p.kind !== 'multi');
  $('nProjects').textContent = list.length;
  $('nCores').textContent = shared.size;
  $('projClose').hidden = !S.cores.length && !S.sections.length;
  if (!list.length) {
    box.innerHTML = `<div class="pempty"><h3>${t('home.emptyTitle')}</h3><p class="note">${t('home.emptyText')}</p>
      <div class="row"><button class="btn primary" data-empty="new">${t('home.newProject')}</button><button class="btn" data-empty="tutorial">${t('tut.open')}</button></div></div>`;
    return;
  }
  const rel = (ms) => { const d = (Date.now() - ms) / 60000; return d < 1 ? t('home.now') : d < 60 ? t('home.min', { n: Math.round(d) }) : d < 1440 ? t('home.hours', { n: Math.round(d / 60) }) : new Date(ms).toLocaleDateString(lang(), { dateStyle: 'medium' }); };
  const shown = list.filter((p) => !q || coreKey(p.name).includes(q) || (p.coreNames || []).some((n) => coreKey(n).includes(q)));
  box.innerHTML = shown.map((p) => {
    const lite = L.get(p.id), cores = lite?.cores || (p.coreNames || []).map((n) => ({ name: n }));
    const len = (c) => { const d = (c.depth || []).filter((v) => v != null); return d.length ? Math.max(...d) - Math.min(...d) : 0; };
    const maxLen = Math.max(1, ...cores.map(len)), ivCores = new Set((lite?.intervals || []).map((iv) => iv.core));
    const nShared = cores.filter((c) => (shared.get(coreKey(c.name))?.size || 0) > 1).length;
    const liners = cores.slice(0, 22).map((c) => {
      const others = [...(shared.get(coreKey(c.name)) || new Map()).entries()].filter(([id]) => id !== p.id).map(([, n]) => n);
      const h = len(c) ? Math.max(16, Math.round((len(c) / maxLen) * 60)) : 30;
      const tip = `${c.name}${len(c) ? ` — ${fmt(len(c), 3)} ${c.units || ''}` : ''}${c.nImages ? `, ${t('home.nImg', { n: c.nImages })}` : ''}${Object.keys(c.proxies || {}).length ? `, ${t('home.nVar', { n: Object.keys(c.proxies).length })}` : ''}${others.length && p.kind !== 'multi' ? `. ${t('home.alsoIn', { p: others.join(', ') })}` : ''}`;
      return `<span class="liner ${c.nImages ? 'img' : ''} ${ivCores.has(c.id) ? 'iv' : ''} ${others.length && p.kind !== 'multi' ? 'shared' : ''}" style="height:${h}px" title="${esc(tip)}"></span>`;
    }).join('') + (cores.length > 22 ? `<span class="more">+${cores.length - 22}</span>` : '') || `<span class="emptytray">${t('home.noCores')}</span>`;
    const kind = p.kind === 'multi' ? t('mp.badge') : p.kind === 'tutorial' ? t('home.kindTutorial') : '';
    return `<article class="pcard ${p.id === S.id ? 'current' : ''}" data-id="${p.id}" tabindex="0" aria-label="${esc(p.name)}">
      <div class="tray" aria-hidden="true">${liners}</div>
      <h3>${esc(p.name)}</h3>
      <p class="facts"><span>${t('home.cores', { n: p.cores ?? cores.length })}</span><span>${t('home.nImg', { n: p.sections ?? 0 })}</span>${nShared && p.kind !== 'multi' ? `<span class="warnshare">${t('home.shared', { n: nShared })}</span>` : ''}<span>${p.id === S.id ? t('proj.current') : rel(p.updated)}</span></p>
      <div class="pacts"><button class="btn small primary" data-act="open">${t('proj.open')}</button><button class="btn small" data-act="rename">${t('proj.rename')}</button>${p.kind === 'multi' ? `<button class="btn small" data-act="mpupdate">${t('mp.update')}</button>` : ''}<button class="btn small ghost" data-act="del">${t('proj.del')}</button>${kind ? `<span class="tag">${esc(kind)}</span>` : ''}</div>
    </article>`;
  }).join('') || `<p class="note">${t('home.noMatch')}</p>`;
}
$('homeSearch').addEventListener('input', () => { renderProjects(); renderAllProjects(); });
for (const id of ['projList', 'mpList']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('pcard')) e.target.querySelector('[data-act=open]').click(); });
async function onProjectListClick(e) {
  const em = e.target.closest('[data-empty]')?.dataset.empty;
  if (em === 'new') { $('newProjOpen').click(); return; }
  if (em === 'tutorial') { openTutorial(true); return; }
  const row = e.target.closest('.pcard'); if (!row) return;
  const btn = e.target.closest('button') || (e.target.closest('input') ? null : row.querySelector('[data-act=open]')); if (!btn) return;
  const id = row.dataset.id, act = btn.dataset.act;
  if (act === 'mpupdate') { await updateMultiProject(id); return; }
  if (act === 'open') {
    if (id === S.id) { hideHome(); return; }
    await flushSave(); hideHome();
    await busy(async () => { const data = await getProject(id); if (data) await loadProject(data); });
  } else if (act === 'del') {
    if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = t('proj.delConfirm'); btn.classList.add('danger'); return; }
    await deleteProject(id);
    if (id === S.id) { resetState(); dirty = false; syncSettingsForm(); updateProjHeader(); setSaveState('saved'); }
    renderProjects(); renderAllProjects();
  } else if (act === 'rename') {
    const b = row.querySelector('h3'), inp = document.createElement('input');
    inp.type = 'text'; inp.value = b.textContent; b.replaceWith(inp); inp.focus(); inp.select();
    const commit = async () => {
      const name = inp.value.trim() || b.textContent;
      const metas = await listProjects(); const m = metas.find((x) => x.id === id);
      if (m) await putMeta({ ...m, name });
      if (id === S.id) { S.name = name; updateProjHeader(); markDirty(); }
      renderProjects();
    };
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') inp.blur(); });
    inp.addEventListener('blur', commit, { once: true });
  }
}
$('projList').addEventListener('click', onProjectListClick);
$('mpList').addEventListener('click', onProjectListClick);

$('projBtn').addEventListener('click', () => showHome());
$('projClose').addEventListener('click', () => hideHome());
$('newProjOpen').addEventListener('click', () => { $('newProjForm').hidden = false; $('newProjName').focus(); });
$('newProjCancel').addEventListener('click', () => { $('newProjForm').hidden = true; });
$('newProjForm').addEventListener('submit', (e) => e.preventDefault());
$('newProjBtn').addEventListener('click', async () => {
  if (!$('newProjName').value.trim()) { $('newProjName').focus(); return; }
  $('newProjForm').hidden = true;
  await flushSave();
  resetState(); S.name = $('newProjName').value.trim() || t('proj.untitled'); $('newProjName').value = '';
  syncSettingsForm(); learnNow(); updateProjHeader(); refreshOtherExamples(); setTimeout(updateTip, 0);
  await saveToDB(); renderProjects(); hideHome();
});
$('openTest').addEventListener('click', async () => { hideHome(); await openTestProject(); });
$('openIdeal').addEventListener('click', async () => { hideHome(); await busy(loadExample); });
$('expProj').addEventListener('click', () => busy(async () => { await flushSave(); await saveFile(`${safe(S.name)}.sedcoretool`, await packageProjects([serialize()]), 'application/zip'); }));   // V0.8: package with full-resolution images
$('cmtBtn').addEventListener('click', openComments);
$('cmtAdd').addEventListener('click', addComment);
$('cmtFilter').addEventListener('change', renderComments);
$('cmtClose').addEventListener('click', () => $('cmtDlg').close());
$('cmtBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const box = b.closest('.cmt'), c = S.comments.find((x) => x.id === box.dataset.id); if (!c) return;
  const act = b.dataset.act, now = new Date().toISOString();
  if (act === 'go') {
    const k = S.cores.find((q) => q.sections.some((x) => x.id === c.sec)); if (!k) return;
    if (k.id !== S.curCore) activateCore(k.id);
    const i = S.sections.findIndex((x) => x.id === c.sec); $('cmtDlg').close(); setMode('section'); selectSection(i);
    if (c.x != null) setTimeout(() => { S.view.zoom = Math.max(S.view.zoom, 1); S.view.x = c.x - view.width / 2 / S.view.zoom; S.view.y = c.y - view.height / 2 / S.view.zoom; requestRender(); }, 60);
    return;
  }
  if (act === 'reply') { const inp = box.querySelector('[data-reply]'), text = inp.value.trim(); if (!text) return; const author = $('cmtAuthor').value.trim(); try { localStorage.setItem('corantool.author', author); } catch { /* blocked */ } (c.replies ||= []).push({ id: uid(), author, date: now, text }); c.edited = now; }
  else if (act === 'done') { c.done = !c.done; c.edited = now; }
  else if (act === 'del') { if (!confirm(t('cmt.delAsk'))) return; S.comments = S.comments.filter((x) => x !== c); }
  else if (act === 'delr') { if (!confirm(t('cmt.delAsk'))) return; const rid = b.closest('[data-rid]').dataset.rid; c.replies = c.replies.filter((r) => r.id !== rid); c.edited = now; }
  markDirty(); renderComments(); requestRender();
});
$('openFolder').addEventListener('click', () => { hideHome(); openProjectFolder(); });
$('impProj').addEventListener('change', async (e) => {
  const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
  hideHome();
  await busy(() => restoreFiles(files));
});

/* ───────────── test core (IODP 397-U1385I-1H) ───────────── */

const TEST_CORE = {
  name: 'Sondeo de prueba · IODP 397-U1385I-1H',
  sections: [[1, 0, 1.5], [2, 1.5, 2.99], [3, 2.99, 4.49], [4, 4.49, 5.98], [5, 5.98, 7.48], [6, 7.48, 8.78]],
  age: '# Modelo de edad ILUSTRATIVO, no publicado: tasa de sedimentación constante supuesta de 10 cm/ka,\n# solo para probar la conversión a edad. Sustitúyelo por el modelo publicado del sitio U1385.\n# profundidad CSF-A (m), edad (ka)\n0, 0\n8.78, 87.8',
  records: [['U1385I-1H/records/397-U1385I-1H_RSC_color.csv', 'Color RSC'], ['U1385I-1H/records/397-U1385I-1H_MS.csv', 'Susceptibilidad magnética']],
};

async function openTestProject() {
  await flushSave();
  await busy(async () => {
    resetState(); loading = true;
    try {
      S.name = TEST_CORE.name; S.id = 'test-u1385'; Object.assign(curCore(), { name: 'U1385I-1H', lat: 37.571, lon: -10.126, waterDepth: 2578, units: 'm' }); renderCoreBar();
      S.notes = 'IODP Expedition 397, Site U1385, Hole I, Core 1H. Section-half images, colour reflectance (RSC) and magnetic susceptibility from the IODP LIMS (web.iodp.tamu.edu/LORE). Images reduced to 50 px/cm.';
      for (const [i, top, bottom] of TEST_CORE.sections) {
        const path = `U1385I-1H/web/397-U1385I-1H-${i}-A_50pxcm.jpg`;
        const bytes = new Uint8Array(await (await fetchAsset(path)).arrayBuffer());
        const { w, h, rgba } = await decodeBytes(bytes, path, 'image/jpeg', { k: 1 });
        const s = newSection({ name: `U1385I-1H-${i}`, file: { name: path.split('/').pop(), type: 'image/jpeg', bytes }, w, h, orig: rgba, full: { w, h } });
        const m = Math.round(w * 0.1);
        Object.assign(s, { top, bottom, units: 'm', roi: { x0: m, y0: 0, x1: w - m, y1: h }, preset: 'levels', filters: { ...FILTER_PRESETS.levels } });
        s.detect = { ...DEFAULT_DETECT, offset: 14, radius: 50, minArea: 20, smooth: 2 };
        enhance(s);
        S.sections.push(s);
      }
      if (S.sections[0]) S.settings.binCm = 100 / pxPerCm(S.sections[0]);
      $('ageText').value = TEST_CORE.age; $('ageUnits').value = 'ka';
      for (const [path, name] of TEST_CORE.records) {
        const tab = parseTable(await (await fetchAsset(path)).text());
        addRecordFromTable(name, tab, 0, 'depth', tab.headers.map((_, i) => i).slice(1));
      }
      for (const s of S.sections) await withPixels(s, detectSection);
    } catch (e) { toast(t('err.image', { m: e.message || e })); }
    finally { loading = false; }
    syncSettingsForm(); setAge(); selectSection(0, true); learnNow(); updateProjHeader(); refreshOtherExamples(); setTimeout(updateTip, 0); renderRecList(); renderLogPanel(); scheduleLog(0); refreshAllCores();
    await saveToDB();
  });
}

async function startup() {
  storageOK = await storageAvailable();
  setSaveState(storageOK ? 'saved' : 'off');
  if (VIEW_ONLY) { await startWindow(); return; }
  if (storageOK) setTimeout(() => gcImages().catch(() => {}), 15000);   // V0.1: images of deleted sections
  await loadPresets(); await initBackups(); setTimeout(() => checkBackupAge().catch(() => {}), 4000); hideMissingExamples().catch(() => {});
  const firstRun = storageOK && !(await listProjects().catch(() => [])).length;
  showHome();
  if (firstRun) { blankStart = true; return; }   // V31: clean start — the start screen invites to create or open a project (examples on demand)
  if (storageOK) {
    let last = null; try { last = localStorage.getItem('ichantool.last'); } catch { /* storage blocked */ }
    const list = await listProjects().catch(() => []);
    const target = list.find((p) => p.id === last) || list.sort((a, b) => b.updated - a.updated)[0];
    if (target) {
      const data = await getProject(target.id).catch(() => null);
      if (data) { await busy(() => loadProject(data)); return; }
    }
  }
  await openTestProject();
}

/* ───────────── backups ───────────── */
// Three layers: (1) the browser library (IndexedDB, marked persistent); (2) an automatic mirror in a
// folder chosen by the user — ideally one synced by OneDrive/Google Drive/Dropbox — with one current
// file per project, a daily history and the user settings; (3) on-demand full backup files.

let backupDir = null, backupState = 'none', lastBackup = 0, backupTimer = 0, backupPending = false, persisted = false;
const fsSupported = () => typeof window.showDirectoryPicker === 'function';
const today = () => new Date().toISOString().slice(0, 10);

function settingsBundle() {
  return { app: APP, kind: 'settings', version: 1, saved: new Date().toISOString(), presets: userPresets, maxMP: S.settings.maxMP };
}

async function initBackups() {
  try { if (navigator.storage?.persist) persisted = await navigator.storage.persist(); } catch { /* not available */ }
  if (storageOK) {
    backupDir = await getPref('backupDir').catch(() => null);
    lastBackup = (await getPref('lastBackup').catch(() => 0)) || 0;
    if (backupDir?.queryPermission) {
      const perm = await backupDir.queryPermission({ mode: 'readwrite' }).catch(() => 'denied');
      backupState = perm === 'granted' ? 'ok' : 'needs';
    } else if (backupDir) backupState = 'needs';
  }
  renderBackupState();
}

function renderBackupState() {
  const when = lastBackup ? new Date(lastBackup).toLocaleString(lang(), { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const dir = backupDir?.name ? `«${backupDir.name}»` : '';
  $('bkStatus').textContent = t('bk.' + backupState, { dir, when });
  $('bkStatus').dataset.state = backupState;
  $('bkPersist').textContent = t(persisted ? 'bk.persistOn' : 'bk.persistOff');
  $('bkChoose').hidden = !fsSupported();
  $('bkNoFs').hidden = fsSupported();
  $('bkReactivate').hidden = backupState !== 'needs';
  $('bkReactivateTop').hidden = backupState !== 'needs';
}

/**
 * V0.8: project folder (automatic copy, e.g. in a shared Drive folder): <name>__<id>/project.json, the original images
 * in images/ (each written once) and one copy per day in historial/. Another computer opens it with «Open project folder».
 */
async function writeProjectFolder(root, d) {
  const dir = await root.getDirectoryHandle(`${safe(d.name)}__${d.id}`, { create: true }), imgs = await dir.getDirectoryHandle('images', { create: true });
  const e = projectForExport(d);
  for (const im of e.images) {
    const name = im.path.slice('images/'.length);
    let have = false; try { await imgs.getFileHandle(name); have = true; } catch { /* not written yet */ }
    if (have) continue;
    const blob = await im.get(), fh = await imgs.getFileHandle(name, { create: true }), w = await fh.createWritable(); await w.write(blob); await w.close();
  }
  const text = JSON.stringify(e.json);
  await writeText(dir, 'project.json', text);
  const hist = await dir.getDirectoryHandle('historial', { create: true });
  await writeText(hist, `${today()}.json`, text);
  await rotateHistory(hist).catch(() => { /* rotation is best effort */ });
}
/** Open a project folder written by writeProjectFolder (or its parent with several projects). */
async function openProjectFolder() {
  let dir; try { dir = await window.showDirectoryPicker({ id: 'corantool-project', mode: 'read' }); } catch (e) { if (e?.name !== 'AbortError') toast(e.message || String(e)); return; }
  const dirs = [];
  try { await dir.getFileHandle('project.json'); dirs.push(dir); } catch { for await (const h of dir.values()) if (h.kind === 'directory') { try { await h.getFileHandle('project.json'); dirs.push(h); } catch { /* not a project */ } } }
  if (!dirs.length) { toast(t('bk.noFolderProject')); return; }
  const files = [];
  for (const d of dirs) {
    const p = await (await (await d.getFileHandle('project.json')).getFile()).text();
    files.push({ folder: d, text: p });
  }
  await busy(() => restoreFolders(files));
}
async function writeText(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable(); await w.write(text); await w.close();
}

function scheduleBackup() {
  if (backupState !== 'ok') return;
  backupPending = true; clearTimeout(backupTimer); backupTimer = setTimeout(backupNow, 20000);
}

let backupRetries = 0;
async function backupNow() {
  clearTimeout(backupTimer);
  if ((backupState !== 'ok' && backupState !== 'error') || !backupDir) return;
  try {
    const since = lastBackup;
    if (S.sections.length || S.records.length) await writeProjectFolder(backupDir, serialize());
    // V0.38: every other project changed since the last copy is copied too (not only the open one)
    if (storageOK) for (const m of await listProjects().catch(() => [])) {
      if (m.id === S.id || !(m.updated > since)) continue;
      const d = await getProject(m.id).catch(() => null); if (d) await writeProjectFolder(backupDir, d);
    }
    await writeText(backupDir, 'sedcoretool_ajustes.json', JSON.stringify(settingsBundle(), null, 1));
    lastBackup = Date.now(); backupPending = false; backupRetries = 0; backupState = 'ok'; setPref('lastBackup', lastBackup).catch(() => {});
  } catch (e) {
    backupState = 'error'; console.error(e);
    if (backupRetries++ < 3) backupTimer = setTimeout(backupNow, 60000 * backupRetries);   // V0.38: retried after 1, 2 and 3 min
  }
  renderBackupState();
}
/** V0.38: warning when the automatic copy is set but has not run for a week (or needs reactivating) and there are changes. */
async function checkBackupAge() {
  if (!backupDir || !storageOK) return;
  const newest = Math.max(0, ...(await listProjects().catch(() => [])).map((m) => m.updated || 0));
  if (newest > lastBackup && (backupState === 'needs' || Date.now() - lastBackup > 7 * 864e5)) toast(t('bk.old', { d: lastBackup ? Math.floor((Date.now() - lastBackup) / 864e5) : '?' }), 9000);
}

$('bkChoose').addEventListener('click', async () => {
  try {
    backupDir = await window.showDirectoryPicker({ id: 'ichantool-backup', mode: 'readwrite' });
    await setPref('backupDir', backupDir).catch(() => {});
    backupState = 'ok'; await backupNow();
  } catch (e) { if (e?.name !== 'AbortError') toast(e.message || String(e)); }
  renderBackupState();
});
for (const id of ['bkReactivate', 'bkReactivateTop']) $(id).addEventListener('click', async () => {
  if (!backupDir) return;
  const perm = await backupDir.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
  backupState = perm === 'granted' ? 'ok' : 'needs';
  if (backupState === 'ok') await backupNow(); else renderBackupState();
});

/* ── V0.8: shareable package (.sedcoretool, before V0.52 .corantool = ZIP with project.json and the original images at full resolution) ── */
const imgExt = (f) => (/\.[a-z0-9]{2,5}$/i.exec(f.name || '')?.[0] || (/png/.test(f.type) ? '.png' : /tif/.test(f.type) ? '.tif' : '.jpg'));
/** Project data → { json, images:[{path, get()}] } with every image referenced as images/<section id><ext>. */
function projectForExport(d, prefix = '') {
  const p = JSON.parse(JSON.stringify(d, (k, v) => (v instanceof Blob ? undefined : v))), images = [];
  const src = new Map(); for (const c of d.cores || [{ sections: d.sections }]) for (const q of c.sections || []) src.set(q.id, q.file);
  for (const c of p.cores || [{ sections: p.sections }]) for (const q of c.sections || []) {
    const f = src.get(q.id) || q.file, path = `images/${q.id}${imgExt(f)}`;
    images.push({ path: prefix + path, get: async () => f.blob || (f.key ? await getImage(f.key) : null) || new Blob([f.bytes ? new Uint8Array(f.bytes) : f.b64 ? b64decode(f.b64) : new Uint8Array()]) });
    q.file = { name: f.name, type: f.type, path };
  }
  return { json: p, images };
}
async function packageProjects(list) {
  const files = [];
  if (list.length === 1) { const e = projectForExport(list[0]); files.push({ name: 'project.json', data: JSON.stringify(e.json) }); for (const im of e.images) files.push({ name: im.path, data: await im.get() }); }
  else list.forEach((d, i) => { const e = projectForExport(d, `p${i + 1}/`); files.push({ name: `p${i + 1}/project.json`, data: JSON.stringify(e.json) }, ...e.images.map((im) => ({ name: im.path, lazy: im.get }))); });
  for (const f of files) if (f.lazy) { f.data = await f.lazy(); delete f.lazy; }
  files.push({ name: 'settings.json', data: JSON.stringify(settingsBundle()) });
  return zipFiles(files);
}
/** One file with every project of the library plus the user settings. */
$('bkFull').addEventListener('click', () => busy(async () => {
  await flushSave();
  const projects = [];
  if (storageOK) for (const m of await listProjects()) { const d = await getProject(m.id); if (d) projects.push(d); }
  else projects.push(serialize());
  await saveFile(`sedcoretool_copia_${today()}.sedcoretool`, await packageProjects(projects), 'application/zip');   // V0.8: one package, images included
}));

/** Restore project files, full backups or settings files (several at once). */
async function restoreFolders(list) {
  const files = list.map((x) => { const f = new Blob([x.text]); f.name = 'project.json'; f.folder = x.folder; return f; });
  return restoreFiles(files);
}
async function restoreFiles(files) {
  let nProj = 0, nPre = 0, lastLoaded = null, rejected = 0;
  const existing = storageOK ? new Set((await listProjects()).map((m) => m.id)) : new Set();
  const addProject = async (p, getBlob = null) => {
    for (const c of p.cores || [{ sections: p.sections }]) for (const q of c.sections || [])   // V0.36: a damaged file is not stored
      for (const k of ['labels', 'exclude']) if (q.w && q.h && q[k] != null && !rleValid(q[k], q.w * q.h)) { rejected++; toast(t('load.failed', { e: t('load.badMask', { s: q.name || '?', k }) }), 9000); return; }
    if (p.id && existing.has(p.id)) {   // V0.8: the same project (work by turns): replace the local version or keep both
      const m = await getMeta(p.id).catch(() => null);
      if (confirm(t('bk.replaceAsk', { n: p.name || APP, a: m?.updated ? new Date(m.updated).toLocaleString() : '?', b: p.saved ? new Date(p.saved).toLocaleString() : '?' }))) {
        if (p.id === S.id) { clearTimeout(saveTimer); dirty = false; }
        const old = await getProject(p.id).catch(() => null);
        if (old && storageOK) {   // V0.36: the local version is kept as a copy before it is replaced
          const id2 = uid(), name2 = `${old.name || APP} (${t('bk.previous')} ${new Date(m?.updated || Date.now()).toLocaleDateString()})`;
          await putProject({ ...(m || {}), id: id2, name: name2, updated: Date.now() }, { ...old, id: id2, name: name2 });
        }
        const mine = p.id === S.id ? S.comments : old?.comments;
        p.comments = mergeComments(mine || [], p.comments || []);   // comments of both versions are kept
      }
      else { p.id = uid(); p.name = `${p.name || APP} (${t('bk.restored')})`; }
    } else if (!p.id) p.id = uid();
    existing.add(p.id);
    const nSec = p.cores ? p.cores.reduce((n, c) => n + (c.sections || []).length, 0) : (p.sections || []).length;
    await internImages(p, getBlob);
    if (storageOK) await putProject({ id: p.id, name: p.name, updated: Date.now(), sections: nSec, cores: p.cores?.length || 1, coreNames: p.cores?.map((c) => c.name) }, p);
    lastLoaded = p; nProj++;
  };
  for (const f of files) {
    let p;
    const head = new Uint8Array(await f.slice(0, 2).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b) {   // V0.8: ZIP package (.sedcoretool or .corantool)
      try {
        const z = await unzipBlob(f), get = (base) => async (path) => { const e = z.get(base + path); return e ? e.get() : null; };
        for (const [name, e] of z) {
          if (!name.endsWith('project.json')) continue;
          const q = JSON.parse(await (await e.get()).text()); if (!APP_NAMES.includes(q.app)) continue;
          await addProject(q, get(name.slice(0, -'project.json'.length)));
        }
        if (z.get('settings.json')) nPre += mergePresets(JSON.parse(await (await z.get('settings.json').get()).text()).presets);
      } catch (e) { console.error(e); toast(t('err.import', { f: f.name, m: e?.message || String(e) })); }
      continue;
    }
    try { p = JSON.parse(await f.text()); } catch { toast(t('err.project')); continue; }
    if (!APP_NAMES.includes(p.app)) { toast(t('err.project')); continue; }
    const fromFolder = f.folder ? async (path) => { let d = f.folder; const parts = path.split('/'); for (const x of parts.slice(0, -1)) d = await d.getDirectoryHandle(x); return (await d.getFileHandle(parts.at(-1))).getFile(); } : null;
    try {
      if (p.kind === 'project') await addProject(p, fromFolder);
      else if (p.kind === 'backup') { for (const q of p.projects || []) await addProject(q); nPre += mergePresets(p.settings?.presets); }
      else if (p.kind === 'settings') nPre += mergePresets(p.presets);
    } catch (e) { console.error(e); toast(t('err.import', { f: f.name, m: e?.message || e?.name || String(e) })); continue; }
  }
  if (lastLoaded) { if (lastLoaded.id !== S.id) await flushSave(); if ((await loadProject(lastLoaded)) === false) return; if (!storageOK) dirty = true; }   // V0.36: keep the load error visible
  if (nProj || nPre || !rejected) toast(t('bk.restoredN', { p: nProj, s: nPre }));
}

/* ───────────── composite log ───────────── */

function defaultLogView() {
  return { axis: 'depth', from: null, to: null, height: 900, imgMode: 'enh', overlay: true, hideExcl: false,
    tracks: { image: true, total: true, species: true, BI: true, ii: true, manual: true } };
}
S.logView = defaultLogView();
export let mode = 'section', logTimer = 0, lastLog = null;

function setMode(m) {
  mode = m; setTimeout(updateTip, 0); setTimeout(() => applyPanels(), 0);
  $('work').classList.toggle('log', m === 'log');
  $('work').classList.toggle('geo', m === 'geo');
  $('work').classList.toggle('data', m === 'data');
  $('work').classList.toggle('fig', m === 'fig');
  for (const [id, k] of [['modeSection', 'section'], ['modeLog', 'log'], ['modeData', 'data'], ['modeGeo', 'geo'], ['modeFig', 'fig']]) $(id).setAttribute('aria-pressed', String(m === k));
  if (m === 'data') { renderData(); return; }
  if (m === 'fig') { busy(async () => { await loadLand(); renderFigPanel(); renderFigure(); }); return; }
  if (m === 'log') { renderLogPanel(); scheduleLog(0); }
  else if (m === 'geo') busy(async () => { await loadLand(); renderGeo(); });
  else requestAnimationFrame(resizeCanvases);
}
$('modeSection').addEventListener('click', () => setMode('section'));
$('modeLog').addEventListener('click', () => setMode('log'));
$('modeGeo').addEventListener('click', () => setMode('geo'));
$('modeData').addEventListener('click', () => setMode('data'));
$('modeFig').addEventListener('click', () => setMode('fig'));

export function scheduleLog(ms = 200) { if (mode !== 'log') return; clearTimeout(logTimer); logTimer = setTimeout(() => busy(renderLog), ms); }

export function compositeData(axisPref = S.logView.axis) {   // V0.32: a figure may ask for its own axis
  const secs = [...S.sections].sort((a, b) => a.top * UNIT_TO_CM[a.units] - b.top * UNIT_TO_CM[b.units]);
  const base = secs[0]?.units || 'cm';
  const f = (s) => UNIT_TO_CM[s.units] / UNIT_TO_CM[base];
  for (const s of secs) analyze(s);
  const model = S.age.model, axis = axisPref === 'age' && model ? 'age' : 'depth';
  const rows = compositeRows(secs.map((s) => ({ name: s.name, bins: s.bins.map((b) => ({ ...b, dTop: b.dTop * f(s), dBottom: b.dBottom * f(s), depth: b.depth * f(s) })) })), { axis, model });
  return { secs, base, f, model, axis, rows };
}

/**
 * V0.41: box-filter reduction of a w × h layer to sw × sh without a full-size canvas: pix(i) returns [r, g, b, a] for
 * source pixel i (or null = transparent); colours are averaged with premultiplied alpha, as a canvas downscale does.
 */
export function reduceRGBA(w, h, sw, sh, pix) {
  const n = sw * sh, acc = new Float32Array(n * 4), cnt = new Uint32Array(n), cx = new Int32Array(w);
  for (let x = 0; x < w; x++) cx[x] = Math.min(sw - 1, Math.floor((x * sw) / w));
  for (let y = 0; y < h; y++) {
    const oy = Math.min(sh - 1, Math.floor((y * sh) / h)) * sw, row = y * w;
    for (let x = 0; x < w; x++) {
      const o = oy + cx[x]; cnt[o]++; const p = pix(row + x); if (!p) continue;
      const a = p[3], j = o * 4; acc[j] += p[0] * a; acc[j + 1] += p[1] * a; acc[j + 2] += p[2] * a; acc[j + 3] += a;
    }
  }
  const im = new ImageData(sw, sh), d = im.data;
  for (let o = 0; o < n; o++) { const j = o * 4, A = acc[j + 3]; if (!A) continue; d[j] = acc[j] / A; d[j + 1] = acc[j + 1] / A; d[j + 2] = acc[j + 2] / A; d[j + 3] = A / cnt[o]; }
  return im;
}

/**
 * Column strip of a section (≤ 512 px wide). V0.1: the reduced picture (original or treated) is cached apart from the
 * coloured traces, so changing overlay settings only needs the masks, not the picture on disk.
 */
function sectionCanvas(s) {
  const lv = S.logView, key = `${s.logVer}|${lv.imgMode}|${lv.overlay}|${lv.hideExcl}|${S.ovAlpha}|${S.settings.predThr}|${S.settings.includePred}|${S.settings.countCandidates}|${s.w}x${s.h}`;
  if (s._lc?.key === key) return s._lc.canvas;
  const k = Math.min(1, 512 / s.w), sw = Math.max(1, Math.round(s.w * k)), sh = Math.max(1, Math.round(s.h * k));
  const bkey = `${lv.imgMode}|${s.ds}|${s.w}x${s.h}|${s.rot}|${JSON.stringify(s.crop)}|${lv.imgMode === 'orig' ? '' : JSON.stringify(s.filters) + JSON.stringify(s.roi)}`;
  if (s._lb?.key !== bkey) {
    if (!s.orig) {   // grey strip until the picture is read from disk
      needPixels(s); const p = document.createElement('canvas'); p.width = sw; p.height = sh;
      const g = p.getContext('2d'); g.fillStyle = '#cfd4d2'; g.fillRect(0, 0, sw, sh); s._lc = { key: 'pending', canvas: p, k: sw / s.w }; return p;
    }
    const src = lv.imgMode === 'orig' ? s.orig : s.enh, px = [0, 0, 0, 255];
    const b = document.createElement('canvas'); b.width = sw; b.height = sh;
    b.getContext('2d').putImageData(reduceRGBA(s.w, s.h, sw, sh, (i) => { const j = i * 4; px[0] = src[j]; px[1] = src[j + 1]; px[2] = src[j + 2]; return px; }), 0, 0);   // V0.41
    s._lb = { key: bkey, canvas: b };
  }
  const out = document.createElement('canvas'); out.width = sw; out.height = sh;
  const oc = out.getContext('2d'); oc.drawImage(s._lb.canvas, 0, 0);
  if (lv.overlay || lv.hideExcl) {   // traces (alpha a) and blank excluded zones, averaged straight into the strip (V0.41)
    const L = s.labels, ex = s.exclude, eff = lv.overlay ? effClassArray(s) : null, cols = S.classes.map((q) => hex(q.color)), a = Math.round(255 * Math.max(0.35, S.ovAlpha));
    const W = 255, px = [0, 0, 0, 0];
    const im = reduceRGBA(s.w, s.h, sw, sh, (i) => {
      if (ex[i]) { if (!lv.hideExcl) return null; px[0] = px[1] = px[2] = px[3] = W; return px; }   // V31: excluded zones left blank
      if (!eff) return null; const id = topAt(L[i], s.stacks); if (!id) return null; const q = eff[id]; if (q < 0) return null;
      const col = cols[q]; px[0] = col[0]; px[1] = col[1]; px[2] = col[2]; px[3] = a; return px;
    });
    const t2 = document.createElement('canvas'); t2.width = sw; t2.height = sh; t2.getContext('2d').putImageData(im, 0, 0);
    oc.drawImage(t2, 0, 0); t2.width = t2.height = 0;
  }
  s._lc = { key, canvas: out, k: sw / s.w };
  return out;
}

/** Core image strip for the window, resampled row by row onto the depth or age axis. */
/**
 * V0.23–V0.25: image panels of a core (core column, Figures › core, Multiproxy): original, enhanced, traces painted,
 * outlined, traces only, black and white, arrows, side by side. o = { panels, w, hideExcl, keep, stretch }:
 * width keeps the photo proportions (keep) × stretch, or w px. Panels other than the plain image need the depth axis.
 */
export function coreImages(D, from, to, H, o) {
  const panels = (o.panels?.length ? o.panels : [o.mode === 'orig' ? 'orig' : 'enh']).filter((p) => FIG_PANELS.includes(p));
  let w = +o.w > 0 ? +o.w : 64;
  if (o.keep) { if (D.axis === 'depth') { const r = coreRatio(D, from, to); if (r) w = H / r; } w *= +o.stretch > 0 ? +o.stretch : 1; }
  w = Math.round(Math.max(8, Math.min(600, w)));
  if (D.axis !== 'depth' || (o.plain && panels.length === 1 && panels[0] === (o.mode === 'orig' ? 'orig' : 'enh'))) return [{ href: stripDataURL(D, from, to, H, w * 2), w }];
  const tr = panels.includes('arrows') ? figTraces(D, from, to) : null, multi = panels.length > 1;
  return panels.map((p) => {
    const im = { href: panelDataURL(D, from, to, H, w, p === 'arrows' ? 'enh' : p, !!o.hideExcl), w, title: multi ? t('fig.p.' + p) : null };
    if (p === 'arrows') { im.draw = (x, cw, y) => arrowMarksSVG(tr, x, cw, y); im.marks = false; }
    return im;
  });
}
/** Core column and Multiproxy: the panels and width chosen in the core column. */
function columnImages(D, from, to, H) {
  const lv = S.logView, st = lv.style || {};
  return coreImages(D, from, to, H, { panels: lv.imgPanels, mode: lv.imgMode, hideExcl: lv.hideExcl, keep: (st.imgAspect || 'keep') === 'keep', stretch: st.imgStretch, w: st.imgW, plain: true });
}

function stripDataURL(D, from, to, H, W) {
  const Hc = Math.min(4000, Math.round(H * 2)), c = document.createElement('canvas'); c.width = W; c.height = Hc;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, Hc);
  const inv = invertModel(D.model);
  for (let r = 0; r < Hc; r++) {
    const v = from + ((r + 0.5) / Hc) * (to - from);
    const d = D.axis === 'age' ? interpAge(inv, v) : v; if (d == null) continue;
    const s = D.secs.find((q) => d >= q.top * D.f(q) && d < q.bottom * D.f(q)); if (!s) continue;
    const row = Math.floor(rowAtDepth(s, d / D.f(s))); if (row < s.roi.y0 || row >= s.roi.y1) continue;
    const cv = sectionCanvas(s), k = s._lc.k;
    ctx.drawImage(cv, s.roi.x0 * k, Math.min(cv.height - 1, Math.floor(row * k)), Math.max(1, (s.roi.x1 - s.roi.x0) * k), 1, 0, r, W, 1);
  }
  return c.toDataURL('image/jpeg', 0.88);
}

export function logRecords(D) {
  const inv = invertModel(D.model), out = [];
  for (const r of S.records) for (const s of r.series) if (s.show) out.push({ name: s.name, color: s.color, reverse: s.reverse, axis: r.axis, x: s.x, y: s.y, pts: s.x.map((x, i) => [toAxis(x, r.axis, D.axis, D.model, inv), s.y[i]]) });
  // V0.28: width of the age interval (e.g. Bacon 95 %) as one more track, when the age model has it
  const m = S.age.model;
  if (m?.min && S.logView.tracks.ageErr !== false) {
    const name = t('age.errTrack', { u: S.age.units || 'ka' }), y = m.depth.map((_, i) => m.max[i] - m.min[i]);
    out.push({ name, color: '#6b5e4b', reverse: false, axis: 'depth', x: m.depth, y, pts: m.depth.map((d, i) => [toAxis(d, 'depth', D.axis, D.model, inv), y[i]]) });
  }
  return out;
}

/** V0.23: which image panels the core column shows and how wide the image is. */
function renderImgPanelsForm() {
  const lv = S.logView, st = lv.style || {}, on = new Set(lv.imgPanels || []), asp = st.imgAspect || 'keep';
  $('logImgPanels').innerHTML = `<div class="f"><span>${t('log.panels')}</span><div class="chk2">${FIG_PANELS.map((p) => `<label class="chk"><input type="checkbox" data-imgp="${p}" ${on.has(p) ? 'checked' : ''}><span>${t('fig.p.' + p)}</span></label>`).join('')}</div><p class="note">${t('log.panelsNote')}</p></div>
    <div class="grid2" style="grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr)"><label class="f"><span>${t('log.imgAspect')}</span><select data-st="imgAspect"><option value="keep" ${asp === 'keep' ? 'selected' : ''}>${t('log.asp.keep')}</option><option value="fixed" ${asp === 'fixed' ? 'selected' : ''}>${t('log.asp.fixed')}</option></select></label>
    ${asp === 'keep' ? `<label class="f"><span>${t('log.imgStretch')}</span><input type="number" data-st="imgStretch" min="0.05" step="0.1" value="${st.imgStretch ?? ''}" placeholder="1"></label>` : `<label class="f"><span>${t('log.imgW')}</span><input type="number" data-st="imgW" min="8" max="600" step="2" value="${st.imgW ?? ''}" placeholder="64"></label>`}</div>`;
}
/** V0.23: NO DATA and marker fields of the column style (shared by the core column and the figures). */
export function ndFormHTML(st) {
  const q = { ...ND_STYLE, ...st };
  return `<div class="f"><span>${t('nd.title')}</span><div class="grid2">
    <label class="f"><span>${t('nd.fill')}</span><select data-st="ndFill">${['hatch', 'solid', 'none'].map((v) => `<option value="${v}" ${q.ndFill === v ? 'selected' : ''}>${t('nd.f.' + v)}</option>`).join('')}</select></label>
    <label class="f"><span>${t('nd.colors')}</span><span class="row"><input type="color" data-st="ndColor" value="${q.ndColor}"><input type="color" data-st="ndLine" value="${q.ndLine}"></span></label>
    <label class="f"><span>${t('nd.text')}</span><input type="text" data-st="ndText" value="${esc(q.ndText || '')}" placeholder="${esc(t('log.noData'))}"></label>
    <span></span></div><div class="chk2"><label class="chk"><input type="checkbox" data-st="ndShow" ${q.ndShow ? 'checked' : ''}><span>${t('nd.show')}</span></label><label class="chk"><input type="checkbox" data-st="ndLabel" ${q.ndLabel ? 'checked' : ''}><span>${t('nd.label')}</span></label><label class="chk"><input type="checkbox" data-st="ndImage" ${q.ndImage ? 'checked' : ''}><span>${t('nd.image')}</span></label></div></div>
    <div class="f"><span>${t('mk.title')}</span><div class="grid2">
    <label class="f"><span>${t('mk.size')}</span><input type="number" data-st="markSize" min="0.2" max="5" step="0.1" value="${st.markSize ?? ''}" placeholder="1"></label>
    <label class="f"><span>${t('mk.stroke')}</span><span class="row"><input type="color" data-st="markStroke" value="${st.markStroke && st.markStroke !== 'none' ? st.markStroke : '#ffffff'}"><input type="number" data-st="markStrokeW" min="0" max="4" step="0.2" value="${st.markStrokeW ?? ''}" placeholder="0.8" style="width:60px" title="${esc(t('mk.strokeW'))}"></span></label></div></div>`;
}
/** V0.23: markers and labels of the arrows panel (section figure and core column). */
export function arrowFormHTML() {
  const F = S.fig, ex = new Set(F.arrowExcl || []);
  return `<div class="grid2"><label class="f"><span>${t('ar.src')}</span><select id="figArrowSrc">${['all', 'marks', 'objects'].map((v) => `<option value="${v}" ${(F.arrowSrc || 'all') === v ? 'selected' : ''}>${t('ar.src.' + v)}</option>`).join('')}</select></label>
    <label class="f"><span>${t('ar.objScale')}</span><input type="number" id="figObjScale" min="0.2" max="3" step="0.1" value="${F.objScale ?? 1}"></label>
    <label class="f"><span>${t('mk.size')}</span><input type="number" id="figMarkScale" min="0.2" max="5" step="0.1" value="${F.markScale ?? 1}"></label>
    <label class="f"><span>${t('mk.stroke')}</span><span class="row"><input type="color" id="figMarkStroke" value="${F.markStroke && F.markStroke !== 'none' ? F.markStroke : '#ffffff'}"><input type="number" id="figMarkStrokeW" min="0" max="4" step="0.2" value="${F.markStrokeW ?? 0.8}" style="width:60px" title="${esc(t('mk.strokeW'))}"></span></label>
    <label class="f"><span>${t('ar.labelSize')}</span><input type="number" id="figLabelSize" min="5" max="30" step="1" value="${F.labelSize ?? 10}"></label>
    <label class="f"><span>${t('ar.labelColor')}</span><span class="row"><input type="color" id="figLabelColor" value="${F.labelColor || '#1c2422'}"><label class="chk"><input type="checkbox" id="figLabelHalo" ${F.labelHalo !== false ? 'checked' : ''}><span>${t('ar.halo')}</span></label></span></label></div>
    <div class="f"><span>${t('ar.excl')}</span><div class="chk2">${S.classes.filter((c) => c.id !== 'artifact').map((c) => `<label class="chk"><input type="checkbox" data-arex="${esc(c.id)}" ${ex.has(c.id) ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')}</div></div>`;
}

export function renderLog() {
  $('logStage').querySelector('[data-label-editor]')?.remove();
  const box = $('logSvg');
  if (!S.sections.length) { box.innerHTML = `<p class="note" style="padding:24px">${t('log.empty')}</p>`; lastLog = null; return; }
  const D = compositeData(), lv = S.logView;
  const [r0, r1] = rowsRange(D.rows);
  let from = lv.from ?? r0, to = lv.to ?? r1;
  if (!(to > from)) { from = r0; to = r1; }
  $('logFrom').value = +from.toPrecision(6); $('logTo').value = +to.toPrecision(6);
  const classes = S.classes.map((c, i) => ({ name: c.name, color: c.color, symbol: c.symbol || 'triDown', index: i, counts: c.counts })).filter((c) => c.counts);
  const records = logRecords(D), imgW = 64;
  const images = lv.tracks.image ? columnImages(D, from, to, lv.height) : null, image = images?.[0] || null;
  const boundaries = D.secs.map((s) => ({ a: D.axis === 'age' ? interpAge(D.model, s.top * D.f(s)) : s.top * D.f(s), label: s.name })).filter((b) => b.a != null);
  const { style, label: axisLabel } = logStyleOf(D);
  const marks = lv.tracks.marks !== false ? compositeMarks(D) : [], idm = idMode();
  let res;
  try { res = buildLogSVG({
    style, title: S.name, subtitle: idm && !['total', 'species', 'BI', 'ii'].some((k) => lv.tracks[k]) ? t('id.subtitle', { n: marks.length, from: fmt(from, 4), to: fmt(to, 4), u: D.axis === 'age' ? S.age.units : D.base }) : t('log.subtitle', { n: D.secs.length, b: fmt(S.settings.binCm || 1, 3), from: fmt(from, 4), to: fmt(to, 4), u: D.axis === 'age' ? S.age.units : D.base }),
    axisLabel, from, to, height: lv.height, rows: D.rows, classes, tracks: lv.tracks, image, images, imageWidth: image?.w || imgW, records, boundaries,   // V0.2: identification marks and quantified tracks can be shown together
    marks, idList: idm || marks.length ? idListOf(D.rows, marks) : null, legendClasses: legendOf(lv.overlay || lv.tracks.species ? classes.filter((c) => D.rows.some((r) => r.classPct?.[c.index] > 0)) : [], marks),
    ...geoOverlay(D.axis),
    labels: { noData: t('log.noData'), total: t('log.total'), species: t('log.species'), image: t('log.image'), marks: t('id.marks'), idList: t('id.list') },
    colWidths: (lv.colW ||= {}),
  }); } catch (e) { console.error(e); box.innerHTML = `<p class="note">${esc(axisErr(e))}</p>`; lastLog = null; return; }
  box.innerHTML = res.svg;
  lastLog = { ...D, from, to, classes, records, svg: res.svg };
  syncColOrder('log', res.columns);   // V0.33
  editSVGLabels(box, (lv.textEdits ||= {}), (svg) => { if (lastLog) lastLog.svg = svg; });
  const ov = geoOverlay(D.axis);
  logInteract(box, res, { from, to, axisLabel, records, bands: ov.bands || [], widths: lv.colW, onResize: () => { markDirty(); renderLog(); if ($('logStyle')) $('logStyle').innerHTML = styleFormHTML(); },
    extra: (a) => {
      const r = D.rows.find((q) => q.a0 <= a && a < q.a1); if (!r) return [];
      const out = [[t('log.total'), `${fmt(r.pct ?? 0, 3)} %`]];
      if (r.BI != null) out.push(['BI', r.BI]); if (r.ii != null) out.push(['ii', r.ii]);
      classes.map((c) => [c.name, r.classPct?.[c.index] || 0]).filter((q) => q[1] > 0).sort((x, y) => y[1] - x[1]).slice(0, 4).forEach(([n, v]) => out.push([n, `${fmt(v, 3)} %`]));
      return out;
    } });
}

/* ── V0.5: style of the column and its figure (per core, shared by the column view and the column figure) ── */
const AGE_TO_KA = { a: 0.001, ka: 1, Ma: 1000 };
export function logStyleOf(D) {
  const st = { ...LOG_STYLE, ...(S.logView.style || {}) };
  let unit, f = 1;
  if (D.axis === 'age') { unit = st.yUnitAge && AGE_TO_KA[st.yUnitAge] && AGE_TO_KA[S.age.units] ? st.yUnitAge : S.age.units; f = AGE_TO_KA[S.age.units] / (AGE_TO_KA[unit] || AGE_TO_KA[S.age.units] || 1) || 1; }
  else { unit = st.yUnit && UNIT_TO_CM[st.yUnit] ? st.yUnit : D.base; f = UNIT_TO_CM[D.base] / UNIT_TO_CM[unit]; }
  return { style: { ...st, yFactor: f }, label: `${t(D.axis === 'age' ? 'r.age' : 'r.depth')} (${unit})` };
}
/* ───────────── V0.33: order and visibility of the columns of every chart ───────────── */
const lastCols = { log: [], geo: [], range: [] };
export const colView = (kind) => (kind === 'geo' ? S.geo.view : S.logView);
export function colOrderHTML(kind) {
  const lv = colView(kind), st = lv.style || {}, hide = new Set(st.colHide || []);
  const cols = orderCols(lastCols[kind].map((c) => ({ ...c })), { colOrder: st.colOrder });
  const li = (c) => `<li draggable="true" data-colid="${esc(c.id)}"><span class="grip" aria-hidden="true">⋮⋮</span><label class="chk"><input type="checkbox" data-colshow="${esc(c.id)}" ${hide.has(c.id) ? '' : 'checked'}><span title="${esc(c.title || c.id)}">${esc(c.title || c.id)}</span></label><button type="button" class="btn small ghost" data-colmv="-1" aria-label="${esc(t('co.up'))}">↑</button><button type="button" class="btn small ghost" data-colmv="1" aria-label="${esc(t('co.down'))}">↓</button></li>`;
  return `<div class="f" data-colord="${kind}"><span>${t('co.title')}</span>${cols.length ? `<ol class="colord">${cols.map(li).join('')}</ol><p class="note">${t('co.note')}</p>` : `<p class="note">${t('co.empty')}</p>`}</div>`;
}
/** After a chart is built: remember its columns and refresh the list if the set of columns changed. */
export function syncColOrder(kind, columns) {
  if (!columns) return;
  const key = (a) => a.map((c) => c.id).sort().join('|'), changed = key(columns) !== key(lastCols[kind]);
  lastCols[kind] = columns;
  if (changed) document.querySelectorAll(`[data-colord="${kind}"]`).forEach((el) => { el.outerHTML = colOrderHTML(kind); });
}
function afterColChange(kind) {
  markDirty();
  if (kind === 'geo') setTimeout(renderGeoLogs, 0); else { scheduleLog(); requestRender(); }
  if (mode === 'fig') scheduleFigure();
}
function saveColOrder(box) {
  const kind = box.dataset.colord, lv = colView(kind); lv.style ||= {};
  lv.style.colOrder = [...box.querySelectorAll('li[data-colid]')].map((l) => l.dataset.colid);
  afterColChange(kind);
}
document.addEventListener('change', (e) => {
  const el = e.target; if (el.dataset?.colshow == null) return;
  const box = el.closest('[data-colord]'), lv = colView(box.dataset.colord); lv.style ||= {};
  const h = new Set(lv.style.colHide || []); if (el.checked) h.delete(el.dataset.colshow); else h.add(el.dataset.colshow);
  lv.style.colHide = [...h]; afterColChange(box.dataset.colord);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-colmv]'); if (!b) return;
  const li = b.closest('li'), box = b.closest('[data-colord]'), d = +b.dataset.colmv;
  const sib = d < 0 ? li.previousElementSibling : li.nextElementSibling; if (!sib) return;
  if (d < 0) sib.before(li); else sib.after(li);
  b.focus(); saveColOrder(box);
});
let colDrag = null;
document.addEventListener('dragstart', (e) => { const li = e.target.closest?.('li[data-colid]'); if (!li) return; colDrag = li; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', li.dataset.colid); } catch { /* old browsers */ } });
document.addEventListener('dragover', (e) => {
  if (!colDrag) return; const li = e.target.closest?.('li[data-colid]'); if (!li || li === colDrag || li.parentElement !== colDrag.parentElement) return;
  e.preventDefault(); const r = li.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) li.before(colDrag); else li.after(colDrag);
});
document.addEventListener('dragend', () => { if (!colDrag) return; const box = colDrag.closest('[data-colord]'); colDrag.classList.remove('dragging'); colDrag = null; if (box) saveColOrder(box); });

const COLOR_FIELDS = {
  log: ['barColor', 'lineColor', 'biColor', 'iiColor', 'manualColor', 'textColor', 'subColor', 'frameColor', 'gridColor', 'boundaryColor', 'bgColor'],
  range: ['barColor', 'textColor', 'subColor', 'frameColor', 'gridColor', 'bgColor'],
  geo: ['barColor', 'lineColor', 'textColor', 'subColor', 'frameColor', 'gridColor', 'bgColor'],
};
export function colorsFormHTML(style, kind) {
  const st = { ...LOG_STYLE, ...style };
  return `<div class="f"><span>${t('color.title')}</span><div class="grid2">${COLOR_FIELDS[kind].map((key) => `<label class="f"><span>${t('color.' + key)}</span><input type="color" data-st="${key}" value="${esc(st[key])}"></label>`).join('')}</div><button type="button" class="btn small" data-colreset="${kind}">${t('color.reset')}</button><p class="note">${t('color.note')}</p></div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-colreset]'); if (!b) return;
  const kind = b.dataset.colreset, lv = kind === 'geo' ? S.geo.view : S.logView;
  lv.style ||= {}; for (const key of COLOR_FIELDS[kind]) delete lv.style[key];
  markDirty();
  if (kind === 'geo') { $('geoStyleForm').innerHTML = ''; renderGeoLogs(); }
  else { renderLogPanel(); scheduleLog(); if (mode === 'fig') { renderFigPanel(); scheduleFigure(); } }
});
export function styleFormHTML() {
  const st = { ...LOG_STYLE, ...(S.logView.style || {}) }, num = (k, lab, step = 'any', min = 0) => `<label class="f"><span>${t(lab)}</span><input type="number" data-st="${k}" step="${step}" min="${min}" value="${st[k] ?? ''}" placeholder="${t('fig.auto2')}"></label>`;
  const chk = (k, lab) => `<label class="chk"><input type="checkbox" data-st="${k}" ${st[k] ? 'checked' : ''}><span>${t(lab)}</span></label>`;
  const sel = (k, lab, opts) => `<label class="f"><span>${t(lab)}</span><select data-st="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(st[k] ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  return `${colOrderHTML('log')}<div class="grid2">
    ${sel('yUnit', 'st.yUnit', [['', t('st.native')], ['m', 'm'], ['cm', 'cm'], ['mm', 'mm']])}
    ${sel('yUnitAge', 'st.yUnitAge', [['', t('st.native')], ['a', 'a'], ['ka', 'ka'], ['Ma', 'Ma']])}
    ${num('yStep', 'st.yStep')}${num('yDiv', 'st.yDiv', 1, 1)}
    ${num('yMajor', 'st.yMajor')}${num('yMinor', 'st.yMinor')}
    ${num('yLabelLen', 'st.yLabelLen', 1, 1)}${num('yMinorLen', 'st.yMinorLen', 1, 1)}
    ${num('pctDiv', 'st.pctDiv', 1, 1)}${num('fontSize', 'st.fontSize', 1, 6)}
    ${sel('totalStyle', 'st.totalStyle', ['barsline', 'bars', 'line', 'points'].map((v) => [v, t('st.ts.' + v)]))}
    <label class="f"><span>${t('st.totalTitle')}</span><input type="text" data-st="totalTitle" value="${esc(st.totalTitle || '')}" placeholder="${esc(t('log.total'))}"></label>
    <label class="f"><span>${t('st.speciesTitle')}</span><input type="text" data-st="speciesTitle" value="${esc(st.speciesTitle || '')}" placeholder="${esc(t('log.species'))}"></label></div>
    <div class="chk2">${chk('frame', 'st.frame')}${chk('grid', 'st.grid')}${chk('boundaries', 'st.boundaries')}${chk('showTitle', 'st.showTitle')}</div>
    ${colorsFormHTML(st, 'log')}${speciesFormHTML(st)}
    ${ndFormHTML(st)}
    ${axesFormHTML()}`;
}
/** V0.31: ichnotaxa shown in «By ichnotaxon» (and the distribution chart), stacked or each in its own column. */
export function speciesFormHTML(st) {
  const hide = new Set(st.speciesHide || []), names = S.classes.filter((c) => c.counts !== false && c.id !== 'artifact').map((c) => c.name);
  return `<div class="f"><span>${t('sp.title')}</span>
    <label class="f"><span>${t('sp.mode')}</span><select data-st="speciesMode"><option value="stack" ${st.speciesMode !== 'separate' ? 'selected' : ''}>${t('sp.stack')}</option><option value="separate" ${st.speciesMode === 'separate' ? 'selected' : ''}>${t('sp.separate')}</option></select></label>
    <div class="chk2">${names.map((n) => `<label class="chk"><input type="checkbox" data-sph="${esc(n)}" ${hide.has(n) ? '' : 'checked'}><span><i>${esc(n)}</i></span></label>`).join('')}</div></div>`;
}
/** V0.6: width and axis format of each column at the right of the core (total, ichnotaxa, BI, ii and records). */
export function axesFormHTML(only = null, lv = S.logView, recNames = null) {
  const ax = lv.style?.axes || {}, W = lv.colW || {};
  const recs = recNames || [...new Set(S.records.flatMap((r) => r.series.map((x) => x.name)))];
  const sep = lv.style?.speciesMode === 'separate', spHide = new Set(lv.style?.speciesHide || []);
  const spCols = sep ? S.classes.filter((c) => c.counts !== false && c.id !== 'artifact' && !spHide.has(c.name)).map((c) => ['sp:' + c.name, c.name, 70]) : [['species', t('log.species'), 150]];
  const cols = [['total', t('log.total'), 150], ...spCols, ['BI', 'BI', 46], ['ii', 'ii', 46], ...recs.map((n) => ['rec:' + n, n, 120])];
  const cell = (id, k, ph, step = 'any') => `<input type="number" data-ax="${esc(id)}" data-k="${k}" step="${step}" value="${ax[id]?.[k] ?? ''}" placeholder="${ph}" aria-label="${esc(id + ' ' + k)}" style="width:100%;min-width:54px">`;
  return `<div class="f"><span>${t('st.axes')}</span><div style="overflow-x:auto"><table class="axtab" style="font-size:11px;border-collapse:collapse;width:100%">
    <tr><th></th><th>${t('st.ax.w')}</th><th>${t('st.ax.min')}</th><th>${t('st.ax.max')}</th><th>${t('st.ax.div')}</th><th>${t('st.ax.dec')}</th><th>${t('edit.step')}</th><th title="${esc(t('st.ax.revTip'))}">⇄</th><th title="${esc(t('st.ax.logTip'))}">log</th></tr>
    ${cols.filter(([id]) => !only || only.includes(id)).map(([id, name, w]) => `<tr><td title="${esc(name)}" style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</td>
      <td><input type="number" data-axw="${esc(id)}" min="30" max="600" step="10" value="${W[id] ?? ''}" placeholder="${w}" style="width:100%"></td>
      <td>${cell(id, 'min', 'auto')}</td><td>${cell(id, 'max', 'auto')}</td><td>${cell(id, 'div', 'auto', 1)}</td><td>${cell(id, 'dec', 'auto', 1)}</td><td>${cell(id, 'step', 'auto')}</td>
      <td><input type="checkbox" data-ax="${esc(id)}" data-k="rev" ${ax[id]?.rev ? 'checked' : ''}></td>
      <td><input type="checkbox" data-ax="${esc(id)}" data-k="log" ${ax[id]?.log ? 'checked' : ''}></td></tr>`).join('')}
    </table></div><p class="note">${t('st.axesNote')}</p></div>`;
}
export function onStyleInput(e) {
  const el = e.target, geo = !!el.closest('[data-stt="geo"]'), lv = geo ? S.geo.view : S.logView;   // V0.22: Multiproxy has its own scales
  if (geo) setTimeout(renderGeoLogs, 0);
  if (el.dataset.axw != null) { lv.colW ||= {}; const v = +el.value; if (v >= 30) lv.colW[el.dataset.axw] = Math.min(600, v); else delete lv.colW[el.dataset.axw]; markDirty(); scheduleLog(); if (mode === 'fig') scheduleFigure(); return; }
  if (el.dataset.ax != null) {
    lv.style ||= {}; lv.style.axes ||= {}; const a = (lv.style.axes[el.dataset.ax] ||= {}), k2 = el.dataset.k;
    const previous = a[k2];
    a[k2] = el.type === 'checkbox' ? el.checked : el.value === '' ? null : +el.value;
    const invalid = (a.min != null && a.max != null && !(a.max > a.min)) || (a.log && ((a.min != null && a.min <= 0) || (a.max != null && a.max <= 0)));
    if (invalid) { a[k2] = previous; el.setCustomValidity(t('edit.invalidAxis')); el.reportValidity(); return; }
    el.setCustomValidity('');
    markDirty(); scheduleLog(); if (mode === 'fig') scheduleFigure(); return;
  }
  if (el.dataset.sph != null) {   // V0.31: ichnotaxa shown
    lv.style ||= {}; const h = new Set(lv.style.speciesHide || []); if (el.checked) h.delete(el.dataset.sph); else h.add(el.dataset.sph);
    lv.style.speciesHide = [...h]; markDirty(); scheduleLog(); requestRender(); if (mode === 'fig') scheduleFigure(); return;
  }
  const k = el.dataset.st; if (!k) return;
  lv.style ||= {};
  if (el.type === 'checkbox') lv.style[k] = el.checked;
  else if (el.type === 'number') lv.style[k] = el.value === '' ? null : Math.max(0, +el.value);
  else lv.style[k] = el.value;
  markDirty(); scheduleLog(); if (mode === 'fig') scheduleFigure();
}
function renderLogPanel() {
  if ($('logStyle')) $('logStyle').innerHTML = styleFormHTML();
  const lv = S.logView;
  $('logAxis').value = lv.axis === 'age' && S.age.model ? 'age' : 'depth';
  $('logHeight').value = lv.height; $('logHeightOut').textContent = lv.height + ' px';
  renderImgPanelsForm();
  $('logImgMode').value = lv.imgMode; $('logOverlay').checked = lv.overlay; $('logHideExcl').checked = !!lv.hideExcl;
  document.querySelectorAll('#logTracks [data-track]').forEach((el) => (el.checked = ['ageErr', 'marks'].includes(el.dataset.track) ? lv.tracks[el.dataset.track] !== false : !!lv.tracks[el.dataset.track]));
}

$('logStyle').addEventListener('change', onStyleInput);   // V0.5
$('geoStyleForm').addEventListener('change', onStyleInput);   // V0.22
$('geoLayerShow').addEventListener('change', (e) => {   // V0.33: hide or show the active interval family in every chart, without deleting it
  const id = 'band:fam:' + S.geo.activeLayer;
  for (const lv of [S.geo.view, S.logView]) { lv.style ||= {}; const h = new Set(lv.style.colHide || []); if (e.target.checked) h.delete(id); else h.add(id); lv.style.colHide = [...h]; }
  document.querySelectorAll('[data-colshow]').forEach((c) => { if (c.dataset.colshow === id) c.checked = e.target.checked; });
  markDirty(); setTimeout(renderGeoLogs, 0); scheduleLog();
});
$('logPanel').addEventListener('change', (e) => {
  if (e.target.closest('#logStyle')) return;
  const el = e.target, lv = S.logView;
  if (el.closest('#logImgPanels') && el.dataset.st) { onStyleInput(e); renderImgPanelsForm(); return; }   // V0.23
  if (el.dataset.imgp) { lv.imgPanels = [...$('logImgPanels').querySelectorAll('[data-imgp]:checked')].map((i) => i.dataset.imgp); }
  else if (el.dataset.track) lv.tracks[el.dataset.track] = el.checked;
  else if (el.id === 'logAxis') { lv.axis = el.value; lv.from = lv.to = null; }
  else if (el.id === 'logFrom' || el.id === 'logTo') { const a = parseFloat($('logFrom').value), b = parseFloat($('logTo').value); if (b > a) { lv.from = a; lv.to = b; } }
  else if (el.id === 'logImgMode') lv.imgMode = el.value;
  else if (el.id === 'logOverlay') lv.overlay = el.checked;
  else if (el.id === 'logHideExcl') lv.hideExcl = el.checked;
  else if (el.id === 'logHeight') lv.height = +el.value;
  else if (el.closest('#recList')) return;
  else return;
  markDirty(); scheduleLog(50);
});
$('logHeight').addEventListener('input', (e) => { $('logHeightOut').textContent = e.target.value + ' px'; });
$('logAll').addEventListener('click', () => { S.logView.from = S.logView.to = null; markDirty(); scheduleLog(0); });
$('logSVGBtn').addEventListener('click', () => { if (lastLog) saveFile(`${safe(S.name)}_registro.svg`, lastLog.svg, 'image/svg+xml'); });
$('logCSVBtn').addEventListener('click', () => {
  if (!lastLog) return;
  saveFile(`${safe(S.name)}_registro.csv`, withProv(windowCSV({ rows: lastLog.rows, from: lastLog.from, to: lastLog.to, classes: lastLog.classes, records: lastLog.records, units: lastLog.base, ageUnits: S.age.units })), 'text/csv');
});

/* external records (CSV, TXT, Excel) */
// V0.27: record colours told apart in print and by colour-blind readers, away from the ochre of bioturbation
const REC_COLORS = ['#0b5394', '#1b7f6a', '#8c2d5a', '#5c4ea0', '#0e7490', '#3c7d22', '#6b5e4b'];
let pendingTable = null;

function addRecordFromTable(name, tab, xCol, axis, yCols) {
  const n0 = S.records.reduce((k, r) => k + r.series.length, 0);
  const series = recordSeries(tab, xCol, yCols, REC_COLORS, n0);   // V0.44: exportio.js
  if (!series.length) return false;
  S.records.push({ id: uid(), name, axis, series });
  renderRecList(); markDirty(); scheduleLog();
  return true;
}

function renderRecList() {
  $('recList').innerHTML = S.records.map((r) => `
    <div class="rec" data-id="${r.id}">
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(r.name)}</b><button class="btn small ghost" data-del="1" aria-label="${t('a11y.delete')}">✕</button></div>
      <span class="note">${t(r.axis === 'age' ? 'log.age' : 'log.depth')} · ${r.series[0]?.x.length || 0} ${t('log.points')}</span>
      ${r.series.map((s, i) => `<div class="row srow"><label class="chk"><input type="checkbox" data-s="${i}" data-k="show" ${s.show ? 'checked' : ''}><span>${esc(s.name)}</span></label>
        <input type="color" data-s="${i}" data-k="color" value="${s.color}" aria-label="${t('a11y.color')}">
        <label class="chk note"><input type="checkbox" data-s="${i}" data-k="reverse" ${s.reverse ? 'checked' : ''}>${t('log.reverse')}</label></div>`).join('')}
    </div>`).join('') || `<p class="note">${t('log.noRecords')}</p>`;
}
$('recList').addEventListener('change', (e) => {
  const box = e.target.closest('.rec'), r = S.records.find((x) => x.id === box?.dataset.id); if (!r) return;
  const s = r.series[+e.target.dataset.s]; if (!s) return;
  const k = e.target.dataset.k; s[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  markDirty(); scheduleLog(50);
});
$('recList').addEventListener('click', (e) => {
  if (!e.target.dataset.del) return;
  if (!armed(e.target, '?')) return;
  const id = e.target.closest('.rec').dataset.id;
  S.records.splice(S.records.findIndex((r) => r.id === id), 1); renderRecList(); markDirty(); scheduleLog(0);
});

$('recFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const tab = await readTableFile(f);
    if (tab.headers.length < 2 || !tab.rows.length) throw new Error(t('rec.short'));
    pendingTable = tab;
    const g = guessAxisColumn(tab.headers);
    $('recName').value = f.name.replace(/\.[^.]+$/, '');
    $('recX').innerHTML = tab.headers.map((h, i) => `<option value="${i}" ${i === g.col ? 'selected' : ''}>${esc(h)}</option>`).join('');
    $('recAxis').value = g.axis;
    const fillCols = () => {
      const xc = +$('recX').value;
      $('recCols').innerHTML = tab.headers.map((h, i) => i === xc ? '' : `<label class="chk"><input type="checkbox" value="${i}" ${tab.rows.some((r) => r[i] != null) ? 'checked' : 'disabled'}><span>${esc(h)}</span></label>`).join('');
    };
    $('recX').onchange = fillCols; fillCols();
    $('recDlg').showModal();
  } catch (err) { toast(t('rec.err', { m: err.message || err })); }
});
$('recCancel').addEventListener('click', () => $('recDlg').close());
$('recAdd').addEventListener('click', () => {
  if (!pendingTable) return;
  const cols = [...$('recCols').querySelectorAll('input:checked')].map((i) => +i.value);
  if (addRecordFromTable($('recName').value.trim() || 'Registro', pendingTable, +$('recX').value, $('recAxis').value, cols)) $('recDlg').close();
  else toast(t('rec.err', { m: t('rec.short') }));
});

document.addEventListener('change', (e) => { if (e.target.closest('.side.left:not(#logPanel):not(#geoPanel), .side.right')) markDirty(); });

/* ───────────── multiproxy tool: numeric records, interval layers and automatic interval classification ─────────────
   Independent of the ichnotaxon suggestions of the Section mode (learn.js). State lives in S.geo (key kept for file compatibility). */

const GROUP_COLORS = ['#0b5394', '#a23b2a', '#1b7f6a', '#5c4ea0', '#8c2d5a', '#0e7490', '#3c7d22', '#6b5e4b', '#2f4b7c', '#7a6f00', '#9c4f96', '#4a6b8a'];   // V0.27

function defaultGeo() {
  return {
    cores: [], ratios: [], intervals: [], rules: [], groupNames: {},
    layers: [{ id: 'events', name: t('geo.layerEvents'), parent: null, cats: [
      { id: 'lowox', name: t('geo.l.lowox'), color: '#2b6f8f' },
      { id: 'detrital', name: t('geo.l.detrital'), color: '#c07a2c' },
      { id: 'current', name: t('geo.l.current'), color: '#7a4fb2' },
      { id: 'background', name: t('geo.l.background'), color: '#cfc8b6' },
    ] }],
    activeLayer: 'events', activeCat: 'lowox',
    settings: { axis: 'age', step: 1, features: [], logs: [], scaling: 'global', maxGap: null, method: 'rf', params: { rf: {}, knn: {}, nb: {}, kmeans: {}, mlp: {} }, minProb: 0.5, useRules: true, seed: 42, target: 'events', useLayers: null, missing: 'drop' },
    classifiers: [], lastCat: {},
    map: { a0: 6, a1: 10, mode: 'class', feature: '', ref: false, r0: 0, r1: 4, idw: true, power: 2 },
    view: { core: null, tab: 'logs', clf: null, clfTarget: null, showEmpty: true },
  };
}

/** Project data (any version) → current structure. V9 files had a flat label list; it becomes the "Events" layer. */
function normalizeGeo(pg = {}) {
  const gd = defaultGeo(), g = { ...gd, ...pg };
  g.settings = { ...gd.settings, ...(pg.settings || {}), params: { ...gd.settings.params, ...(pg.settings?.params || {}) } };
  g.map = { ...gd.map, ...(pg.map || {}) }; g.view = { ...gd.view, ...(pg.view || {}) };
  if (!pg.layers) {
    g.layers = pg.labels ? [{ id: 'events', name: gd.layers[0].name, parent: null, cats: pg.labels }] : gd.layers;
    g.intervals = (pg.intervals || []).map((q) => ({ ...q, layer: q.layer || 'events', cat: q.cat ?? q.label }));
    { const r = tidyIntervals(g.intervals, { newId: uid }); if (r.changed) { g.intervals = r.list; setTimeout(() => toast(t('iv.tidied')), 600); } }   // V0.34: older projects may have overlaps
    g.rules = (pg.rules || []).map((r) => ({ ...r, layer: r.layer || 'events', cat: r.cat ?? r.label }));
    g.activeCat = pg.activeLabel || g.layers[0].cats[0]?.id;
  }
  delete g.labels; delete g.activeLabel;
  g.classifiers = (pg.classifiers || []).map((c) => ({ ...classifierDefaults(), ...c, params: { ...(c.params || {}) } }));
  g.lastCat ||= {};
  return g;
}

S.geo = defaultGeo();
export const geoRT = { samples: [], labels: [], preds: [], model: null, cv: null, dirty: true, featNames: [], orphans: new Set(), runs: new Map(), layerCols: new Map(), ruleLabels: new Map() };

/** Parameters shown for each method (help text in i18n: geo.p.<method>.<name>). */
const GEO_PARAMS = {
  mlp: [['hidden', 'select', ['8', '16', '32', '16,8', '32,16', '64,32']], ['activation', 'select', ['relu', 'tanh']], ['epochs', 'int', 20, 2000, 10], ['lr', 'float', 0.0005, 0.1, 0.0005], ['l2', 'float', 0, 0.1, 0.0001], ['batch', 'int', 4, 256, 4], ['balanced', 'bool'], ['patience', 'int', 5, 200, 5]],
  rf: [['trees', 'int', 10, 500, 10], ['maxDepth', 'int', 2, 30, 1], ['minLeaf', 'int', 1, 50, 1], ['mtry', 'select', ['sqrt', 'log2', 'all']], ['bins', 'int', 8, 128, 8], ['bootstrap', 'bool'], ['balanced', 'bool']],
  knn: [['k', 'int', 1, 50, 1], ['weights', 'select', ['distance', 'uniform']]],
  nb: [['smoothing', 'float', 1e-9, 0.1, 1e-6], ['priors', 'select', ['uniform', 'empirical']]],
  kmeans: [['k', 'int', 2, 12, 1], ['restarts', 'int', 1, 20, 1], ['maxIter', 'int', 10, 500, 10]],
};

const geoCore = (id) => S.cores.find((c) => c.id === id);
const geoLayer = (id) => S.geo.layers.find((l) => l.id === id);
const geoLayerOf = (catId) => S.geo.layers.find((l) => l.cats.some((c) => c.id === catId));
function geoCat(id) {
  if (id == null) return null;
  for (const l of S.geo.layers) { const c = l.cats.find((k) => k.id === id); if (c) return c; }
  if (id === '__ok') return { id, name: t('geo.testOk'), color: '#2e7d4f' };
  if (id === '__bad') return { id, name: t('geo.testBad'), color: '#c0392b' };
  if (/^G\d+$/.test(id)) return { id, name: S.geo.groupNames[id] || id, color: GROUP_COLORS[(parseInt(id.slice(1), 10) - 1) % GROUP_COLORS.length] };
  return null;
}
/** V0.34: every change to intervals keeps each family without overlaps and joins touching intervals of the same class. */
function tidyGeo(priority = geoSelIv) {
  const r = tidyIntervals(S.geo.intervals, { priority, newId: uid });
  if (!r.changed) return false;
  S.geo.intervals = r.list;
  if (geoSelIv && !r.list.some((q) => q.id === geoSelIv)) geoSelIv = null;
  return true;
}
const geoMarkDirty = () => { tidyGeo(); geoRT.dirty = true; markDirty(); };
const shortTitle = (s, n = 9) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Layers in tree order (parents before children) with their depth in the hierarchy. */
function layerTree() {
  const out = [], L = S.geo.layers, seen = new Set();
  const walk = (parent, depth) => { for (const l of L) if ((l.parent || null) === parent && !seen.has(l.id)) { seen.add(l.id); out.push({ layer: l, depth }); walk(l.id, depth + 1); } };
  walk(null, 0);
  for (const l of L) if (!seen.has(l.id)) out.push({ layer: l, depth: 0 }); // broken parent links
  return out;
}
const isDescendant = (id, anc) => { for (let l = geoLayer(id); l?.parent; l = geoLayer(l.parent)) if (l.parent === anc) return true; return false; };

function allNumericVars() {
  const set = new Set();
  for (const c of S.cores) Object.keys(c.proxies).forEach((k) => set.add(k));
  for (const r of S.geo.ratios) set.add(`${r.a}/${r.b}`);
  return [...set];
}
/** Families (interval layers) that can feed a classifier: every one with classes and described intervals (V26: the pool; each classifier picks from it). */
function featLayers() {
  return S.geo.layers.filter((l) => l.cats.length && S.geo.intervals.some((q) => q.layer === l.id && !q.auto));
}

/* ── classifiers (V26): each one says what it classifies (one or more families), with what (variables and other families) and how (model) ── */
function classifierDefaults() {
  return { id: 'c' + uid(), name: '', targets: [], features: null, layers: null, method: 'rf', params: {}, minProb: 0.5, seed: 42, useRules: true, trained: null };
}
/** First classifier from the old single-model settings (files before V26 and the built-in examples). */
function ensureClassifiers() {
  const g = S.geo, st = g.settings;
  if (g.classifiers.length || g.clfCleared) return;
  const tgt = geoLayer(st.target) ? st.target : featLayers()[0]?.id; if (!tgt) return;
  g.classifiers.push({ ...classifierDefaults(), name: t('cl.default', { n: 1 }), targets: [tgt], layers: st.useLayers ?? null, method: st.method || 'rf', params: JSON.parse(JSON.stringify(st.params || {})), minProb: st.minProb ?? 0.5, seed: st.seed ?? 42, useRules: st.useRules !== false });
}
const curClf = () => S.geo.classifiers.find((c) => c.id === S.geo.view.clf) || S.geo.classifiers[0] || null;
/** Column indices of the sample matrix used by classifier c: its variables (default all of step 2) and the 0/1 columns of its input families. */
function clfCols(c) {
  const st = S.geo.settings, F = st.features, num = (c.features ?? F).map((k) => F.indexOf(k)).filter((j) => j >= 0);
  // V0.37: a target family never uses itself, its ancestors (e.g. "low oxygen" for "sapropel") or its descendants as input
  const rel = new Set(c.targets.flatMap(relatedLayers));
  const inputs = (c.layers ?? featLayers().map((l) => l.id)).filter((id) => !rel.has(id));
  return [...num, ...inputs.flatMap((id) => geoRT.layerCols?.get(id) || [])];
}
/** V0.37: the family itself, its ancestors and its descendants. */
function relatedLayers(id) {
  const L = S.geo.layers, out = new Set([id]);
  for (let p = L.find((l) => l.id === id)?.parent, n = 0; p && !out.has(p) && n < 50; p = L.find((l) => l.id === p)?.parent, n++) out.add(p);
  for (const l of L) if (isBelow(l.id, id)) out.add(l.id);
  return [...out];
}
function isBelow(a, b) { const L = S.geo.layers; for (let p = L.find((l) => l.id === a)?.parent, n = 0; p && n < 50; p = L.find((l) => l.id === p)?.parent, n++) if (p === b) return true; return false; }
/** Current position of the columns a model was trained on (by name, so adding families or variables does not invalidate it); null if one is gone. */
function modelIdx(m) {
  if (m.axis !== S.geo.settings.axis || m.scaling !== S.geo.settings.scaling) return null;
  const idx = m.colNames.map((n) => geoRT.featNames.indexOf(n));
  return idx.every((j) => j >= 0) ? idx : null;
}
/** Input vector of a sample for a trained model: numeric columns re-scaled with the statistics frozen at training (global z-score). */
function clfX(m, s, idx) { return m.transform ? transformSample(s, idx, m.nNum, m.transform) : idx.map((j, k) => (m.zmu && m.isNum[k] ? (s.t[j] == null ? 0 : (s.t[j] - m.zmu[k]) / m.zsd[k]) : s.f[j])); }
function predictRun(c) {
  const run = geoRT.runs.get(c.id); if (!run) return;
  for (const r of run.byTarget.values()) {
    if (!r.model) { r.preds = []; continue; }
    const idx = modelIdx(r.model); r.stale = !idx;
    r.preds = r.stale ? [] : geoRT.samples.map((s) => predictLabel(r.model, clfX(r.model, s, idx), r.model.kind === 'kmeans' ? 0 : c.minProb));
  }
}
function labelsFor(layerId, useRules = true) {
  const g = S.geo, st = g.settings;
  return labelSamples(geoRT.samples, { intervals: g.intervals, rules: g.rules, useRules, features: geoRT.featNames, axis: st.axis, cores: S.cores, layer: layerId });
}
/** Number of validation folds for a family: one per core with labels (≥ 2 cores) or 5 blocks. */
function foldsFor(labels) { const cores = new Set(geoRT.samples.filter((_, i) => labels[i].label).map((s) => s.core)); return cores.size >= 2 ? cores.size : Math.min(5, labels.filter((l) => l.label).length); }
/** Train classifier c on every family it targets; validation leaving one core out (or by blocks). tick(text) is awaited between steps. */
async function trainClassifier(c, tick = async () => {}) {
  const g = S.geo, st = g.settings, method = c.method, params = { ...METHODS[method].defaults, ...(c.params?.[method] || {}) }, seed = c.seed ?? 42;
  const cols = clfCols(c), run = { byTarget: new Map(), cols, at: Date.now(), held: [...holdoutIds()].sort().join() };
  if (!cols.length) { run.error = 'cl.noInputs'; geoRT.runs.set(c.id, run); return run; }
  const view = geoRT.samples.map((s) => ({ core: s.core, x: s.x, f: cols.map((j) => s.f[j]), t: cols.map((j) => s.t[j]) }));
  const rescale = st.scaling === 'global' ? cols.map((j) => j < geoRT.nNum) : null;   // V0.37: scaling refitted in each fold
  for (const lid of c.targets) {
    const L = geoLayer(lid); if (!L) continue;
    // V0.49: intervals of reserved cores (final test) are hidden from training and cross-validation
    const held = holdoutIds(), all = labelsFor(lid, c.useRules !== false), labels = all.map((l, i) => (held.has(view[i].core) ? { label: null, source: null } : l));
    const idx = labels.map((l, i) => (l.label ? i : -1)).filter((i) => i >= 0);
    if (method !== 'kmeans' && new Set(idx.map((i) => labels[i].label)).size < 2) { run.byTarget.set(lid, { labels, preds: [], error: 'cl.needLabels' }); continue; }
    const trainIdx = method === 'kmeans' ? view.map((v, i) => held.has(v.core) ? -1 : i).filter((i) => i >= 0) : idx;
    if (!trainIdx.length) { run.byTarget.set(lid, { labels, preds: [], error: 'cl.needLabels' }); continue; }
    const transform = fitSampleTransform(trainIdx.map((i) => geoRT.samples[i]), geoRT.nNum, st.scaling);
    const X = trainIdx.map((i) => transformSample(geoRT.samples[i], cols, geoRT.nNum, transform)), y = method === 'kmeans' ? null : idx.map((i) => labels[i].label);
    const fit = fitModelSteps(method, X, y, params, seed); let fr;
    if (await tick(t('cl.pFit', { c: c.name, f: L.name }), 0, true)) return null;
    while (!(fr = fit.next()).done) if (await tick(t('cl.pFit', { c: c.name, f: L.name }) + ' · ' + t('cl.pEpoch', { e: fr.value.epoch, n: fr.value.epochs }), fr.value.epoch / fr.value.epochs, false)) return null;
    const model = fr.value;
    Object.assign(model, { cols, nNum: geoRT.nNum, colNames: cols.map((j) => geoRT.featNames[j]), isNum: cols.map((j) => j < geoRT.nNum), transform,
      scaling: st.scaling, axis: st.axis, target: lid, features: cols.map((j) => geoRT.featNames[j]), n: X.length });
    let cv = null;
    if (method !== 'kmeans') {
      const it = crossValidateSteps(view, labels.map((l) => l.label), method, params, seed, { scored: (i) => labels[i].source !== 'rule', minProb: c.minProb, rescale, impute: st.scaling === 'none' ? cols.map((j) => j < geoRT.nNum) : null });
      for (let r = it.next(); ; r = it.next()) { if (r.done) { cv = r.value; break; } const v = r.value; if (await tick(t('cl.pFold', { c: c.name, f: L.name, k: v.fold + 1, n: v.folds }) + (v.epoch ? ' · ' + t('cl.pEpoch', { e: v.epoch, n: v.epochs }) : ''), v.epoch ? v.epoch / v.epochs : 0, !v.epoch)) return null; }
    }
    run.byTarget.set(lid, { model, cv, labels, all, preds: [] });
  }
  geoRT.runs.set(c.id, run); predictRun(c);
  c.trained = { at: new Date().toISOString(), n: [...run.byTarget.values()].reduce((a, r) => a + (r.model?.n || 0), 0) };
  return run;
}
/** Expose the selected classifier/family as geoRT.model/preds/cv/labels (used by the map, the core test and the CSV export). */
function syncCurrent() {
  const c = curClf(), st = S.geo.settings;
  const tgt = c && (c.targets.includes(S.geo.view.clfTarget) ? S.geo.view.clfTarget : c.targets[0]);
  const r = c && tgt ? geoRT.runs.get(c.id)?.byTarget.get(tgt) : null;
  geoRT.model = r?.model || null; geoRT.preds = r?.preds || []; geoRT.cv = r?.cv || null;
  geoRT.labels = r?.labels || (tgt ? labelsFor(tgt, c?.useRules !== false) : geoRT.samples.map(() => ({ label: null, source: null })));
  if (tgt) st.target = tgt;
  if (c) { st.method = c.method; st.minProb = c.minProb; st.seed = c.seed; st.params[c.method] = c.params?.[c.method] || {}; }
}

export function geoComputeSamples() {
  refreshAllCores();
  const g = S.geo, st = g.settings;
  ensureClassifiers();
  if (!st.features.length && !featLayers().length) st.features = allNumericVars().filter((k) => S.cores.some((c) => (c.proxies[k] || []).some((v) => v != null))).slice(0, 12);
  const layers = featLayers();
  geoRT.samples = buildSamples(S.cores, { axis: st.axis, step: st.step, features: st.features, ratios: g.ratios, logs: st.logs, scaling: st.scaling, maxGap: st.maxGap || Infinity, layers, intervals: g.intervals, missing: st.missing });
  geoRT.featNames = [...st.features, ...layerFeatureNames(layers)];
  geoRT.nNum = st.features.length;
  geoRT.layerCols = new Map(); let j = st.features.length;
  for (const l of layers) { geoRT.layerCols.set(l.id, l.cats.map((_, k) => j + k)); j += l.cats.length; }
  geoRT.ruleLabels = new Map(g.layers.filter((l) => g.rules.some((r) => r.layer === l.id && r.enabled !== false)).map((l) => [l.id, labelsFor(l.id, true)]));
  geoRT.orphans = new Set(orphanIntervals(g.intervals, g.layers, S.cores));
  geoRT.dirty = false; geoRT.test = null;
  for (const c of g.classifiers) predictRun(c);
  syncCurrent();
}

function geoReset() { Object.assign(geoRT, { samples: [], labels: [], preds: [], model: null, cv: null, dirty: true, featNames: [], orphans: new Set(), runs: new Map(), layerCols: new Map(), ruleLabels: new Map() }); }

/* ── V27: training runs in steps (one model fit or one validation fold each) with a visible progress bar and Cancel ── */
let geoTraining = null;
function trainProgress(on, frac = 0, text = '') {
  for (const el of document.querySelectorAll('.tprog')) { el.hidden = !on; const bar = el.querySelector('i'); if (bar) bar.style.width = `${Math.round(frac * 100)}%`; const tx = el.querySelector('.tptext'); if (tx) tx.textContent = text; el.setAttribute('aria-valuenow', String(Math.round(frac * 100))); }
  document.querySelectorAll('#geoTrainBtn, #clfList [data-c=train], #geoModelTrain').forEach((b) => (b.disabled = on));
  $('geoTrainState').hidden = on;
}
/** Train every classifier (or only the one given). */
async function geoTrain(silent = false, only = null) {
  if (geoTraining) { if (!silent) toast(t('cl.busy')); return; }
  geoComputeSamples();
  if (!geoRT.samples.length || !geoRT.featNames.length) { if (!silent) toast(t('geo.noSamples')); return; }
  const list = only ? S.geo.classifiers.filter((c) => c.id === only) : S.geo.classifiers;
  if (!list.length) { if (!silent) toast(t('cl.none')); return; }
  // total steps: per classifier and family, 1 fit + the validation folds
  let total = 0;
  for (const c of list) for (const lid of c.targets) { if (!geoLayer(lid)) continue; const lab = labelsFor(lid, c.useRules !== false); total += 1 + (c.method === 'kmeans' ? 0 : foldsFor(lab)); }
  const job = (geoTraining = { cancel: false, done: 0, total: Math.max(1, total), t0: performance.now() });
  // tick(text, partial, newStep): newStep moves to the next of the total steps; partial = fraction of the current step.
  // The page is given a frame at most every 60 ms, so progress is visible and Cancel works without slowing training.
  let last = 0;
  const tick = async (text, partial = 0, newStep = true) => {
    if (newStep && job.started) job.done++;
    job.started = true;
    const frac = Math.min(1, (job.done + Math.min(0.99, partial)) / job.total), now = performance.now();
    if (now - last < 60) return job.cancel;
    last = now;
    const el = (now - job.t0) / 1000, eta = frac > 0.02 ? (el / frac) * (1 - frac) : null;
    trainProgress(true, frac, `${text}${eta != null && el > 1.5 ? ' · ' + t('cl.eta', { s: Math.max(1, Math.round(eta)) }) : ''}`);
    await new Promise((r) => setTimeout(r, 0));
    return job.cancel;
  };
  const problems = [];
  try {
    for (const c of list) {
      const run = await trainClassifier(c, tick);
      if (!run) break;   // cancelled
      if (run.error) problems.push(`${c.name}: ${t(run.error)}`);
      for (const [lid, r] of run.byTarget) if (r.error) problems.push(`${c.name} · ${geoLayer(lid)?.name}: ${t(r.error)}`);
    }
  } finally { geoTraining = null; trainProgress(false); }
  syncCurrent();
  if (!job.cancel) S.geo.trained = { at: new Date().toISOString() };
  if (!silent) { markDirty(); toast(job.cancel ? t('cl.cancelled') : problems.length ? problems.join(' · ') : t('cl.doneIn', { s: fmt((performance.now() - job.t0) / 1000, 2) })); }
  renderGeo(); scheduleLog();
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-tcancel]') && geoTraining) geoTraining.cancel = true; });
// version tag everywhere it can be read (V27)
for (const el of document.querySelectorAll('[data-version]')) el.textContent = DELIVERY;
document.title = `SedCoreTool ${DELIVERY}`;

/* ── left panel ── */
function geoCoreNote(c) {
  const st = S.geo.settings, n = geoRT.samples.filter((x) => x.core === c.id).length;
  const miss = st.features.filter((k) => !(featureSeries(c, k, S.geo.ratios) || []).some((v) => v != null));
  const ni = S.geo.intervals.filter((q) => q.core === c.id).length;
  let s = `${(c.depth || c.age || []).length} ${t('log.points')} · ${Object.keys(c.proxies).length} ${t('geo.vars')} · ${ni} ${t('geo.ivs')} · ${t('geo.nSamples', { n })}`;
  if (!c.age && !c.ageText) s += ' · ' + t('geo.noAge');
  if (!c.depth && !c.age) s += ' · ' + t('geo.noAxisData');
  if (miss.length) s += ' · ' + t(st.missing === 'mean' ? 'geo.missingMean' : 'geo.missing', { f: miss.join(', ') });
  return esc(s);
}

/** One-line state of each step, shown in its header so a closed step still tells what it holds (V25). */
function renderGeoSummaries() {
  const g = S.geo, st = g.settings, L = geoLayer(st.target);
  const set = (id, txt) => { const el = $(id); if (el) { el.textContent = txt; el.title = txt; } };
  set('geoSum1', t('home.cores', { n: S.cores.length }));
  set('geoSum2', `${t('gx.nVars', { n: st.features.length })} · ${t(st.axis === 'age' ? 'log.age' : 'log.depth')} ${fmt(st.step, 3)}`);
  set('geoSum3', `${t('gx.nLayers', { n: g.layers.length })} · ${t('gx.nIvs', { n: g.intervals.filter((q) => !q.auto).length })}`);
  set('geoSum4', t('cl.nClf', { n: g.classifiers.length }));
  const c = curClf(), ts = $('geoTrainState'); if (ts) ts.textContent = c ? `${c.name}: ${clfState(c).txt}` : t('cl.empty');
}
function renderGeoPanel() {
  const g = S.geo, st = g.settings, vars = allNumericVars();
  if (!geoLayer(g.activeLayer)) g.activeLayer = g.layers[0]?.id;
  const L = geoLayer(g.activeLayer);
  if (L && !L.cats.some((c) => c.id === g.activeCat)) g.activeCat = L.cats[0]?.id;
  // V25: compact table of cores (name · lat · lon · variables/intervals), full details on hover
  $('geoCores').innerHTML = S.cores.length ? `<table class="gctab"><thead><tr><th>${t('geo.core')}</th><th>Lat</th><th>Lon</th><th title="${esc(t('gx.tip.vi'))}">${t('gx.vi')}</th><th></th></tr></thead><tbody>${S.cores.map((c) => {
    const ni = g.intervals.filter((q) => q.core === c.id).length, nv = Object.keys(c.proxies || {}).length, note = geoCoreNote(c), bad = (!c.age && !c.ageText) || st.features.some((k) => !(featureSeries(c, k, g.ratios) || []).some((v) => v != null));
    return `<tr class="gcore ${c.id === g.view.core ? 'current' : ''}" data-id="${c.id}"><td><button class="gcname" data-tip="${note}">${esc(c.name)}</button></td>
      <td><input type="number" step="any" data-k="lat" value="${c.lat ?? ''}" aria-label="lat ${esc(c.name)}"></td><td><input type="number" step="any" data-k="lon" value="${c.lon ?? ''}" aria-label="lon ${esc(c.name)}"></td>
      <td><span class="gcn ${bad ? 'warn' : ''}" data-tip="${note}">${nv} · ${ni}</span></td><td><button class="btn small ghost" data-act="del" data-tip="${esc(t('gx.tip.coreDlg'))}" aria-label="${esc(t('gx.tip.coreDlg'))}">✎</button></td></tr>`;
  }).join('')}</tbody></table>` : `<p class="note">${t('geo.noCores')}</p>`;
  renderGeoSummaries();
  $('geoMissing').value = st.missing || 'drop';
  $('geoAxis').value = st.axis; $('geoStep').value = st.step; $('geoScaling').value = st.scaling; $('geoMaxGap').value = st.maxGap ?? '';
  $('geoFeats').innerHTML = vars.map((k) => `<div class="row srow"><label class="chk"><input type="checkbox" data-feat="${esc(k)}" ${st.features.includes(k) ? 'checked' : ''}><span>${esc(k)}</span></label><label class="chk note"><input type="checkbox" data-log="${esc(k)}" ${st.logs.includes(k) ? 'checked' : ''}>log</label></div>`).join('') || `<p class="note">—</p>`;
  const opts = vars.map((k) => `<option>${esc(k)}</option>`).join('');
  $('geoRatioA').innerHTML = opts; $('geoRatioB').innerHTML = opts;
  // layers
  const tree = layerTree();
  { const id = 'band:fam:' + g.activeLayer, hidden = (S.geo.view.style?.colHide || []).includes(id);   // V0.33: family visible in the charts
    $('geoLayerShow').checked = !hidden; }
  $('geoLayerSel').innerHTML = tree.map(({ layer, depth }) => `<option value="${layer.id}" ${layer.id === g.activeLayer ? 'selected' : ''}>${'  '.repeat(depth)}${depth ? '↳ ' : ''}${esc(layer.name)}</option>`).join('');
  $('geoLayerName').value = L?.name || '';
  $('geoLayerParent').innerHTML = `<option value="">${t('geo.noParent')}</option>` + g.layers.filter((l) => L && l.id !== L.id && !isDescendant(l.id, L.id)).map((l) => `<option value="${l.id}" ${l.id === L?.parent ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  $('geoLabels').innerHTML = (L?.cats || []).map((c) => `<li data-id="${c.id}" class="${c.id === g.activeCat ? 'active' : ''}"><span></span><input type="color" value="${c.color}"><input class="name" type="text" value="${esc(c.name)}"><span class="cnt" title="${esc(t('gx.tip.catCount'))}">${g.intervals.filter((q) => q.cat === c.id).length}</span><button class="del" title="${esc(t('gx.delCat'))}" aria-label="${esc(t('gx.delCat'))}">✕</button></li>`).join('');
  const lopts = (sel) => (L?.cats || []).map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const names = geoRT.featNames.length ? geoRT.featNames : st.features;
  const fopts = (sel) => names.map((k) => `<option ${k === sel ? 'selected' : ''}>${esc(k)}</option>`).join('');
  const rules = g.rules.map((r, ri) => [r, ri]).filter(([r]) => r.layer === g.activeLayer);
  $('geoRules').innerHTML = rules.map(([r, ri]) => `<div class="rec rule" data-r="${ri}">
      <div class="row" style="flex-wrap:nowrap"><label class="chk"><input type="checkbox" data-k="enabled" ${r.enabled !== false ? 'checked' : ''}></label><select data-k="cat">${lopts(r.cat)}</select><button class="btn small ghost" data-act="delrule">✕</button></div>
      ${r.conds.map((c, ci) => `<div class="row cond" data-c="${ci}" style="flex-wrap:nowrap"><select data-k="feature">${fopts(c.feature)}</select><select data-k="op">${['z>', 'z<', '>', '<'].map((o) => `<option ${o === c.op ? 'selected' : ''}>${o}</option>`).join('')}</select><input type="number" step="any" data-k="value" value="${c.value}"><button class="btn small ghost" data-act="delcond">✕</button></div>`).join('')}
      <button class="btn small" data-act="addcond">${t('geo.addCond')}</button></div>`).join('') || `<p class="note">${t('geo.noRules')}</p>`;
  $('geoUseRules').checked = st.useRules;
  renderClassifiers();
}

/* ── V26: list of classifiers (step 4) ── */
const CLF_METHODS = ['rf', 'mlp', 'knn', 'nb', 'kmeans'];
function clfState(c) {
  const run = geoRT.runs.get(c.id);
  if (!run) return { cls: '', txt: c.trained ? t('cl.retrainNeeded') : t('gx.untrained') };
  if (run.error) return { cls: 'warn', txt: t(run.error) };
  if (run.outdated) return { cls: 'warn', txt: t('cl.changed') };
  const rs = [...run.byTarget.values()];
  if (rs.some((r) => r.stale)) return { cls: 'warn', txt: t('cl.stale') };
  const acc = rs.map((r) => r.cv?.balancedAccuracy).filter((v) => v != null);
  if (rs.every((r) => r.error)) return { cls: 'warn', txt: t('cl.needLabels') };
  return { cls: 'ok', txt: acc.length ? t('cl.acc', { a: fmt((100 * acc.reduce((x, y) => x + y, 0)) / acc.length, 0) }) : t('gx.trained', { m: t('geo.m.name.' + c.method) }) };
}
function renderClassifiers() {
  const g = S.geo, cur = curClf(), fams = layerTree().map((x) => x.layer), vars = g.settings.features;
  const wasOpen = [...$('clfList').querySelectorAll('.clf.sel details')].map((d) => d.open), wasId = $('clfList').querySelector('.clf.sel')?.dataset.id;
  const nDesc = (lid) => g.intervals.filter((q) => q.layer === lid && !q.auto).length;
  $('clfList').innerHTML = g.classifiers.map((c) => {
    const sel = c === cur, stt = clfState(c);
    let html = `<section class="clf ${sel ? 'sel' : ''}" data-id="${c.id}"><header data-c="sel" title="${esc(t('cl.tip.sel'))}"><b>⚙ ${esc(c.name || t('cl.unnamed'))}</b><span class="clfstate ${stt.cls}">${esc(stt.txt)}</span></header>`;
    if (!sel) return html + '</section>';
    const fv = c.features ?? vars, inFams = fams.filter((l) => !c.targets.includes(l.id)), fl = c.layers ?? featLayers().map((l) => l.id);
    const p = { ...METHODS[c.method].defaults, ...(c.params?.[c.method] || {}) };
    const params = GEO_PARAMS[c.method].map(([k, type, a, b, step]) => {
      const lab = `${c.method}.${k}`, name = t(lab) === lab ? k : t(lab), help = t(`geo.p.${c.method}.${k}`), tip = help === `geo.p.${c.method}.${k}` ? '' : ` title="${esc(help)}"`;
      if (type === 'bool') return `<label class="chk"${tip}><input type="checkbox" data-p="${k}" ${p[k] ? 'checked' : ''}><span>${esc(name)}</span></label>`;
      if (type === 'select') return `<label class="f"${tip}><span>${esc(name)}</span><select data-p="${k}">${a.map((o) => `<option ${String(o) === String(p[k]) ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
      return `<label class="f"${tip}><span>${esc(name)}</span><input type="number" data-p="${k}" min="${a}" max="${b}" step="${step}" value="${p[k]}"></label>`;
    }).join('');
    const run = geoRT.runs.get(c.id);
    const res = c.targets.map((lid) => { const r = run?.byTarget.get(lid), L = geoLayer(lid); if (!L) return ''; const cv = r?.cv;
      return `<div>${esc(L.name)}: ${r?.error ? `<span class="warn">${t(r.error)}</span>` : cv ? t('cl.res', { a: fmt(cv.balancedAccuracy * 100, 0), n: cv.total, k: cv.classes.length }) : r?.model ? t('gx.trained', { m: '' }) : t('gx.untrained')}</div>`; }).join('');
    html += `<div class="clfbody">
      <label class="f"><span>${t('cl.name')}</span><input type="text" data-c="name" value="${esc(c.name)}"></label>
      <div class="f" title="${esc(t('cl.tip.targets'))}"><span>${t('cl.targets')}</span><div class="chips">${fams.map((l) => `<label><input type="checkbox" data-c="target" value="${l.id}" ${c.targets.includes(l.id) ? 'checked' : ''}>${esc(l.name)} <span class="note">${nDesc(l.id)}</span></label>`).join('') || `<span class="note">${t('cl.noFams')}</span>`}</div></div>
      <div class="f" title="${esc(t('cl.tip.inputs'))}"><span>${t('cl.inputs')}</span>
        <details><summary>${t('cl.inVars', { n: fv.filter((k) => vars.includes(k)).length, m: vars.length })}</summary><div class="row"><button class="btn small ghost" data-c="vall">${t('cl.all')}</button><button class="btn small ghost" data-c="vnone">${t('cl.none2')}</button></div>
          <div class="chk2">${vars.map((k) => `<label class="chk"><input type="checkbox" data-c="feat" value="${esc(k)}" ${fv.includes(k) ? 'checked' : ''}><span>${esc(k)}</span></label>`).join('') || `<span class="note">${t('cl.noVars')}</span>`}</div></details>
        <details><summary>${t('cl.inFams', { n: inFams.filter((l) => fl.includes(l.id)).length })}</summary><div class="chk2">${inFams.map((l) => `<label class="chk"><input type="checkbox" data-c="lay" value="${l.id}" ${fl.includes(l.id) ? 'checked' : ''}><span>${esc(l.name)}</span></label>`).join('') || `<span class="note">${t('cl.noOtherFams')}</span>`}</div><p class="note">${t('cl.famsNote')}</p></details></div>
      <div class="f"><span>${t('cl.model')}</span><div class="clfmodels">${CLF_METHODS.map((m) => `<label title="${esc(t('geo.m.' + m))}"><input type="radio" name="clfm-${c.id}" data-c="method" value="${m}" ${m === c.method ? 'checked' : ''}><span><b>${t('geo.m.name.' + m)}</b><span class="note">${t('cl.m.' + m)}</span></span></label>`).join('')}</div></div>
      <details><summary>${t('cl.advanced')}</summary><div class="gparams">${params}
        ${c.method === 'kmeans' ? '' : `<label class="f" title="${esc(t('gx.tip.minProb'))}"><span>${t('geo.minProb')}</span><input type="number" data-c="minProb" min="0" max="1" step="0.05" value="${c.minProb}"></label>`}
        <label class="f" title="${esc(t('gx.tip.seed'))}"><span>${t('geo.seed')}</span><input type="number" data-c="seed" step="1" value="${c.seed}"></label>
        <label class="chk" title="${esc(t('gx.tip.rules'))}"><input type="checkbox" data-c="useRules" ${c.useRules !== false ? 'checked' : ''}><span>${t('geo.useRules')}</span></label>
        <button class="btn small" data-c="defaults" title="${esc(t('gx.tip.suggest'))}">${t('cl.defaults')}</button></div></details>
      <div class="clfres">${res}</div>
      <div class="row"><button class="btn small primary" data-c="train" title="${esc(t('gx.tip.train'))}">${t('cl.train')}</button><button class="btn small" data-c="results">${t('cl.results')}</button><button class="btn small ghost" data-c="del">${t('proj.del')}</button></div>
    </div></section>`;
    return html;
  }).join('') || `<p class="note">${t('cl.empty')}</p>`;
  if (wasId && wasId === cur?.id) $('clfList').querySelectorAll('.clf.sel details').forEach((d, i) => { if (wasOpen[i]) d.open = true; });
}
function newClassifier(base = null) {
  const g = S.geo, n = g.classifiers.length + 1;
  const c = base ? { ...JSON.parse(JSON.stringify(base)), id: 'c' + uid(), name: t('cl.copyOf', { n: base.name }), trained: null }
    : { ...classifierDefaults(), name: t('cl.default', { n }), targets: [featLayers()[0]?.id || g.layers[0]?.id].filter(Boolean) };
  g.classifiers.push(c); g.view.clf = c.id; g.clfCleared = false; markDirty(); renderGeoPanel(); renderGeo();
}
$('clfAdd').addEventListener('click', () => newClassifier());
$('clfDup').addEventListener('click', () => { const c = curClf(); if (c) newClassifier(c); });
const clfOutdated = (c) => { const r = geoRT.runs.get(c.id); if (r) r.outdated = true; };
$('clfList').addEventListener('click', (e) => {
  const sec = e.target.closest('.clf'); if (!sec) return;
  const g = S.geo, c = g.classifiers.find((x) => x.id === sec.dataset.id), b = e.target.closest('[data-c]'); if (!c || !b) return;
  const act = b.dataset.c;
  if (act === 'sel') { g.view.clf = c.id; g.view.clfTarget = null; syncCurrent(); renderGeoPanel(); renderGeo(); return; }
  if (act === 'train') { geoTrain(false, c.id); return; }
  if (act === 'results') { g.view.clf = c.id; g.view.tab = 'model'; syncCurrent(); renderGeo(); return; }
  if (act === 'del') { if (!armed(b, t('cl.delConfirm'))) return; g.classifiers = g.classifiers.filter((x) => x !== c); geoRT.runs.delete(c.id); if (!g.classifiers.length) g.clfCleared = true; syncCurrent(); markDirty(); renderGeoPanel(); renderGeo(); return; }
  if (act === 'vall') c.features = null; else if (act === 'vnone') c.features = [];
  else if (act === 'defaults') { c.params[c.method] = {}; c.minProb = 0.5; }
  else return;
  clfOutdated(c); markDirty(); renderClassifiers();
});
$('clfList').addEventListener('change', (e) => {
  const sec = e.target.closest('.clf'); if (!sec) return;
  const g = S.geo, c = g.classifiers.find((x) => x.id === sec.dataset.id), el = e.target; if (!c) return;
  const k = el.dataset.c, vars = g.settings.features;
  if (k === 'name') c.name = el.value.trim() || c.name;
  else if (k === 'target') { c.targets = el.checked ? [...new Set([...c.targets, el.value])] : c.targets.filter((x) => x !== el.value); if (c.layers) c.layers = c.layers.filter((x) => !c.targets.includes(x)); }
  else if (k === 'feat') { const cur = new Set(c.features ?? vars); if (el.checked) cur.add(el.value); else cur.delete(el.value); c.features = vars.filter((v) => cur.has(v)); if (c.features.length === vars.length) c.features = null; }
  else if (k === 'lay') { const cur = new Set(c.layers ?? featLayers().map((l) => l.id)); if (el.checked) cur.add(el.value); else cur.delete(el.value); c.layers = [...cur]; }
  else if (k === 'method') c.method = el.value;
  else if (k === 'minProb') c.minProb = Math.max(0, Math.min(1, +el.value || 0));
  else if (k === 'seed') c.seed = Math.round(+el.value) || 0;
  else if (k === 'useRules') c.useRules = el.checked;
  else if (el.dataset.p) { const pk = el.dataset.p; (c.params[c.method] ||= {})[pk] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? (isNaN(+el.value) || pk === 'hidden' ? el.value : +el.value) : +el.value; }
  else return;
  if (k === 'minProb') { predictRun(c); syncCurrent(); renderGeo(); } else clfOutdated(c);
  markDirty(); renderClassifiers(); if (k === 'name' || k === 'target') renderGeo();
});

$('geoPanel').addEventListener('change', (e) => {
  const el = e.target, g = S.geo, st = g.settings, L = geoLayer(g.activeLayer);
  if (el.closest('#clfList')) return;   // classifiers have their own handler
  if (el.dataset.feat != null) { const k = el.dataset.feat; st.features = el.checked ? [...new Set([...st.features, k])] : st.features.filter((x) => x !== k); }
  else if (el.dataset.log != null) { const k = el.dataset.log; st.logs = el.checked ? [...new Set([...st.logs, k])] : st.logs.filter((x) => x !== k); }
  else if (el.id === 'geoAxis') st.axis = el.value;
  else if (el.id === 'geoStep') st.step = Math.max(1e-6, +el.value || 1);
  else if (el.id === 'geoScaling') st.scaling = el.value;
  else if (el.id === 'geoMissing') st.missing = el.value;
  else if (el.id === 'geoMaxGap') st.maxGap = el.value === '' ? null : +el.value;
  else if (el.id === 'geoUseRules') st.useRules = el.checked;
  else if (el.id === 'geoLayerSel') { g.activeLayer = el.value; renderGeoPanel(); scheduleGeo(); return; }
  else if (el.id === 'geoLayerName') { if (L && el.value.trim()) L.name = el.value.trim(); }
  else if (el.id === 'geoLayerParent') { if (L) L.parent = el.value || null; }
  else if (el.closest('.gcore')) { const c = geoCore(el.closest('.gcore').dataset.id); if (c) c[el.dataset.k] = el.value === '' ? null : +el.value; }
  else if (el.closest('#geoLabels')) {
    const c = L?.cats.find((x) => x.id === el.closest('li').dataset.id);
    if (c) { if (el.type === 'color') c.color = el.value; else c.name = el.value; }
  } else if (el.closest('.rule')) {
    const r = g.rules[+el.closest('.rule').dataset.r], cEl = el.closest('.cond');
    if (cEl) { const c = r.conds[+cEl.dataset.c]; c[el.dataset.k] = el.dataset.k === 'value' ? +el.value : el.value; }
    else if (el.dataset.k === 'enabled') r.enabled = el.checked; else if (el.dataset.k === 'cat') r.cat = el.value;
  } else return;
  geoMarkDirty(); renderGeoPanel(); scheduleGeo();
});
$('geoPanel').addEventListener('click', (e) => {
  const b = e.target.closest('button'), g = S.geo; if (!b) return;
  if (b.dataset.act === 'del') { const c = geoCore(b.closest('.gcore').dataset.id); if (c) openCoreDlg(c); return; }
  else if (b.classList.contains('del') && b.closest('#geoLabels')) {
    const id = b.closest('li').dataset.id, L = geoLayer(g.activeLayer), n = g.intervals.filter((q) => q.cat === id).length;
    if (n && !armed(b, t('gx.delCatN', { n }))) return;
    if (g.activeCat === id) g.activeCat = L.cats.find((c) => c.id !== id)?.id;
    L.cats = L.cats.filter((c) => c.id !== id); g.intervals = g.intervals.filter((q) => q.cat !== id); g.rules = g.rules.filter((r) => r.cat !== id);
  } else if (b.dataset.act === 'delrule') g.rules.splice(+b.closest('.rule').dataset.r, 1);
  else if (b.dataset.act === 'addcond') g.rules[+b.closest('.rule').dataset.r].conds.push({ feature: (geoRT.featNames[0] || g.settings.features[0]), op: 'z>', value: 1 });
  else if (b.dataset.act === 'delcond') g.rules[+b.closest('.rule').dataset.r].conds.splice(+b.closest('.cond').dataset.c, 1);
  else return;
  geoMarkDirty(); renderGeoPanel(); scheduleGeo();
});
$('geoCores').addEventListener('click', (e) => { const el = e.target.closest('.gcore'); if (el && !e.target.closest('input, button:not(.gcname)')) { S.geo.view.core = el.dataset.id; S.geo.view.tab = 'logs'; renderGeo(); } });
$('geoLabels').addEventListener('click', (e) => { const li = e.target.closest('li'); if (li && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') { S.geo.activeCat = li.dataset.id; renderGeoPanel(); renderGeoMarkHint(); } });
function addCat(layer, name) {
  const c = { id: 'k' + uid(), name, color: GROUP_COLORS[(S.geo.layers.reduce((n, l) => n + l.cats.length, 0)) % GROUP_COLORS.length] };
  layer.cats.push(c); return c;
}
function addLayer(name, parent = null) { const l = { id: 'L' + uid(), name, parent, cats: [] }; S.geo.layers.push(l); return l; }
$('geoAddLabel').addEventListener('click', () => {
  const name = $('geoNewLabel').value.trim(), L = geoLayer(S.geo.activeLayer); if (!name || !L) return;
  S.geo.activeCat = addCat(L, name).id; $('geoNewLabel').value = ''; geoMarkDirty(); renderGeoPanel(); renderGeoMarkHint();
});
$('geoAddLayer').addEventListener('click', () => {
  const name = $('geoNewLayer').value.trim(); if (!name) return;
  const l = addLayer(name, $('geoNewLayerChild').checked ? S.geo.activeLayer : null);
  S.geo.activeLayer = l.id; $('geoNewLayer').value = ''; geoMarkDirty(); renderGeoPanel(); renderGeoMarkHint();
});
$('geoLayerDel').addEventListener('click', (e) => {
  const g = S.geo, L = geoLayer(g.activeLayer); if (!L || g.layers.length < 2) return;
  if (!armed(e.currentTarget, t('confirm.layerDel', { n: g.intervals.filter((q) => q.layer === L.id).length }))) return;
  for (const l of g.layers) if (l.parent === L.id) l.parent = L.parent;
  g.layers = g.layers.filter((l) => l !== L); g.intervals = g.intervals.filter((q) => q.layer !== L.id); g.rules = g.rules.filter((r) => r.layer !== L.id);
  g.activeLayer = g.layers[0].id; geoMarkDirty(); renderGeo();
});
$('geoAddRule').addEventListener('click', () => { const g = S.geo; if (!geoLayer(g.activeLayer)?.cats.length) return; g.rules.push({ id: uid(), layer: g.activeLayer, cat: g.activeCat, enabled: true, conds: [{ feature: geoRT.featNames[0] || g.settings.features[0] || allNumericVars()[0], op: 'z>', value: 1 }] }); geoMarkDirty(); renderGeoPanel(); });
$('geoAddRatio').addEventListener('click', () => { const a = $('geoRatioA').value, b = $('geoRatioB').value; if (a && b && a !== b && !S.geo.ratios.some((r) => r.a === a && r.b === b)) { S.geo.ratios.push({ a, b }); geoMarkDirty(); renderGeoPanel(); } });
$('geoTrainBtn').addEventListener('click', () => geoTrain());
$('geoDemo').addEventListener('click', () => busy(loadGeoDemo));

/** Store a core read from a table as imported data of a project core (merging with a core of the same name). */
function addImported(c, source, id = null) {
  const imp = { depth: c.depth, age: c.age, proxies: c.proxies };
  let core = S.cores.find((o) => (id && o.id === id) || norm(o.name) === norm(c.name));
  if (core) {
    if (core.imp && core.imp.depth && imp.depth && core.imp.depth.length === imp.depth.length && core.imp.depth.every((d, i) => d === imp.depth[i])) core.imp.proxies = { ...core.imp.proxies, ...imp.proxies };
    else if (core.imp) { // different depths: keep both as one table on the union of rows
      const rows = [...(core.imp.depth || []).map((d, i) => ({ d, a: core.imp.age?.[i], v: core.imp.proxies, i })), ...(imp.depth || []).map((d, i) => ({ d, a: imp.age?.[i], v: imp.proxies, i }))].sort((x, y) => x.d - y.d);
      const names = [...new Set([...Object.keys(core.imp.proxies), ...Object.keys(imp.proxies)])], P = {};
      for (const n of names) P[n] = rows.map((r) => r.v[n]?.[r.i] ?? null);
      core.imp = { depth: rows.map((r) => r.d), age: rows.some((r) => r.a != null) ? rows.map((r) => r.a ?? null) : null, proxies: P };
    } else core.imp = imp;
    if (c.lat != null) core.lat = c.lat; if (c.lon != null) core.lon = c.lon;
  } else { core = makeCore({ id: id || undefined, name: c.name, lat: c.lat, lon: c.lon, source, imp, units: c.units, age: { text: c.ageText || '' } }); S.cores.push(core); }
  if (c.ageText) { core.ageModel.text = c.ageText; core.ageModel.model = parseAgeModel(c.ageText); }
  if (c.units) core.units = c.units;
  core.source ||= source;
  refreshCoreData(core);
  return core;
}

/* ── import: numeric records ── */
let geoPending = null;
const IMP_IDS = ['giCore', 'giLat', 'giLon', 'giDepth', 'giAge', 'giWd', 'giFrom', 'giTo', 'giLayer'];
function openGeoImport(kind, tabs, names) {
  const tab = tabs[0], H = tab.headers, guess = (re) => H.findIndex((h) => re.test(h));
  geoPending = { kind, tabs, names };
  const sel = (id, i) => { $(id).innerHTML = `<option value="-1">—</option>` + H.map((h, k) => `<option value="${k}" ${k === i ? 'selected' : ''}>${esc(h)}</option>`).join(''); };
  sel('giCore', guess(/^(core|sondeo|site|hole|station|name|id)/i)); sel('giLat', guess(/lat/i)); sel('giLon', guess(/lon|long/i));
  sel('giDepth', guess(/depth|prof|mbsf|csf|mcd/i)); sel('giAge', guess(/age|edad|\bka\b|cal/i)); sel('giWd', guess(/water|agua|wd/i));
  sel('giFrom', guess(/top|techo|from|desde|inicio|start/i)); sel('giTo', guess(/bot|base|muro|to$|hasta|fin|end/i)); sel('giLayer', guess(/^(layer|capa|tipo|type)$/i));
  const iv = kind === 'intervals';
  for (const [id, show] of [['giCoreRow', kind !== 'core'], ['giLatLonRow', !iv], ['giDepthRow', kind === 'long' || kind === 'core'], ['giWdRow', kind === 'catalogue'],
    ['giProxRow', kind === 'long' || kind === 'core'], ['giIvRow', iv], ['giValRow', iv], ['giDefRow', iv]]) $(id).hidden = !show;
  $('giDefCore').innerHTML = S.cores.map((c) => `<option value="${c.id}" ${c.id === S.geo.view.core ? 'selected' : ''}>${esc(c.name)}</option>`).join('') + `<option value="__file">${t('geo.r.byFile')}</option>`;
  const fill = () => {
    const used = IMP_IDS.filter((id) => !$(id).closest('[hidden]')).map((id) => +$(id).value);
    if (iv) {
      $('giVals').innerHTML = H.map((h, k) => used.includes(k) ? '' : `<label class="chk"><input type="checkbox" value="${k}" ${tab.rows.every((r) => r[k] == null) && tab.text.some((r) => String(r[k] ?? '').trim()) ? 'checked' : ''}><span>${esc(h)}</span></label>`).join('');
      $('giValNote').textContent = +$('giLayer').value >= 0 ? t('geo.r.valLong') : t('geo.r.valWide');
    } else $('giProx').innerHTML = H.map((h, k) => used.includes(k) ? '' : `<label class="chk"><input type="checkbox" value="${k}" ${tab.rows.some((r) => r[k] != null) ? 'checked' : 'disabled'}><span>${esc(h)}</span></label>`).join('');
  };
  IMP_IDS.forEach((id) => ($(id).onchange = fill)); fill();
  $('giTitle').textContent = t('geo.imp.' + kind) + (names.length > 1 ? ` (${names.length})` : '');
  $('giNote').textContent = t(iv ? 'geo.r.noteIv' : 'geo.r.note');
  $('geoImpDlg').showModal();
}
/** V0.38: table file (CSV/TXT as UTF-8 or Windows-1252, or Excel/ODS); warns about text cells read as empty. */
async function readTableFile(f) {
  let tab;
  if (/\.xlsx?$|\.ods$/i.test(f.name)) {
    if (!window.XLSX) await loadLib('xlsx.full.min.js');
    const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' });
    tab = parseTable(window.XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: '\t' }));
  } else tab = parseTable(decodeText(await f.arrayBuffer()));
  if (tab.dropped || tab.short) toast(`«${f.name}»: ` + [tab.dropped ? t('imp.dropped', { n: tab.dropped, c: tab.droppedCols.slice(0, 4).join(', ') }) : '', tab.short ? t('imp.short', { r: tab.short }) : ''].filter(Boolean).join('; ') + '.', 8000);
  return tab;
}
for (const [id, kind] of [['giFileLong', 'long'], ['giFileCore', 'core'], ['giFileCat', 'catalogue'], ['giFileIv', 'intervals']]) {
  $(id).addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
    try { const tabs = await Promise.all(files.map(readTableFile)); openGeoImport(kind, tabs, files.map((f) => f.name.replace(/\.[^.]+$/, ''))); }
    catch (err) { toast(t('rec.err', { m: err.message || err })); }
  });
}
$('giCancel').addEventListener('click', () => $('geoImpDlg').close());
const norm = (s) => String(s ?? '').trim().toLowerCase();
function findOrAddCore(name) {
  let c = S.cores.find((k) => norm(k.name) === norm(name));
  if (!c) { c = makeCore({ name, source: 'import' }); S.cores.push(c); renderCoreBar(); }
  return c;
}
/** Add intervals given by names (core, layer, value); creates missing cores, layers and categories. */
function addNamedIntervals(recs, axis) {
  const g = S.geo, newLayers = new Set();
  for (const r of recs) {
    let L = g.layers.find((l) => norm(l.name) === norm(r.layer));
    if (!L) { L = addLayer(r.layer); newLayers.add(L.id); }
    const cat = L.cats.find((c) => norm(c.name) === norm(r.value)) || addCat(L, r.value), core = findOrAddCore(r.core).id;
    const dup = g.intervals.some((q) => q.core === core && q.layer === L.id && q.axis === axis && q.cat === cat.id && Math.abs(q.from - r.from) < 1e-9 && Math.abs(q.to - r.to) < 1e-9);
    if (!dup) g.intervals.push({ id: uid(), core, layer: L.id, axis, from: r.from, to: r.to, cat: cat.id });
  }
  tidyGeo(null);   // V0.34: imported intervals follow the same rule
  return newLayers.size;
}
$('giOk').addEventListener('click', () => {
  const p = geoPending; if (!p) return;
  const v = (id) => +$(id).value, H0 = p.tabs[0].headers, g = S.geo;
  if (p.kind === 'catalogue') {
    const n = applyCatalogue(S.cores, p.tabs[0], { core: v('giCore'), lat: v('giLat'), lon: v('giLon'), wd: v('giWd') });
    toast(t('geo.catApplied', { n }));
  } else if (p.kind === 'intervals') {
    const vals = [...$('giVals').querySelectorAll('input:checked')].map((i) => H0[+i.value]);
    let recs = [];
    p.tabs.forEach((tab, k) => {
      const ix = (name) => tab.headers.indexOf(name), def = $('giDefCore').value;
      const coreName = def === '__file' ? p.names[k] : geoCore(def)?.name || p.names[k];
      recs = recs.concat(intervalsFromTable(tab, { core: v('giCore') >= 0 ? ix(H0[v('giCore')]) : -1, from: ix(H0[v('giFrom')]), to: ix(H0[v('giTo')]), layer: v('giLayer') >= 0 ? ix(H0[v('giLayer')]) : -1, values: vals.map(ix).filter((i) => i >= 0) }, coreName));
    });
    if (!recs.length) { toast(t('geo.r.noIv')); return; }
    const nl = addNamedIntervals(recs, $('giIvAxis').value);
    geoComputeSamples();
    toast(t('geo.ivImported', { n: recs.length, l: nl, o: geoRT.orphans.size }));
  } else {
    const prox = [...$('giProx').querySelectorAll('input:checked')].map((i) => H0[+i.value]);
    let added = [];
    p.tabs.forEach((tab, k) => {
      const ix = (name) => tab.headers.indexOf(name);
      const roles = { core: v('giCore') >= 0 ? ix(H0[v('giCore')]) : -1, lat: v('giLat') >= 0 ? ix(H0[v('giLat')]) : -1, lon: v('giLon') >= 0 ? ix(H0[v('giLon')]) : -1, depth: ix(H0[v('giDepth')] ?? '\0'), age: ix(H0[v('giAge')] ?? '\0'), proxies: prox.map(ix).filter((i) => i >= 0) };
      if (roles.depth < 0 && roles.age < 0) return;
      added = added.concat(p.kind === 'long' ? coresFromLongTable(tab, roles) : [coreFromRows(p.names[k], tab.rows, tab.headers, roles)]);
    });
    for (const c of added) addImported(c, 'import');
    renderCoreBar();
    toast(t('geo.imported', { n: added.length }));
  }
  if (!g.view.core && S.cores.length) g.view.core = S.cores[0].id;
  $('geoImpDlg').close(); geoMarkDirty(); renderGeo();
});

async function loadGeoDemo() {
  const tab = parseTable(await (await fetchAsset('geochem_demo/demo_long.csv')).text());
  const H = tab.headers, ix = (n) => H.indexOf(n), P = ['Ti/Al', 'Zr/Rb', 'Ba/Al', 'Mn/Al', 'Ca_pct', 'TOC_pct'];
  const g = S.geo, cores = coresFromLongTable(tab, { core: ix('core'), lat: ix('lat'), lon: ix('lon'), depth: ix('depth_m'), age: ix('age_ka'), proxies: P.map(ix) });
  S.cores = S.cores.filter((c) => c.source !== 'demo');
  for (const c of cores) addImported(c, 'demo', 'demo-' + c.name);
  renderCoreBar();
  g.intervals = g.intervals.filter((q) => !String(q.core).startsWith('demo-'));
  // Described intervals (lithology with nested turbidites), as a user would import them.
  const it = parseTable(await (await fetchAsset('geochem_demo/intervals.csv')).text()), jx = (n) => it.headers.indexOf(n);
  addNamedIntervals(intervalsFromTable(it, { core: jx('core'), from: jx('top_m'), to: jx('bottom_m'), layer: -1, values: [jx('Litologia'), jx('Turbidita')] }), 'depth');
  const lit = g.layers.find((l) => l.name === 'Litologia'), tb = g.layers.find((l) => l.name === 'Turbidita');
  if (lit && tb) tb.parent = lit.id;
  const st = g.settings; st.features = P; st.logs = P; st.axis = 'age'; st.step = 0.5; st.target = 'events'; st.useLayers = null;
  // Example expert labels (two cores per event, so leave-one-core-out always has each class) and one example rule.
  const want = { 'DEMO-02': ['detrital_input', 'detrital'], 'DEMO-12': ['detrital_input', 'detrital'], 'DEMO-09': ['low_oxygenation', 'lowox'], 'DEMO-14': ['low_oxygenation', 'lowox'], 'DEMO-01': ['strong_bottom_current', 'current'], 'DEMO-04': ['strong_bottom_current', 'current'] };
  const ev = geoLayer('events') || (g.layers.unshift(defaultGeo().layers[0]), g.layers[0]);
  const has = (id) => ev.cats.some((c) => c.id === id);
  const evIv = [];
  tab.text.forEach((r) => {
    const w = want[r[ix('core')]]; if (!w) return;
    const e = r[ix('event_true')], a = +r[ix('age_ka')];
    const cat = e === w[0] ? w[1] : e === 'background' ? 'background' : null;
    if (cat && has(cat)) evIv.push({ id: uid(), core: 'demo-' + r[ix('core')], layer: 'events', axis: 'age', from: a - 0.25, to: a + 0.25, cat });
  });
  g.intervals.push(...mergeIntervals(evIv)); tidyGeo(null);   // V0.34
  if (!g.rules.some((r) => r.layer === 'events')) g.rules.push({ id: uid(), layer: 'events', cat: 'lowox', enabled: true, conds: [{ feature: 'Ba/Al', op: 'z>', value: 1.5 }, { feature: 'Mn/Al', op: 'z<', value: -0.5 }] });
  g.view.core = 'demo-DEMO-09'; g.map = { ...g.map, a0: 6, a1: 10, mode: 'class' };
  geoMarkDirty(); geoTrain();
}

/** Join touching intervals of the same core, layer and category (keeps the list short). */
function mergeIntervals(list) {
  const out = [], key = (q) => `${q.core}|${q.layer}|${q.axis}|${q.cat}|${q.auto ? 1 : 0}`;
  for (const q of [...list].sort((a, b) => key(a).localeCompare(key(b)) || a.from - b.from)) {
    const p = out[out.length - 1];
    if (p && key(p) === key(q) && q.from <= p.to + 1e-9) p.to = Math.max(p.to, q.to); else out.push({ ...q });
  }
  return out;
}

/* ── centre: logs, map, model ── */
let geoTimer = 0, geoLast = null, geoDrag = null;
function scheduleGeo(ms = 150) { if (mode !== 'geo') return; clearTimeout(geoTimer); geoTimer = setTimeout(renderGeo, ms); }
function renderGeo() {
  if (mode !== 'geo') return;
  if (geoRT.dirty) geoComputeSamples();
  renderGeoPanel();
  document.querySelectorAll('#geoTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.geo.view.tab)));
  document.querySelectorAll('.gpane').forEach((p) => (p.hidden = p.dataset.pane !== S.geo.view.tab));
  if (S.geo.view.tab === 'logs') renderGeoLogs(); else if (S.geo.view.tab === 'map') renderGeoMap(); else renderGeoModel();
}
document.querySelectorAll('#geoTabs button').forEach((b) => b.addEventListener('click', () => { S.geo.view.tab = b.dataset.tab; renderGeo(); updateTip(); }));

/** Contiguous runs of samples of one core with the same class, as band segments. */
function segmentsFor(coreId, getLabel, axis, step, opacity) {
  const segs = []; let cur = null;
  geoRT.samples.forEach((s, i) => {
    if (s.core !== coreId) return;
    const l = getLabel(i), a = axis === S.geo.settings.axis ? s.x : axis === 'age' ? s.age : s.depth;
    const cat = geoCat(l);
    if (l == null || a == null || !cat) { cur = null; return; }
    const half = step / 2;
    if (cur && cur.label === l && Math.abs(a - half - cur.a1) < step * 0.51) cur.a1 = a + half;
    else { cur = { label: l, a0: a - half, a1: a + half, color: cat.color, opacity: opacity?.(i) }; segs.push(cur); }
  });
  return segs;
}
/** Band segments drawn straight from the intervals of one layer in one core. */
function intervalSegs(core, layerId, axis) {
  return intervalsOnAxis(S.geo.intervals.filter((q) => q.core === core.id && q.layer === layerId), axis, core)
    .map((q) => ({ label: q.cat, a0: q.from, a1: q.to, color: geoCat(q.cat)?.color || '#999', opacity: q.auto ? 0.45 : 1 }));
}
/** All bands of a core: one per interval layer (tree order) + rule labels of the target + automatic classification. */
/**
 * Columns of a core: one per family (described intervals; rule labels lighter) — empty ones too when showEmpty —
 * each followed by the automatic columns of the classifiers that target it (opacity = probability), then the core test.
 */
function coreBands(core, axis, withPred = true, showEmpty = false) {
  const g = S.geo, st = g.settings, bands = [];
  for (const { layer, depth } of layerTree()) {
    let segs = intervalSegs(core, layer.id, axis);
    const rl = geoRT.ruleLabels?.get(layer.id);
    if (rl) segs = segs.concat(segmentsFor(core.id, (i) => (rl[i]?.source === 'rule' ? rl[i].label : null), axis, st.step, () => 0.45));
    if (segs.length || showEmpty) bands.push({ title: (depth ? '↳ ' : '') + layer.name, full: layer.name, key: 'fam:' + layer.id, segs, w: 56 });
    if (!withPred) continue;
    for (const c of g.classifiers) {
      const r = geoRT.runs.get(c.id)?.byTarget.get(layer.id); if (!r?.preds?.length) continue;
      const name = `⚙ ${c.name}${c.targets.length > 1 ? ' · ' + layer.name : ''}`;
      const sg = segmentsFor(core.id, (i) => r.preds[i]?.label, axis, st.step, (i) => +(0.3 + 0.7 * (r.preds[i]?.prob ?? 1)).toFixed(2));
      if (sg.length || showEmpty) bands.push({ title: name, full: `${name} (${t('geo.m.name.' + c.method)})`, key: `auto:${c.id}:${layer.id}`, segs: sg, w: 56 });
    }
  }
  const T = geoRT.test;
  if (withPred && T?.core === core.id) {
    bands.push({ title: t('geo.bandTest'), key: 'test', segs: segmentsFor(core.id, (i) => T.preds[i]?.label, axis, st.step), w: 56 });
    const hit = segmentsFor(core.id, (i) => (T.preds[i]?.label != null && geoRT.labels[i]?.label ? (T.preds[i].label === geoRT.labels[i].label ? '__ok' : '__bad') : null), axis, st.step);
    if (hit.length) bands.push({ title: t('geo.bandHit'), key: 'hit', segs: hit, w: 46 });
  }
  return bands;
}
const bandLegendOf = (bands) => [...new Set(bands.flatMap((b) => b.segs.map((s) => s.label)))].map(geoCat).filter(Boolean).map((c) => ({ name: c.name, color: c.color, index: -1 }));

function renderGeoMarkHint() { /* V26: classes are chosen on the columns themselves */ }

export function renderGeoLogs() {
  const g = S.geo, st = g.settings, box = $('geoLogSvg');
  renderGeoMarkHint();
  $('geoCoreSel').innerHTML = S.cores.map((c) => `<option value="${c.id}" ${c.id === g.view.core ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const core = geoCore(g.view.core) || S.cores[0];
  if (!core) { box.innerHTML = `<p class="note" style="padding:20px">${t('geo.noCores')}</p>`; $('geoIntervals').innerHTML = ''; return; }
  g.view.core = core.id;
  const axis = st.axis, xs = axis === 'age' ? coreAges(core) : core.depth;
  const ivAxis = intervalsOnAxis(g.intervals.filter((q) => q.core === core.id), axis, core).flatMap((q) => [q.from, q.to]);
  const valid = [...(xs || []).filter((v) => v != null), ...ivAxis];
  if (!valid.length) { box.innerHTML = `<p class="note" style="padding:20px">${t('geo.noAxis')}</p>`; renderIntervalList(core); return; }
  const from = Math.min(...valid), to = Math.max(...valid);
  const records = xs ? st.features.map((k, j) => {
    const ser = featureSeries(core, k, g.ratios) || [];
    return { name: k, color: GROUP_COLORS[j % GROUP_COLORS.length], reverse: false, pts: xs.map((x, i) => [x, ser[i]]) };
  }).filter((r) => r.pts.some((p) => p[1] != null)) : [];
  const bands = coreBands(core, axis, true, g.view.showEmpty !== false);
  $('geoShade').checked = !!g.view.shade; $('geoShowEmpty').checked = g.view.showEmpty !== false;
  renderShadeBy();
  let shade = null, shadeLanes = 1;
  if (g.view.shade) {
    // V0.34: colour by the chosen families (their intervals), side by side or blended; none chosen = classifier target/predictions
    const by = (g.view.shadeBy || []).filter((id) => id === 'target' || geoLayer(id));
    if (!by.length || (by.length === 1 && by[0] === 'target')) {
      const T = geoRT.test?.core === core.id ? geoRT.test.preds : null;
      shade = segmentsFor(core.id, T ? (i) => T[i]?.label : geoRT.preds.length ? (i) => geoRT.preds[i]?.label : (i) => geoRT.labels[i]?.label, axis, st.step);
    } else {
      const split = g.view.shadeMode === 'split', n = by.length, fo = split ? 0.3 : Math.max(0.12, 0.34 / n);
      shade = by.flatMap((id, lane) => (id === 'target'
        ? segmentsFor(core.id, (i) => (geoRT.preds[i] || geoRT.labels[i])?.label, axis, st.step)
        : intervalSegs(core, id, axis)).map((q) => ({ ...q, lane: split ? lane : 0, fo })));
      shadeLanes = split ? n : 1;
    }
  }
  const T = geoRT.test;
  $('geoTestOut').textContent = T?.core === core.id ? t(T.n ? 'geo.testRes' : 'geo.testResNo', { s: t('geo.testScheme.' + T.scheme), p: T.n ? fmt((100 * T.ok) / T.n, 1) : '', n: T.n }) : '';
  let rows = [], image = null, images = null, tracks = { image: false, total: false, species: false, BI: false, ii: false, manual: false };
  if (core.id === S.curCore && S.sections.length && (axis === 'depth' || S.age.model)) {
    const D = compositeData();
    rows = compositeRows(D.secs.map((s) => ({ name: s.name, bins: s.bins.map((b) => ({ ...b, dTop: b.dTop * D.f(s), dBottom: b.dBottom * D.f(s), depth: b.depth * D.f(s) })) })), { axis, model: S.age.model });
    tracks = { ...tracks, image: true, total: true };
    const ims = columnImages({ ...D, axis }, from, to, 700); image = ims[0]; images = ims;   // V0.25: same panels and width as the core column
  }
  const res = buildLogSVG({
    title: core.name, subtitle: t('geo.subtitleLogs', { n: geoRT.samples.filter((s) => s.core === core.id).length, step: st.step }),
    axisLabel: axis === 'age' ? `${t('r.age')} (${S.age.units || 'ka'})` : `${t('r.depth')} (${core.units || 'm'})`,
    from, to, height: 700, rows, classes: [], tracks, image, images, imageWidth: image?.w || 64, records, boundaries: [], bands, bandLegend: bandLegendOf(bands), shade, shadeLanes,
    labels: { noData: t('log.noData'), total: t('log.total'), species: t('log.species'), image: t('log.image') },
    colWidths: (g.view.colW ||= {}), recWidth: g.view.trackW || 120, style: g.view.style || {},
  });
  syncColOrder('geo', res.columns);   // V0.33
  if (!$('geoStyleBox').open || !$('geoStyleForm').innerHTML) $('geoStyleForm').innerHTML = colOrderHTML('geo') + verticalStyleHTML(g.view.style || {}) + colorsFormHTML(g.view.style || {}, 'geo') + axesFormHTML(['total', ...records.map((r) => 'rec:' + r.name)], g.view, records.map((r) => r.name));
  box.innerHTML = res.svg;
  geoLast = { core, from, to, top: res.plotTop, height: res.plotHeight, axis, layout: res.layout, width: res.width };
  $('geoTrackW').value = g.view.trackW || 120;
  const sIdx = geoRT.samples.map((sm, i) => [sm, i]).filter(([sm]) => sm.core === core.id);
  logInteract(box, res, { clickHint: t('gx.clickHint'), from, to, axisLabel: axis === 'age' ? `${t('r.age')} (${S.age.units || 'ka'})` : `${t('r.depth')} (${core.units || 'm'})`, records, bands, widths: g.view.colW,
    onResize: () => { markDirty(); renderGeoLogs(); },
    bandText: (bkey, a) => {   // automatic columns: class and probability of the nearest sample
      if (!bkey?.startsWith('auto:')) return null;
      const [, cid, lid] = bkey.split(':'), r = geoRT.runs.get(cid)?.byTarget.get(lid); if (!r?.preds?.length) return null;
      let best = null; for (const [sm, i] of sIdx) if (!best || Math.abs(sm.x - a) < Math.abs(best[0].x - a)) best = [sm, i];
      if (!best || Math.abs(best[0].x - a) > st.step) return '—';
      const pr = r.preds[best[1]]; return `${geoCat(pr?.label)?.name || t('gx.unsure')} (${Math.round((pr?.prob || 0) * 100)} %)`;
    },
    extra: (a) => {   // nearest resampled sample: its label and, after training, the class with its probability
      let best = null; for (const [sm, i] of sIdx) if (!best || Math.abs(sm.x - a) < Math.abs(best[0].x - a)) best = [sm, i];
      if (!best || Math.abs(best[0].x - a) > st.step) return [];
      const [sm, i] = best, out = [], lab = geoRT.labels[i], pr = geoRT.preds[i];
      if (axis === 'age' && sm.depth != null) out.push([t('r.depth'), +sm.depth.toPrecision(5)]);
      if (axis === 'depth' && sm.age != null) out.push([t('r.age'), +sm.age.toPrecision(5)]);
      if (lab?.label) out.push([t(lab.source === 'rule' ? 'gx.byRule' : 'gx.byInterval'), geoCat(lab.label)?.name || lab.label]);
      if (pr?.label || pr?.prob) out.push([t('gx.predicted'), `${geoCat(pr.label)?.name || t('gx.unsure')} (${Math.round((pr.prob || 0) * 100)} %)`]);
      return out;
    } });
  renderIntervalList(core);
}

/* ───────────── V25: styled tooltips for every [title] / [data-tip] (appear after 350 ms, also on keyboard focus) ───────────── */
const hoverTip = document.createElement('div'); hoverTip.className = 'hovertip'; hoverTip.setAttribute('role', 'tooltip'); hoverTip.hidden = true; document.body.append(hoverTip);
let tipTarget = null, tipTimer = 0;
function tipText(el) {
  const v = el.getAttribute('title');
  if (v) { el.dataset.tip = v; el.removeAttribute('title'); if (!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', v); }
  return el.dataset.tip || '';
}
/* V0.19: automatic hover help. A control without its own tip shows t('h.<key>'): key = its data-i18n, the data-i18n of its label, or '#<id>'. */
const TIP_CTL = 'button, select, input, textarea, summary, [role="tab"], label, .slider';
let hoverHelp = true; try { hoverHelp = localStorage.getItem('ichantool.hoverHelp') !== '0'; } catch { /* storage blocked */ }
function autoTip(el) {
  const box = el.closest('label, .slider') || el, ctl = box.querySelector?.('input, select, textarea');
  for (const k of [el.dataset.i18n, box.dataset.i18n, box.querySelector?.('[data-i18n]')?.dataset.i18n, el.id && '#' + el.id, ctl?.id && '#' + ctl.id]) {
    if (!k) continue; const s = t('h.' + k); if (s !== 'h.' + k) return s;
  }
  return '';
}
/** Element whose tip applies at target: the nearest of an explicit tip and (if hover help is on) a control with automatic help. */
function tipEl(target) {
  const own = target.closest?.('[data-tip], [title]'), c = hoverHelp ? target.closest?.(TIP_CTL) : null;
  const auto = c && !c.closest('.hovertip') && autoTip(c) ? c : null;
  if (own && auto) return own.contains(auto) && auto !== own ? auto : own;
  return own || auto;
}
function tipShowFor(el) {
  const txt = tipText(el) || (hoverHelp ? autoTip(el) : ''); if (!txt) return;
  hoverTip.textContent = txt; hoverTip.hidden = false;
  const r = el.getBoundingClientRect(), w = hoverTip.offsetWidth, h = hoverTip.offsetHeight;
  let x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)), y = r.bottom + 8;
  if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
  hoverTip.style.left = x + 'px'; hoverTip.style.top = y + 'px';
}
function tipHide() { clearTimeout(tipTimer); tipTarget = null; hoverTip.hidden = true; }
document.addEventListener('pointerover', (e) => {
  const el = tipEl(e.target);
  if (el === tipTarget) return;
  tipHide(); if (!el || el.closest('.lgrsz.drag')) return;
  if (el.hasAttribute('title')) tipText(el);   // suppress the native tooltip at once
  tipTarget = el; tipTimer = setTimeout(() => tipTarget === el && tipShowFor(el), 350);
});
document.addEventListener('pointerdown', tipHide, true);
document.addEventListener('scroll', tipHide, true);
document.addEventListener('focusin', (e) => { const el = tipEl(e.target); tipHide(); if (el && el.matches(':focus-visible')) { tipTarget = el; tipShowFor(el); } });
document.addEventListener('focusout', tipHide);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tipHide(); });

/* ───────────── V25: hover readout and resizable tracks of composite logs (Columna, Multiproxy › Curvas) ───────────── */
/** Value of a record at axis value a: linear between the nearest non-empty points; null in gaps wider than gap. */
function recordAt(pts, a, gap) {
  let lo = null, hi = null;
  for (const p of pts) { if (p[0] == null || p[1] == null) continue; if (p[0] <= a && (!lo || p[0] > lo[0])) lo = p; if (p[0] >= a && (!hi || p[0] < hi[0])) hi = p; }
  if (!lo || !hi) return null;
  if (hi[0] === lo[0]) return lo[1];
  if (gap && hi[0] - lo[0] > gap) return null;
  return lo[1] + ((hi[1] - lo[1]) * (a - lo[0])) / (hi[0] - lo[0]);
}
const medianGap = (pts) => { const x = pts.filter((p) => p[0] != null && p[1] != null).map((p) => p[0]).sort((a, b) => a - b), d = []; for (let i = 1; i < x.length; i++) if (x[i] > x[i - 1]) d.push(x[i] - x[i - 1]); d.sort((a, b) => a - b); return d.length ? d[d.length >> 1] : 0; };
/**
 * Adds to a rendered log: a cursor that follows the mouse with the value of every record at that level
 * and a card with the bands (class) and extra lines; tooltips on track names; drag handles to change track widths.
 * ctx = {from, to, axisLabel, records, bands, widths (object), onResize(), extra(a) → [[label, value], …]}
 */
function logInteract(box, res, ctx) {
  const svg = box.querySelector('svg'); if (!svg || !res.layout) return;
  box.classList.add('loghover'); box.querySelectorAll('.lgx, .lgrsz').forEach((e) => e.remove());
  const mk = (cls) => { const d = document.createElement('div'); d.className = 'lgx ' + cls; d.hidden = true; box.append(d); return d; };
  const line = mk('lgline'), card = mk('lgcard'), guide = mk('lgguide');
  const recs = new Map((ctx.records || []).map((r) => [r.name, { r, gap: 3 * medianGap(r.pts) }]));
  const chips = res.layout.filter((c) => c.key === 'rec').map((c) => ({ c, el: mk('lgval') }));
  const bandOf = new Map((ctx.bands || []).map((b) => ['band:' + (b.key || b.full || b.title), b]));
  const span = ctx.to - ctx.from, digits = (v) => (v == null || !Number.isFinite(v) ? '—' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString(lang()) : +v.toPrecision(4) + '');
  const geom = () => { const r = svg.getBoundingClientRect(), b = box.getBoundingClientRect(), s = r.width / res.width; return { r, s, ox: r.left - b.left + box.scrollLeft - box.clientLeft, oy: r.top - b.top + box.scrollTop - box.clientTop }; };
  const hide = () => { line.hidden = card.hidden = true; chips.forEach((k) => (k.el.hidden = true)); };
  const place = (G, X, Y) => {   // card next to the cursor, flipped near the right/bottom edge of the visible area
    card.hidden = false;
    const cw = card.offsetWidth, ch = card.offsetHeight, vx = box.scrollLeft + box.clientWidth, vy = box.scrollTop + box.clientHeight;
    let x = G.ox + X * G.s + 16, y = G.oy + Y * G.s + 12;
    if (x + cw > vx - 4) x = G.ox + X * G.s - cw - 16;
    if (y + ch > vy - 4) y = Math.max(box.scrollTop + 4, vy - ch - 4);
    card.style.left = x + 'px'; card.style.top = y + 'px';
  };
  svg.addEventListener('pointermove', (e) => {
    if (box.classList.contains('marking') && e.buttons) { hide(); return; }
    const G = geom(), X = (e.clientX - G.r.left) / G.s, Y = (e.clientY - G.r.top) / G.s;
    const col = res.layout.find((c) => X >= c.x && X <= c.x + c.w);
    if (Y < res.plotTop) {   // header: full track name
      line.hidden = true; chips.forEach((k) => (k.el.hidden = true));
      if (!col) { card.hidden = true; return; }
      card.innerHTML = `<h4>${esc(col.title)}</h4>${col.id ? `<p>${esc(t('gx.resizeHint'))}</p>` : ''}`; place(G, X, Y); return;
    }
    if (Y > res.plotTop + res.plotHeight) { hide(); return; }
    const a = ctx.from + ((Y - res.plotTop) / res.plotHeight) * span, yPx = G.oy + Y * G.s;
    line.hidden = false; line.style.left = G.ox + 'px'; line.style.width = res.width * G.s + 'px'; line.style.top = yPx + 'px';
    const rows = [];
    for (const c of res.layout) {
      if (c.key === 'band') {
        const b = bandOf.get(c.id), sg = b?.segs.find((q) => q.a0 <= a && a < q.a1);
        const lab = ctx.bandText?.(c.bkey, a) ?? (!sg ? '—' : sg.label === '__ok' ? t('gx.hitOk') : sg.label === '__bad' ? t('gx.hitBad') : geoCat(sg.label)?.name ?? sg.name ?? '—');
        rows.push(`<tr class="${col === c ? 'on' : ''}"><td>${sg?.color ? `<span class="sw" style="background:${sg.color}"></span>` : ''}${esc(c.title)}</td><td>${esc(lab)}</td></tr>`);
      } else if (c.key === 'rec') {
        const R = recs.get(c.title), v = R ? recordAt(R.r.pts, a, R.gap) : null;
        rows.push(`<tr class="${col === c ? 'on' : ''}"><td>${esc(c.title)}</td><td>${digits(v)}</td></tr>`);
        const k = chips.find((q) => q.c === c); if (k) { k.el.hidden = v == null; k.el.textContent = digits(v); k.el.style.left = G.ox + (c.x + c.w - 2) * G.s + 'px'; k.el.style.top = yPx + 'px'; }
      }
    }
    const extra = (ctx.extra?.(a) || []).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(String(v))}</td></tr>`);
    card.innerHTML = `<h4>${esc(ctx.axisLabel)}: ${digits(a)}</h4><table>${extra.join('')}${rows.join('')}</table>${ctx.clickHint ? `<p>${esc(ctx.clickHint)}</p>` : ''}`;
    place(G, X, Y);
  });
  svg.addEventListener('pointerleave', hide);
  // drag handles on the right edge of every resizable track (header zone)
  for (const c of res.layout.filter((q) => q.id)) {
    const h = document.createElement('div'); h.className = 'lgrsz'; h.dataset.tip = t('gx.resizeTip', { n: c.title }); box.append(h);
    const pos = () => { const G = geom(); h.style.left = G.ox + (c.x + c.w) * G.s + 2 + 'px'; h.style.top = G.oy + 36 * G.s + 'px'; h.style.height = (res.plotTop - 40) * G.s + 'px'; };
    pos();
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault(); h.setPointerCapture(e.pointerId); h.classList.add('drag'); hide();
      const G = geom(), x0 = e.clientX; let w = c.w;
      guide.hidden = false; guide.style.top = G.oy + 'px'; guide.style.height = res.height * G.s + 'px'; guide.style.left = G.ox + (c.x + c.w) * G.s + 'px';
      const move = (ev) => { w = Math.max(30, Math.min(600, Math.round(c.w + (ev.clientX - x0) / G.s))); guide.style.left = G.ox + (c.x + w) * G.s + 'px'; };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', () => { h.removeEventListener('pointermove', move); guide.hidden = true; h.classList.remove('drag'); if (w !== c.w) { ctx.widths[c.id] = w; ctx.onResize(); } }, { once: true });
    });
    h.addEventListener('dblclick', () => { delete ctx.widths[c.id]; ctx.onResize(); });
  }
}

/** Editable list of the intervals of a core, grouped by layer (hierarchy order). */
function renderIntervalList(core) {
  const g = S.geo, rows = [];
  for (const { layer, depth } of layerTree()) {
    const ivs = g.intervals.filter((q) => q.core === core.id && q.layer === layer.id).sort((a, b) => a.from - b.from);
    if (!ivs.length) continue;
    rows.push(`<div class="ivhead" style="padding-left:${depth * 14}px">${depth ? '↳ ' : ''}<b>${esc(layer.name)}</b> <span class="note">(${ivs.length})</span></div>`);
    for (const q of ivs) {
      const c = geoCat(q.cat);
      rows.push(`<div class="row ivrow ${q.auto ? 'auto' : ''} ${q.id === geoSelIv ? 'sel' : ''}" data-id="${q.id}" style="padding-left:${depth * 14}px"><span class="swatch" style="background:${c?.color}"></span>
        <select data-k="cat">${layer.cats.map((k) => `<option value="${k.id}" ${k.id === q.cat ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select>
        <input type="number" step="any" data-k="from" value="${+q.from.toPrecision(6)}"><input type="number" step="any" data-k="to" value="${+q.to.toPrecision(6)}">
        <span class="note" title="${esc(t(q.axis === 'age' ? 'log.age' : 'log.depth'))}">${q.axis === 'age' ? esc(S.age.units || 'ka') : esc(core.units || 'm')}</span>
        ${geoRT.orphans.has(q.id) ? `<span class="warn" title="${esc(t('geo.orphan', { p: geoLayer(layer.parent)?.name || '' }))}">⚠</span>` : ''}
        ${q.auto ? `<button class="btn small ghost" data-ok="${q.id}" title="${esc(t('geo.confirmAuto'))}">✓</button>` : ''}
        <button class="btn small ghost" data-del="${q.id}">✕</button></div>`);
    }
  }
  $('geoIntervals').innerHTML = rows.join('') || `<p class="note">${t('geo.noIntervals')}</p>`;
}
$('geoCoreSel').addEventListener('change', (e) => { S.geo.view.core = e.target.value; renderGeo(); });
for (const [id, d] of [['geoCorePrev', -1], ['geoCoreNext', 1]]) $(id).addEventListener('click', () => { const i = S.cores.findIndex((c) => c.id === S.geo.view.core); if (!S.cores.length) return; S.geo.view.core = S.cores[(i + d + S.cores.length) % S.cores.length].id; renderGeo(); });
$('geoTrackW').addEventListener('input', (e) => { S.geo.view.trackW = +e.target.value; clearTimeout(geoTrackT); geoTrackT = setTimeout(() => { markDirty(); renderGeoLogs(); }, 120); });
$('geoTrackReset').addEventListener('click', () => { S.geo.view.colW = {}; S.geo.view.trackW = 120; markDirty(); renderGeoLogs(); });
let geoTrackT = 0;
$('geoShowEmpty').addEventListener('change', (e) => { S.geo.view.showEmpty = e.target.checked; markDirty(); renderGeoLogs(); });
$('geoShade').addEventListener('change', (e) => { S.geo.view.shade = e.target.checked; markDirty(); renderGeo(); });
/** V0.34: which families colour the records, and how several are combined. */
function renderShadeBy() {
  const v = S.geo.view, box = $('geoShadeBy'); if (!box) return;
  box.hidden = !v.shade;
  const on = new Set(v.shadeBy || []), opts = [['target', t('sh.target')], ...S.geo.layers.map((l) => [l.id, l.name])];
  box.innerHTML = `<div class="chk2">${opts.map(([id, n]) => `<label class="chk"><input type="checkbox" data-shby="${esc(id)}" ${on.has(id) ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div>
    <label class="f"><span>${t('sh.mode')}</span><select id="geoShadeMode"><option value="mix" ${v.shadeMode !== 'split' ? 'selected' : ''}>${t('sh.mix')}</option><option value="split" ${v.shadeMode === 'split' ? 'selected' : ''}>${t('sh.split')}</option></select></label>`;
}
$('geoShadeBy').addEventListener('change', (e) => {
  const v = S.geo.view;
  if (e.target.id === 'geoShadeMode') v.shadeMode = e.target.value;
  else v.shadeBy = [...$('geoShadeBy').querySelectorAll('[data-shby]:checked')].map((i) => i.dataset.shby);
  markDirty(); renderGeo();
});
$('geoTestBtn').addEventListener('click', () => busy(geoTestCore));

/**
 * Try the automatic classification on the current core without using its own labels:
 * trained on the other cores' labels when they cover ≥ 2 classes; otherwise 5 contiguous blocks
 * of this core, each predicted by a model trained without that block (out-of-block prediction).
 */
function geoTestCore() {
  if (geoRT.dirty) geoComputeSamples();
  const g = S.geo, st = g.settings, core = geoCore(g.view.core), c = curClf(); if (!core) return;
  if (!c) { toast(t('cl.none')); return; }
  syncCurrent();
  const method = c.method === 'kmeans' ? 'rf' : c.method, params = { ...METHODS[method].defaults, ...(c.params?.[method] || {}) }, cols = clfCols(c);
  const X = geoRT.samples.map((s) => ({ ...s, f: cols.map((j) => s.f[j]) })), lab = geoRT.labels, out = new Array(X.length).fill(null);
  const mine = X.map((s, i) => (s.core === core.id ? i : -1)).filter((i) => i >= 0);
  if (!mine.length) { toast(t('geo.testNoSamples')); return; }
  const fit = (idx) => fitModel(method, idx.map((i) => X[i].f), idx.map((i) => lab[i].label), params, c.seed ?? 42);
  const others = X.map((s, i) => (s.core !== core.id && lab[i].label ? i : -1)).filter((i) => i >= 0);
  let scheme;
  if (new Set(others.map((i) => lab[i].label)).size >= 2) { scheme = 'others'; const m = fit(others); for (const i of mine) out[i] = predictLabel(m, X[i].f, c.minProb); }
  else {
    scheme = 'blocks'; const sorted = [...mine].sort((a, b) => X[a].x - X[b].x), k = Math.min(5, sorted.length);
    for (let f = 0; f < k; f++) {
      const test = sorted.slice(Math.floor((f * sorted.length) / k), Math.floor(((f + 1) * sorted.length) / k)), ts = new Set(test);
      const train = X.map((s, i) => (lab[i].label && !ts.has(i) ? i : -1)).filter((i) => i >= 0);
      if (new Set(train.map((i) => lab[i].label)).size < 2) continue;
      const m = fit(train); for (const i of test) out[i] = predictLabel(m, X[i].f, c.minProb);
    }
  }
  const scored = mine.filter((i) => lab[i].label && out[i]?.label != null);
  geoRT.test = { core: core.id, preds: out, scheme, n: scored.length, ok: scored.filter((i) => out[i].label === lab[i].label).length };
  g.view.shade = true; renderGeo();
}
$('geoIntervals').addEventListener('click', (e) => {
  const g = S.geo, d = e.target.closest('button')?.dataset; if (!d) return;
  if (d.del) g.intervals = g.intervals.filter((q) => q.id !== d.del);
  else if (d.ok) { const q = g.intervals.find((x) => x.id === d.ok); if (q) delete q.auto; }
  else return;
  geoMarkDirty(); renderGeo();
});
$('geoIntervals').addEventListener('change', (e) => {
  const row = e.target.closest('.ivrow'); if (!row) return;
  const q = S.geo.intervals.find((x) => x.id === row.dataset.id), k = e.target.dataset.k; if (!q) return;
  if (k === 'cat') q.cat = e.target.value;
  else { const v = parseFloat(e.target.value); if (!Number.isFinite(v)) return; q[k] = v; if (q.from > q.to) [q.from, q.to] = [q.to, q.from]; }
  geoMarkDirty(); renderGeo();
});
$('geoClearAuto').addEventListener('click', (e) => { if (!armed(e.currentTarget)) return; const id = S.geo.view.core; S.geo.intervals = S.geo.intervals.filter((q) => !(q.auto && q.core === id)); geoMarkDirty(); renderGeo(); });
$('geoIvCsv').addEventListener('click', () => {
  const g = S.geo, rows = [['core', 'layer', 'parent_layer', 'category', 'axis', 'from', 'to', 'automatic', 'outside_parent']];
  for (const q of g.intervals) { const L = geoLayer(q.layer); rows.push([geoCore(q.core)?.name, L?.name, geoLayer(L?.parent)?.name ?? '', geoCat(q.cat)?.name, q.axis, q.from, q.to, q.auto ? 1 : 0, geoRT.orphans.has(q.id) ? 1 : 0]); }
  saveFile(`${safe(S.name)}_intervalos.csv`, withProv(toCSV(rows)), 'text/csv');
});

const geoValAt = (ev) => {
  const svg = $('geoLogSvg').querySelector('svg'); if (!svg || !geoLast) return null;
  const r = svg.getBoundingClientRect(), y = ((ev.clientY - r.top) / r.height) * svg.viewBox.baseVal.height;
  const f = (y - geoLast.top) / geoLast.height; if (f < 0 || f > 1) return null;
  return geoLast.from + f * (geoLast.to - geoLast.from);
};
/* ── V26: manual classification right on the columns: drag in a family column to draw, click to edit; automatic columns can be copied to their family ── */
let geoSelIv = null, famDrag = null;
function geoBoxGeom() {
  const box = $('geoLogSvg'), svg = box.querySelector('svg'); if (!svg || !geoLast) return null;
  const r = svg.getBoundingClientRect(), b = box.getBoundingClientRect(), sc = r.width / geoLast.width;
  return { box, r, sc, ox: r.left - b.left + box.scrollLeft - box.clientLeft, oy: r.top - b.top + box.scrollTop - box.clientTop };
}
function geoColAt(e) {
  const G = geoBoxGeom(); if (!G) return null;
  const X = (e.clientX - G.r.left) / G.sc, col = (geoLast.layout || []).find((c) => X >= c.x && X <= c.x + c.w);
  const a = geoValAt(e); return col && a != null ? { col, a, G } : null;
}
const geoIvAt = (layerId, a) => intervalsOnAxis(S.geo.intervals.filter((q) => q.core === geoLast.core.id && q.layer === layerId), geoLast.axis, geoLast.core).find((q) => q && a >= q.from && a <= q.to);
function closeIvPop() { document.querySelectorAll('.ivpop').forEach((p) => p.remove()); }
/** Small panel next to the cursor. html: content; onClick(btn): handles [data-pop] buttons. */
function ivPop(cx, cy, html, onClick) {
  closeIvPop();
  const G = geoBoxGeom(); if (!G) return;
  const p = document.createElement('div'); p.className = 'ivpop'; p.innerHTML = html; G.box.append(p);
  const x = cx - G.box.getBoundingClientRect().left + G.box.scrollLeft, y = cy - G.box.getBoundingClientRect().top + G.box.scrollTop;
  const w = p.offsetWidth, h = p.offsetHeight;
  p.style.left = Math.max(G.box.scrollLeft + 4, Math.min(x + 12, G.box.scrollLeft + G.box.clientWidth - w - 6)) + 'px';
  p.style.top = Math.max(G.box.scrollTop + 4, Math.min(y + 8, G.box.scrollTop + G.box.clientHeight - h - 6)) + 'px';
  p.addEventListener('pointerdown', (e) => e.stopPropagation());
  p.addEventListener('click', (e) => { const b = e.target.closest('[data-pop]'); if (b) onClick(b, p); });
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) p.querySelector('[data-pop=newcat]')?.click(); });
  (p.querySelector('.on') || p.querySelector('button, input'))?.focus();
}
const fmtA = (v) => +(+v).toPrecision(5);
function axisUnit() { return geoLast.axis === 'age' ? S.age.units || 'ka' : geoLast.core.units || 'm'; }
/** Edit panel of a family interval: choose class, confirm a pending one, delete; add a class if the family has none. */
function famPop(cx, cy, q) {
  const g = S.geo, L = geoLayer(q.layer); if (!L) return;
  const qa = intervalsOnAxis([q], geoLast.axis, geoLast.core)[0] || q;
  const cats = L.cats.map((c) => `<button class="popcat ${c.id === q.cat ? 'on' : ''}" data-pop="cat" data-v="${c.id}"><span class="sw" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('');
  ivPop(cx, cy, `<h4>${esc(L.name)} <span class="note">${fmtA(qa.from)}–${fmtA(qa.to)} ${esc(axisUnit())}</span></h4>
    ${q.auto ? `<p class="note">${t('cl.pending')}</p>` : ''}
    <div class="popcats">${cats || `<p class="note">${t('cl.noCats')}</p>`}</div>
    <div class="row popnew"><input type="text" placeholder="${esc(t('geo.newLabel'))}" aria-label="${esc(t('geo.newLabel'))}"><button class="btn small" data-pop="newcat">${t('geo.addLabel')}</button></div>
    <div class="row">${q.auto ? `<button class="btn small primary" data-pop="ok">${t('cl.confirm')}</button>` : ''}<button class="btn small" data-pop="del">${t('cl.delIv')}</button><button class="btn small ghost" data-pop="close">${t('help.close')}</button></div>`,
  (b, p) => {
    const act = b.dataset.pop;
    if (act === 'close') { closeIvPop(); return; }
    if (act === 'del') g.intervals = g.intervals.filter((x) => x !== q);
    else if (act === 'ok') delete q.auto;
    else if (act === 'cat') { q.cat = b.dataset.v; delete q.auto; g.lastCat[L.id] = q.cat; g.activeLayer = L.id; g.activeCat = q.cat; }
    else if (act === 'newcat') { const name = p.querySelector('input').value.trim(); if (!name) return; const c = addCat(L, name); q.cat = c.id; delete q.auto; g.lastCat[L.id] = c.id; }
    geoSelIv = act === 'del' ? null : q.id; geoMarkDirty(); renderGeoPanel(); renderGeo();
    if (act === 'newcat') famPop(cx, cy, q);
  });
}
/** Panel of an automatic column: copy the segment under the cursor, or the whole column of this core, to its family. */
function autoPop(cx, cy, bkey, a) {
  const [, cid, lid] = bkey.split(':'), c = S.geo.classifiers.find((x) => x.id === cid), L = geoLayer(lid), r = geoRT.runs.get(cid)?.byTarget.get(lid);
  if (!c || !L || !r?.preds?.length) return;
  const st = S.geo.settings, core = geoLast.core, segs = segmentsFor(core.id, (i) => r.preds[i]?.label, geoLast.axis, st.step);
  const seg = segs.find((q) => a >= q.a0 && a < q.a1), cat = geoCat(seg?.label);
  ivPop(cx, cy, `<h4>⚙ ${esc(c.name)} → ${esc(L.name)}</h4>
    <p>${cat ? `<span class="sw" style="background:${cat.color}"></span>${esc(cat.name)} · ${fmtA(seg.a0)}–${fmtA(seg.a1)} ${esc(axisUnit())}` : t('gx.unsure')}</p>
    <div class="popcol">${seg ? `<button class="btn small primary" data-pop="one">${t('cl.copyOne', { f: L.name })}</button>` : ''}
    <button class="btn small" data-pop="all">${t('cl.copyAll', { f: L.name })}</button><button class="btn small ghost" data-pop="close">${t('help.close')}</button></div>
    <p class="note">${t('cl.copyNote')}</p>`,
  (b) => {
    const act = b.dataset.pop, g = S.geo; if (act === 'close') { closeIvPop(); return; }
    if (act === 'one' && seg) g.intervals.push({ id: uid(), core: core.id, layer: lid, axis: geoLast.axis, from: seg.a0, to: seg.a1, cat: seg.label });
    if (act === 'all') {
      g.intervals = g.intervals.filter((q) => !(q.auto && q.core === core.id && q.layer === lid));
      g.intervals.push(...segs.filter((q) => geoLayerOf(q.label)?.id === lid).map((q) => ({ id: uid(), core: core.id, layer: lid, axis: geoLast.axis, from: q.a0, to: q.a1, cat: q.label, auto: true })));
      toast(t('geo.accepted', { n: segs.length }));
    }
    closeIvPop(); geoMarkDirty(); renderGeo();
  });
}
$('geoLogSvg').addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('.lgrsz, .ivpop')) return;
  closeIvPop();
  const hit = geoColAt(e); if (!hit || !hit.col.bkey?.startsWith('fam:')) return;
  const G = hit.G, prev = document.createElement('div'); prev.className = 'lgx ivprev'; G.box.append(prev);
  famDrag = { layer: hit.col.bkey.slice(4), a: hit.a, y0: e.clientY, col: hit.col, prev, G };
  e.preventDefault();
});
window.addEventListener('pointermove', (e) => {
  if (!famDrag) return;
  const { G, col, prev, y0 } = famDrag, y1 = e.clientY, top = Math.min(y0, y1), h = Math.abs(y1 - y0);
  prev.hidden = h < 3; prev.style.left = G.ox + col.x * G.sc + 'px'; prev.style.width = col.w * G.sc + 'px';
  prev.style.top = top - G.r.top + G.oy + 'px'; prev.style.height = h + 'px';
});
window.addEventListener('pointerup', (e) => {
  if (!famDrag) return;
  const d = famDrag; famDrag = null; d.prev.remove();
  const g = S.geo, L = geoLayer(d.layer); if (!L || !geoLast) return;
  if (Math.abs(e.clientY - d.y0) < 4) {   // click: edit the interval at that level
    const q = geoIvAt(L.id, d.a), orig = q && g.intervals.find((x) => x.id === q.id);
    geoSelIv = orig?.id || null; renderIntervalList(geoLast.core);
    if (orig) famPop(e.clientX, e.clientY, orig);
    else ivPop(e.clientX, e.clientY, `<h4>${esc(L.name)}</h4><p class="note">${t('cl.dragHere', { f: L.name })}</p><div class="row"><button class="btn small ghost" data-pop="close">${t('help.close')}</button></div>`, () => closeIvPop());
    return;
  }
  const v = geoValAt(e) ?? d.a; let a = Math.min(d.a, v), b = Math.max(d.a, v);
  if (L.parent) {   // a subdivision stays inside the parent interval where the drag started
    const par = intervalsOnAxis(g.intervals.filter((q) => q.core === geoLast.core.id && q.layer === L.parent), geoLast.axis, geoLast.core).find((q) => q && d.a >= q.from && d.a < q.to);
    if (par) { a = Math.max(a, par.from); b = Math.min(b, par.to); } else toast(t('geo.orphan', { p: geoLayer(L.parent)?.name || '' }));
  }
  if (!(b > a)) return;
  const cat = L.cats.some((c) => c.id === g.lastCat[L.id]) ? g.lastCat[L.id] : L.cats[0]?.id ?? null;
  const q = { id: uid(), core: geoLast.core.id, layer: L.id, axis: geoLast.axis, from: a, to: b, cat };
  g.intervals.push(q); geoSelIv = q.id; geoMarkDirty(); renderGeo();
  famPop(e.clientX, e.clientY, q);
});
$('geoLogSvg').addEventListener('click', (e) => {
  if (!geoLast || e.target.closest('.lgrsz, .ivpop')) return;
  const hit = geoColAt(e); if (!hit?.col.bkey?.startsWith('auto:')) return;
  autoPop(e.clientX, e.clientY, hit.col.bkey, hit.a);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeIvPop(); if (cropState) endCrop(); } });
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.ivpop, #geoLogSvg')) closeIvPop(); });

/** Hover text of a map point (V25). */
function mapTip(p, mode, feat) {
  const where = p.project ? ` — ${p.project}` : '';
  const val = mode === 'sites' ? '' : !p.n ? t('gx.mapNoData') : mode === 'class' ? `${geoCat(p.dominant)?.name ?? p.dominant ?? '—'}${p.fraction != null ? ` (${Math.round(p.fraction * 100)} %)` : ''}` : `${feat}: ${(+p.value).toFixed(2)}`;
  return [p.name + where, val, p.n ? t('gx.mapN', { n: p.n }) : '', `${fmt(p.lat, 4)}°, ${fmt(p.lon, 4)}°`].filter(Boolean).join('\n');
}
export function renderGeoMap() {
  const g = S.geo, m = g.map, st = g.settings, box = $('geoMapSvg');
  $('gmA0').value = m.a0; $('gmA1').value = m.a1; $('gmMode').value = m.mode; $('gmIdw').checked = m.idw; $('gmPower').value = m.power;
  $('gmRef').checked = m.ref; $('gmR0').value = m.r0; $('gmR1').value = m.r1;
  const names = geoRT.featNames;
  if (!names.includes(m.feature)) m.feature = names[0] || '';
  $('gmFeature').innerHTML = names.map((k) => `<option ${k === m.feature ? 'selected' : ''}>${esc(k)}</option>`).join('');
  for (const id of ['gmFeatRow', 'gmIdwRow', 'gmRefRow']) $(id).hidden = m.mode !== 'value';
  if (!geoRT.samples.some((s) => s.age != null)) { box.innerHTML = `<p class="note" style="padding:20px">${t('geo.mapNoAge')}</p>`; return; }
  // V26: what the class map shows — a family (described intervals) or an automatic column
  const srcs = [];
  for (const { layer } of layerTree()) {
    if (S.geo.intervals.some((q) => q.layer === layer.id && !q.auto)) srcs.push({ v: 'fam:' + layer.id, name: layer.name, lid: layer.id });
    for (const c of S.geo.classifiers) { const r = geoRT.runs.get(c.id)?.byTarget.get(layer.id); if (r?.preds?.length) srcs.push({ v: `auto:${c.id}:${layer.id}`, name: `⚙ ${c.name} → ${layer.name}`, lid: layer.id, r, c }); }
  }
  if (!srcs.some((x) => x.v === m.src)) m.src = srcs.find((x) => x.r)?.v || srcs[0]?.v || '';
  $('gmSrc').innerHTML = srcs.map((x) => `<option value="${esc(x.v)}" ${x.v === m.src ? 'selected' : ''}>${esc(x.name)}</option>`).join(''); $('gmSrcRow').hidden = m.mode !== 'class';
  const src = srcs.find((x) => x.v === m.src);
  const preds = src?.r ? src.r.preds : src ? labelsFor(src.lid, false).map((l) => ({ label: l.label })) : geoRT.labels.map((l) => ({ label: l.label }));
  const off = new Set(m.off || []);
  const pts = mapSummary(geoRT.samples, preds, S.cores, { a0: m.a0, a1: m.a1, mode: m.mode, feature: names.indexOf(m.feature), ref: m.ref ? [m.r0, m.r1] : null }).filter((p) => !off.has(p.core));
  m.interp ||= {}; for (const [k, v] of Object.entries(INTERP_DEFAULT)) if (!(k in m.interp)) m.interp[k] = v; m.interp.on = m.idw;
  const style = geoMapStyle(), fr = frameRatio('gmFrame');
  let auto = mapBBox(pts); auto[2] += 3; if (fr) { auto = fitBBoxAspect(auto, fr, style.proj); if (m.view) m.view = fitBBoxAspect(m.view, fr, style.proj); } geoAutoBBox = auto;
  const bbox = m.view || auto;
  const nx = 90, ny = Math.max(10, Math.round((90 * (bbox[3] - bbox[1])) / ((bbox[2] - bbox[0]) * Math.cos((((bbox[1] + bbox[3]) / 2) * Math.PI) / 180))));
  const bg = mapBackground(style.bg, bbox, refreshProjectMaps, style.proj);
  const vl = m.mode === 'value' ? valueLayer(pts, bbox, m.interp, m.ref ? `Δ ${m.feature}` : `z ${m.feature}`) : null;
  const colors = {}, legend = [];
  if (m.mode === 'class') for (const p of pts) if (p.dominant && !colors[p.dominant]) { const c = geoCat(p.dominant); if (c) { colors[p.dominant] = c.color; legend.push([c.name, c.color]); } }
  const target = src ? geoLayer(src.lid)?.name || '' : geoLayer(st.target)?.name || '';
  const svg = buildMapSVG({ tipFn: (p) => mapTip(p, m.mode, m.feature),
    land: geoLand, bbox, points: pts, mode: m.mode, colors, legend, style, bg, ...(vl ? { grid: vl.grid, nx: vl.nx, ny: vl.ny, colorFn: vl.colorFn, contours: vl.contours, contourLabels: vl.contourLabels, gridOpacity: vl.gridOpacity, colorbar: vl.colorbar } : {}),
    title: m.mode === 'class' ? t('geo.mapTitleClass', { l: target, a0: m.a0, a1: m.a1 }) : t('geo.mapTitleValue', { f: m.feature, a0: m.a0, a1: m.a1 }),
    subtitle: m.mode === 'class' ? (src?.r ? t('cl.mapSub', { c: src.c.name, m: t('geo.m.name.' + src.c.method) }) : t('geo.mapSubLabels')) : (m.ref ? t('geo.mapSubRef', { r0: m.r0, r1: m.r1 }) : t('geo.mapSubZ')),
    note: t('geo.mapNote'),
  });
  box.innerHTML = svg; geoLastMap = { svg, pts };
  mapStyleUI('gmStyle', geoMapGet, (s2, v) => { S.geo.map.style = s2; S.geo.map.view = v; markDirty(); }, refreshProjectMaps);
  $('gmInterp').hidden = m.mode !== 'value';
  if (m.mode === 'value') interpUI('gmInterp', () => m.interp, () => { m.idw = m.interp.on; markDirty(); }, refreshProjectMaps, vl?.info);
  const offSet = new Set(m.off || []);
  coreListUI('gmCores', S.cores.map((c) => ({ id: c.id, name: c.name, lat: c.lat })), offSet, () => { m.off = [...offSet]; markDirty(); }, refreshProjectMaps);
  return svg;
}
export let geoLand = [], geoLastMap = null;
async function loadLand() { if (geoLand.length) return; try { geoLand = (await (await fetchAsset('data/land-50m.json')).json()).rings; } catch { geoLand = []; } }

/* ───────────── map interpolation (Surfer-like), colour scale and list of cores (V20) ───────────── */
/** Grid, colour function, contours and colour bar of a value map. pts = map points with .value; ip = interpolation options. */
function valueLayer(pts, bbox, ip, label) {
  const o = { ...INTERP_DEFAULT, ...ip }, g = mapGeometry(bbox), nx = Math.max(10, Math.min(400, Math.round(o.res)));
  const ny = Math.max(6, Math.round((nx * g.H) / g.W));
  let grid = null, info = {};
  if (o.on !== false && pts.filter((p) => p.value != null).length >= 3) {
    const r = interpolate(pts, bbox, nx, ny, o); info = r.info;
    grid = o.mask && o.mask !== 'both' && geoLand.length ? maskLand(r.grid, nx, ny, bbox, geoLand, o.mask) : r.grid;
  }
  const [lo, hi] = colorRange((grid || []).concat(pts.map((p) => p.value)), o);
  const colorFn = (v) => rampColor(o.ramp, v, lo, hi, o.steps, o.reverse);
  const contours = grid && o.contours ? contourLevels(lo, hi, o.levels).map((level) => ({ level, label: +level.toFixed(3), segs: contourSegments(grid, nx, ny, level) })) : [];
  return { grid, nx, ny, colorFn, contours, contourLabels: o.labels, gridOpacity: o.opacity, colorbar: { min: lo, max: hi, fn: colorFn, label }, info };
}

/** Panel of interpolation and colour options. get() → options object (mutated by the panel); redraw() renders the map. */
function interpUI(boxId, get, save, redraw, info) {
  const box = $(boxId), o = get();
  box.dataset.key ||= '';
  const key = `${lang()}|${o.method}|${o.scale}|${o.autoVario}|${o.contours}|${o.on}`;
  const fill = () => {
    for (const el of box.querySelectorAll('[data-ip]')) if (el !== document.activeElement) { const k = el.dataset.ip; if (el.type === 'checkbox') el.checked = !!o[k]; else el.value = o[k]; }
    const inf = box.querySelector('.ipinfo');
    if (inf) inf.textContent = info?.variogram ? t('ip.vario', { m: t('ip.v.' + info.variogram.model), n: +info.variogram.nugget.toFixed(3), s: +info.variogram.sill.toFixed(3), r: Math.round(info.variogram.range) }) + (info.variogram && info.few ? ' ' + t('ip.few') : '') : info?.fallback ? t('ip.fallback') : '';
  };
  if (box.dataset.key === key) { fill(); return; }
  const open = box.querySelector('details')?.open;
  box.dataset.key = key;
  const num = (k, l, a, b, st, dis = false) => `<label class="f"><span>${t(l)}</span><input type="number" data-ip="${k}" min="${a}" max="${b}" step="${st}" ${dis ? 'disabled' : ''}></label>`;
  const chk = (k, l) => `<label class="chk"><input type="checkbox" data-ip="${k}"><span>${t(l)}</span></label>`;
  const sel = (k, l, opts) => `<label class="f"><span>${t(l)}</span><select data-ip="${k}">${opts.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></label>`;
  const m = o.method, P = {
    idw: num('power', 'ip.power', 1, 6, 0.5) + num('radius', 'ip.radius', 0, 5000, 10) + num('neighbours', 'ip.neigh', 0, 100, 1),
    nearest: num('radius', 'ip.radius', 0, 5000, 10), tin: '', mincurv: num('smooth', 'ip.smooth', 0, 10, 0.1),
    rbf: sel('rbf', 'ip.rbf', [['multiquadric', t('ip.r.mq')], ['gaussian', t('ip.r.gauss')], ['tps', t('ip.r.tps')]]) + num('shape', 'ip.shape', 1, 5000, 10) + num('smooth', 'ip.smooth', 0, 10, 0.1),
    kriging: sel('variogram', 'ip.vmodel', ['spherical', 'exponential', 'gaussian', 'linear'].map((v) => [v, t('ip.v.' + v)])) + chk('autoVario', 'ip.auto') + num('nugget', 'ip.nugget', 0, 1e6, 'any', o.autoVario) + num('sill', 'ip.sill', 0, 1e6, 'any', o.autoVario) + num('range', 'ip.range', 1, 20000, 'any', o.autoVario),
    movavg: num('radius', 'ip.radius', 0, 5000, 10),
  };
  box.innerHTML = `<details ${open ? 'open' : ''}><summary>${t('ip.title')}</summary><div class="msgrid">
    ${chk('on', 'ip.on')}${sel('method', 'ip.method', INTERP_METHODS.map((k) => [k, t('ip.m.' + k)]))}${P[m] || ''}
    <p class="note" style="flex-basis:100%;margin:0">${t('ip.d.' + m)}</p>
    ${num('res', 'ip.res', 10, 400, 10)}${chk('hull', 'ip.hull')}${sel('mask', 'ip.mask', [['both', t('ip.mask.both')], ['sea', t('ip.mask.sea')], ['land', t('ip.mask.land')]])}
    ${num('opacity', 'ip.opacity', 0.1, 1, 0.05)}${chk('contours', 'ip.contours')}${o.contours ? num('levels', 'ip.levels', 1, 30, 1) + chk('labels', 'ip.labels') : ''}
    ${sel('ramp', 'ip.ramp', Object.keys(RAMPS).map((k) => [k, t('ip.ramp.' + k)]))}${chk('reverse', 'ip.reverse')}
    ${sel('scale', 'ip.scale', ['sym2', 'auto', 'symauto', 'manual'].map((k) => [k, t('ip.sc.' + k)]))}${o.scale === 'manual' ? num('vmin', 'ip.vmin', -1e9, 1e9, 'any') + num('vmax', 'ip.vmax', -1e9, 1e9, 'any') : ''}${num('steps', 'ip.steps', 0, 20, 1)}
    <p class="note ipinfo" style="flex-basis:100%;margin:0"></p></div></details>`;
  fill();
  box.onchange = (e) => {
    const el = e.target, k = el.dataset.ip; if (!k) return;
    const cur = get(); cur[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value;
    save(); setTimeout(redraw, 0);
  };
}

/** List of the cores of a map with a checkbox each (unticked cores are left out of the map and of the interpolation). */
function coreListUI(boxId, cores, off, save, redraw) {
  const box = $(boxId), open = box.querySelector('details')?.open;
  box.innerHTML = `<details ${open ? 'open' : ''}><summary>${t('ip.cores', { n: cores.filter((c) => !off.has(c.id)).length, t: cores.length })}</summary>
    <div class="row" style="margin:6px 0"><button class="btn small" data-cl="all">${t('mp.all')}</button><button class="btn small" data-cl="none">${t('mp.none')}</button></div>
    <div class="chklist">${cores.map((c) => `<label class="chk" title="${esc(c.where || '')}"><input type="checkbox" data-id="${esc(c.id)}" ${off.has(c.id) ? '' : 'checked'} ${c.lat == null ? 'disabled' : ''}><span>${esc(c.name)}${c.lat == null ? ` <i class="note">(${t('ip.noPos')})</i>` : ''}</span></label>`).join('')}</div></details>`;
  box.onchange = (e) => { const id = e.target.dataset.id; if (id == null) return; if (e.target.checked) off.delete(id); else off.add(id); save(); setTimeout(redraw, 0); };
  box.onclick = (e) => { const a = e.target.dataset.cl; if (!a) return; if (a === 'all') off.clear(); else cores.forEach((c) => off.add(c.id)); save(); setTimeout(redraw, 0); };
}

/* ───────────── resizable / collapsible side panels and resizable maps (V23) ───────────── */
let panelPrefs = {};
try { panelPrefs = JSON.parse(localStorage.getItem('ichantool.panels') || '{}'); } catch { panelPrefs = {}; }
const savePanels = () => { try { localStorage.setItem('ichantool.panels', JSON.stringify(panelPrefs)); } catch { /* storage blocked */ } };
const panelSides = (m) => (m === 'section' ? ['l', 'r'] : m === 'data' ? [] : ['l']);
const splitL = document.createElement('div'), splitR = document.createElement('div');
splitL.className = 'splitter l'; splitR.className = 'splitter r';
splitL.innerHTML = `<button type="button" data-i18n-title="ui.togglePanel">‹</button>`; splitR.innerHTML = `<button type="button" data-i18n-title="ui.togglePanel">›</button>`;
$('work').append(splitL, splitR);
function applyPanels() {
  const w = $('work'), p = panelPrefs[mode] || {}, sides = panelSides(mode);
  w.classList.toggle('lcollapsed', sides.includes('l') && !!p.lc); w.classList.toggle('rcollapsed', sides.includes('r') && !!p.rc);
  if (sides.includes('l') && (p.lc || p.l)) w.style.setProperty('--lw', p.lc ? '0px' : p.l + 'px'); else w.style.removeProperty('--lw');
  if (sides.includes('r') && (p.rc || p.r)) w.style.setProperty('--rw', p.rc ? '0px' : p.r + 'px'); else w.style.removeProperty('--rw');
  if (panelPrefs.profW) prof.parentElement.style.setProperty('--pw', panelPrefs.profW + 'px');   // V0.21
  requestAnimationFrame(() => { placeSplitters(); resizeCanvases?.(); });
}
function placeSplitters() {
  const w = $('work'), sides = panelSides(mode), wide = mode === 'geo' && w.classList.contains('mapwide');
  const left = [...w.querySelectorAll(':scope > aside.side.left')].find((a) => getComputedStyle(a).display !== 'none');
  const right = w.querySelector(':scope > aside.side.right');
  splitL.hidden = !sides.includes('l') || !left || wide || innerWidth <= 860;
  splitR.hidden = !sides.includes('r') || !right || innerWidth <= 860;
  if (!splitL.hidden) { splitL.style.left = `${left.offsetLeft + left.offsetWidth}px`; splitL.querySelector('button').textContent = w.classList.contains('lcollapsed') ? '›' : '‹'; }
  if (!splitR.hidden) { splitR.style.left = `${right.offsetLeft}px`; splitR.querySelector('button').textContent = w.classList.contains('rcollapsed') ? '‹' : '›'; }
}
function dragSplitter(el, side) {
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('drag');
    const w = $('work'), r = w.getBoundingClientRect(), p = (panelPrefs[mode] ||= {});
    const move = (ev) => {
      const v = side === 'l' ? ev.clientX - r.left : r.right - ev.clientX, px = Math.round(Math.max(170, Math.min(r.width * 0.6, v)));
      p[side] = px; p[side + 'c'] = false; w.classList.remove(side === 'l' ? 'lcollapsed' : 'rcollapsed');
      w.style.setProperty(side === 'l' ? '--lw' : '--rw', px + 'px'); placeSplitters();
    };
    const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', move); savePanels(); resizeCanvases?.(); if (mode === 'geo' && S.geo.view.tab === 'map') renderGeoMap(); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up, { once: true });
  });
  el.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) { const p = (panelPrefs[mode] ||= {}); delete p[side]; p[side + 'c'] = false; savePanels(); applyPanels(); } });
  el.querySelector('button').addEventListener('click', () => { const p = (panelPrefs[mode] ||= {}); p[side + 'c'] = !p[side + 'c']; savePanels(); applyPanels(); });
}
dragSplitter(splitL, 'l'); dragSplitter(splitR, 'r');
window.addEventListener('resize', () => placeSplitters());
try { new ResizeObserver(() => placeSplitters()).observe($('work')); } catch { /* old browsers */ }

// maps: drag the right edge (width) or the bottom edge (height) of the frame; double click restores the default
let frameSizes = {};
try { frameSizes = JSON.parse(localStorage.getItem('ichantool.mapFrames') || '{}'); } catch { frameSizes = {}; }
/** Height/width wanted for the plot area of a map whose frame height was fixed by the user (null = follow the extent). */
function frameRatio(id) {
  const z = frameSizes[id], f = $(id); if (!z?.h || !f) return null;
  const w = f.clientWidth || z.w || 900, sc = w / 900;
  return Math.max(0.2, (z.h / sc - 44 - 110) / 900);
}
function applyFrame(id) {
  const f = $(id), z = frameSizes[id] || {};
  if (z.w) f.style.setProperty('--fw', z.w + 'px'); else f.style.removeProperty('--fw');
  if (z.h) { f.style.setProperty('--fh', z.h + 'px'); f.classList.add('hfixed'); } else { f.style.removeProperty('--fh'); f.classList.remove('hfixed'); }
}
for (const h of document.querySelectorAll('.rszh, .rszv')) {
  const id = h.dataset.frame, horiz = h.classList.contains('rszh');
  h.addEventListener('pointerdown', (e) => {
    e.preventDefault(); h.setPointerCapture(e.pointerId);
    const f = $(id), r = f.getBoundingClientRect(), z = (frameSizes[id] ||= {});
    const move = (ev) => { if (horiz) z.w = Math.round(Math.max(320, ev.clientX - r.left)); else z.h = Math.round(Math.max(240, ev.clientY - r.top)); applyFrame(id); };
    const up = () => { h.removeEventListener('pointermove', move); f.classList.remove('sizing'); try { localStorage.setItem('ichantool.mapFrames', JSON.stringify(frameSizes)); } catch { /* storage blocked */ } redrawFrame(id); };
    f.classList.add('sizing');
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up, { once: true });
  });
  h.addEventListener('dblclick', () => { const z = (frameSizes[id] ||= {}); if (horiz) delete z.w; else delete z.h; applyFrame(id); try { localStorage.setItem('ichantool.mapFrames', JSON.stringify(frameSizes)); } catch { /* storage blocked */ } redrawFrame(id); });
}
function redrawFrame(id) { if (id === 'gmFrame') renderGeoMap(); else redrawAllMap(); }
applyFrame('gmFrame'); applyFrame('amFrame');

/* ───────────── map customisation, backgrounds and zoom (V15) ───────────── */
// Backgrounds come as single images in EPSG:4326 (lon/lat) for the exact extent, so they lie on the plate carrée map unchanged.
// Mercator maps ask for EPSG:3857 images (linear in Mercator y), so they also lie on the map unchanged.
const R_EARTH = 6378137, merc = (lon, lat) => [R_EARTH * lon * Math.PI / 180, R_EARTH * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
const ESRI = (svc) => (b, w, h, pr) => `https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/export?bbox=${b.join(',')}&bboxSR=4326&imageSR=${pr === 'mercator' ? 3857 : 4326}&size=${w},${h}&format=jpg&f=image`;
const GEBCO = (b, w, h, pr) => pr === 'mercator'
  ? `https://wms.gebco.net/mapserv?service=WMS&version=1.1.1&request=GetMap&layers=GEBCO_LATEST&styles=&srs=EPSG:3857&bbox=${[...merc(b[0], b[1]), ...merc(b[2], b[3])].map((v) => v.toFixed(0)).join(',')}&width=${w}&height=${h}&format=image/jpeg`
  : `https://wms.gebco.net/mapserv?service=WMS&version=1.1.1&request=GetMap&layers=GEBCO_LATEST&styles=&srs=EPSG:4326&bbox=${b.join(',')}&width=${w}&height=${h}&format=image/jpeg`;
let bgWidth = 1600; // pixels across of the background image (raised temporarily for high-resolution exports)
const MAP_BG = {
  vector: null,
  physical: { url: ESRI('World_Physical_Map'), attr: 'Fondo: Esri, U.S. National Park Service (World Physical Map)' },
  relief: { url: ESRI('World_Shaded_Relief'), attr: 'Fondo: Esri (World Shaded Relief)' },
  topo: { url: ESRI('World_Topo_Map'), attr: 'Fondo: Esri y colaboradores (World Topographic Map)' },
  bathy: { url: ESRI('Ocean/World_Ocean_Base'), attr: 'Fondo: Esri, Garmin, GEBCO, NOAA NGDC y otros (World Ocean Base)' },
  gebco: { url: GEBCO, attr: 'Batimetría y topografía: GEBCO Compilation Group, GEBCO_LATEST grid (www.gebco.net)' },
  photo: { url: ESRI('World_Imagery'), attr: 'Imagen: Esri, Maxar, Earthstar Geographics y GIS User Community (World Imagery)' },
  photobathy: { url: GEBCO, url2: ESRI('World_Imagery'), attr: 'Batimetría: GEBCO Compilation Group (GEBCO_LATEST); tierra: Esri, Maxar, Earthstar Geographics (World Imagery)' },
};
const bgCache = new Map(), bgPromises = new Map(); let bgFailShown = false, mapNetAsked = null;
export function mapNetConsent() {
  try { if (localStorage.getItem('ichantool.mapNet') === 'yes') return true; } catch { /* storage blocked */ }
  if (mapNetAsked !== null) return mapNetAsked;
  mapNetAsked = confirm(t('map.netAsk'));
  if (mapNetAsked) try { localStorage.setItem('ichantool.mapNet', 'yes'); } catch { /* storage blocked */ }
  return mapNetAsked;
}
const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
export async function fetchImage(url) { const r = await fetch(url); if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) throw new Error(`HTTP ${r.status}`); return blobToDataURL(await r.blob()); }
/** Background for a map: returns {href, href2, attribution} when cached; otherwise starts the download and calls onReady. */
function mapBackground(kind, bbox, onReady, proj = 'plate') {
  const def = MAP_BG[kind]; if (!def || (proj !== 'plate' && proj !== 'mercator')) return null;
  const key = `${kind}|${proj}|${bgWidth}|${bbox.join(',')}`, hit = bgCache.get(key);
  if (hit && hit !== 'pending') return hit === 'fail' ? null : hit;
  if (!hit) {
    if (!mapNetConsent()) return null;   // V0.38: explicit consent before the study area is sent to Esri/GEBCO
    bgCache.set(key, 'pending');
    // square pixels in degrees (ArcGIS would otherwise widen the extent); the image is then stretched onto the cos(lat) map
    const [mx0, my0] = merc(bbox[0], bbox[1]), [mx1, my1] = merc(bbox[2], bbox[3]);
    let w = Math.min(4096, bgWidth), h = Math.round(proj === 'mercator' ? (w * (my1 - my0)) / (mx1 - mx0) : (w * (bbox[3] - bbox[1])) / (bbox[2] - bbox[0]));
    if (h > 4096) { w = Math.round((w * 4096) / h); h = 4096; } h = Math.max(h, 50);
    bgPromises.set(key, Promise.all([fetchImage(def.url(bbox, w, h, proj)), def.url2 ? fetchImage(def.url2(bbox, w, h, proj)) : null])
      .then(([href, href2]) => { bgCache.set(key, { href, href2, attribution: def.attr }); onReady(); })
      .catch(() => { bgCache.set(key, 'fail'); if (!bgFailShown) { bgFailShown = true; toast(t('ms.bgFail')); } onReady(); }));
  }
  return null;
}
const bgPending = (kind, bbox, proj = 'plate') => bgCache.get(`${kind}|${proj}|${bgWidth}|${bbox.join(',')}`) === 'pending';

/** Style panel for a map. get() → {style, view}; set(style, view) stores; redraw() renders; fit() resets the extent. */
function mapStyleUI(boxId, get, set, redraw) {
  const box = $(boxId), { style: st, view } = get();
  if (box.dataset.built === lang()) { // already built: only refresh the values (rebuilding would steal the focus)
    for (const el of box.querySelectorAll('[data-k]')) if (el !== document.activeElement) { if (el.type === 'checkbox') el.checked = !!st[el.dataset.k]; else el.value = st[el.dataset.k]; }
    for (const el of box.querySelectorAll('[data-e]')) if (el !== document.activeElement) el.value = view ? view[+el.dataset.e] : '';
    box.querySelector('.msload').textContent = bgPending(st.bg, view || get().auto || [0, 0, 0, 0], st.proj) ? ' · ' + t('ms.loading') : '';
    return;
  }
  box.dataset.built = lang();
  const chk = (k, l) => `<label class="chk"><input type="checkbox" data-k="${k}" ${st[k] ? 'checked' : ''}><span>${t(l)}</span></label>`;
  const col = (k, l) => `<label class="f"><span>${t(l)}</span><input type="color" data-k="${k}" value="${esc(st[k])}"></label>`;
  const num = (k, l, a, b, s) => `<label class="f"><span>${t(l)}</span><input type="number" data-k="${k}" min="${a}" max="${b}" step="${s}" value="${st[k]}"></label>`;
  const ext = view || ['', '', '', ''];
  box.innerHTML = `<details><summary>${t('ms.title')}</summary><div class="msgrid">
    <label class="f"><span>${t('ms.bg')}</span><select data-k="bg">${Object.keys(MAP_BG).map((k) => `<option value="${k}" ${k === st.bg ? 'selected' : ''}>${t('ms.bg.' + k)}</option>`).join('')}</select></label>
    ${num('bgOpacity', 'ms.opacity', 0.1, 1, 0.1)}${chk('coast', 'ms.coast')}
    <label class="f"><span>${t('ms.proj')}</span><select data-k="proj">${MAP_PROJECTIONS.map((k) => `<option value="${k}" ${k === (st.proj || 'plate') ? 'selected' : ''}>${t('ms.proj.' + k)}</option>`).join('')}</select></label>
    <label class="f"><span>${t('ms.symbol')}</span><select data-k="symbol">${MAP_SYMBOLS.map((k) => `<option value="${k}" ${k === st.symbol ? 'selected' : ''}>${t('ms.sym.' + k)}</option>`).join('')}</select></label>
    ${num('size', 'ms.size', 0.3, 4, 0.1)}${chk('sizeByFraction', 'ms.sizeFrac')}${col('pointColor', 'ms.pointColor')}${col('stroke', 'ms.stroke')}
    ${chk('labels', 'ms.labels')}${num('labelSize', 'ms.labelSize', 6, 30, 1)}${col('labelColor', 'ms.labelColor')}${chk('halo', 'ms.halo')}${chk('labelValue', 'ms.labelValue')}
    ${col('land', 'ms.land')}${col('sea', 'ms.sea')}${col('textColor', 'color.textColor')}${col('subColor', 'color.subColor')}${col('bgColor', 'color.bgColor')}${chk('graticule', 'ms.grat')}${chk('scaleBar', 'ms.scale')}${chk('north', 'ms.north')}
    <label class="f"><span>${t('ms.extent')}</span><span class="row">${[0, 1, 2, 3].map((i) => `<input type="number" step="any" data-e="${i}" value="${ext[i]}">`).join('')}</span></label>
    <div class="zbtn"><button class="btn small" data-z="in" title="Zoom +">＋</button><button class="btn small" data-z="out" title="Zoom −">－</button><button class="btn small" data-z="fit">${t('ms.fit')}</button><button class="btn small" data-z="reset">${t('ms.reset')}</button></div>
    <p class="note" style="margin:0;flex-basis:100%">${t('ms.zoomHelp')}<span class="msload"></span></p></div></details>`;
  box.onchange = (e) => {
    const el = e.target, cur = get();
    if (el.dataset.k) { const k = el.dataset.k; cur.style[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value; set(cur.style, cur.view); }
    else if (el.dataset.e != null) {
      const v = [...box.querySelectorAll('[data-e]')].map((x) => +x.value);
      if (v.every(Number.isFinite) && v[2] > v[0] && v[3] > v[1]) set(cur.style, v);
    }
    redraw();
  };
  box.onclick = (e) => {
    const z = e.target.closest('[data-z]')?.dataset.z; if (!z) return;
    const cur = get(), vb = cur.view || cur.auto;
    if (z === 'in' || z === 'out') set(cur.style, zoomBBox(vb, z === 'in' ? 1.5 : 1 / 1.5));
    else if (z === 'fit') set(cur.style, null);
    else set({ ...MAP_STYLE }, cur.view);
    redraw();
  };
}

/** Wheel zoom, drag pan and double-click zoom on a map container. get() → {view, auto}; set(bbox); redraw(). */
function attachMapZoom(el, get, set, redraw) {
  const frameOf = (b) => mapFrame(b, get().style?.proj || 'plate');
  const lonlat = (e, b) => {
    const svg = el.querySelector('svg'); if (!svg) return null;
    const r = svg.getBoundingClientRect(), f = frameOf(b), k = r.width / f.W;
    return f.Pinv((e.clientX - r.left) / k, (e.clientY - r.top) / k);
  };
  let raf = 0;
  const zoomAt = (e, f) => { const c = get(), b = c.view || c.auto; if (!b) return; const p = lonlat(e, b); if (!p || !p.every(Number.isFinite)) return; set(zoomBBox(b, f, p[0], p[1])); cancelAnimationFrame(raf); raf = requestAnimationFrame(redraw); };
  el.addEventListener('wheel', (e) => { if (!el.querySelector('svg')) return; e.preventDefault(); zoomAt(e, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  el.addEventListener('dblclick', (e) => zoomAt(e, e.shiftKey ? 1 / 2 : 2));
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    const svg = el.querySelector('svg'); if (!svg || e.button !== 0) return;
    const c = get(), b = c.view || c.auto; if (!b) return;
    const p0 = lonlat(e, b); if (!p0) return;
    drag = { x: e.clientX, y: e.clientY, b, p0, moved: false }; el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    const svg = el.querySelector('svg');
    if (svg && Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; el.classList.add('dragging'); svg.style.transform = `translate(${dx}px, ${dy}px)`; }
  });
  const end = (e) => {
    if (!drag) return; const d = drag; drag = null; el.classList.remove('dragging'); const svg = el.querySelector('svg'); if (svg) svg.style.transform = '';
    if (!d.moved) return;
    const p1 = lonlat(e, d.b); if (!p1 || !p1.every(Number.isFinite)) return;
    set(zoomBBox(d.b, 1, null, null, d.p0[0] - p1[0], d.p0[1] - p1[1])); redraw();
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

/** PNG of a map at a chosen width (px); the raster background is downloaded again at that resolution (max. 4096 px). */
async function exportMapPNG(build, name, width) {
  const prev = bgWidth;
  try {
    bgWidth = Math.min(4096, width);
    let svg = build(); await Promise.all([...bgPromises.values()].map((p) => p.catch(() => {})));
    svg = build(); // second pass uses the high-resolution images now in the cache
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
    const k = width / img.width, c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png')); if (blob) await saveFile(name, blob, 'image/png');
  } finally { bgWidth = prev; }
}

// project map: style and extent are saved with the project (S.geo.map.style, S.geo.map.view)
const geoMapStyle = () => (S.geo.map.style = { ...MAP_STYLE, ...(S.geo.map.style || {}) });
let geoAutoBBox = null;
function refreshProjectMaps() { renderGeoMap(); scheduleFloat(); if (mode === 'fig') renderFigure(); }
const geoMapGet = () => ({ style: geoMapStyle(), view: S.geo.map.view || null, auto: geoAutoBBox });
attachMapZoom($('geoMapSvg'), geoMapGet, (b) => { S.geo.map.view = b; markDirty(); }, refreshProjectMaps);

// all-projects map: style and extent kept in this browser
let allStyle = { ...MAP_STYLE }, allView = null, allAutoBBox = null;
try { allStyle = { ...MAP_STYLE, ...JSON.parse(localStorage.getItem('ichantool.allMapStyle') || '{}') }; allView = JSON.parse(localStorage.getItem('ichantool.allMapView') || 'null'); } catch { /* storage blocked */ }
function saveAllStyle() { try { localStorage.setItem('ichantool.allMapStyle', JSON.stringify(allStyle)); localStorage.setItem('ichantool.allMapView', JSON.stringify(allView)); } catch { /* storage blocked */ } }
const allMapGet = () => ({ style: allStyle, view: allView, auto: allAutoBBox });
let allInterp = { ...INTERP_DEFAULT }, allOff = new Set(), allCoreItems = [], allVl = null;
try { allInterp = { ...INTERP_DEFAULT, ...JSON.parse(localStorage.getItem('ichantool.allInterp') || '{}') }; allOff = new Set(JSON.parse(localStorage.getItem('ichantool.allOff') || '[]')); } catch { /* storage blocked */ }
function saveAllInterp() { try { localStorage.setItem('ichantool.allInterp', JSON.stringify(allInterp)); localStorage.setItem('ichantool.allOff', JSON.stringify([...allOff])); } catch { /* storage blocked */ } }
function redrawAllMap() {
  allMapSvg = buildAllMap($('amMode').value); $('allMap').innerHTML = allMapSvg;
  mapStyleUI('amStyle', allMapGet, (s2, v) => { allStyle = s2; allView = v; saveAllStyle(); }, redrawAllMap);
  $('amInterp').hidden = $('amMode').value !== 'value';
  if ($('amMode').value === 'value') interpUI('amInterp', () => allInterp, saveAllInterp, redrawAllMap, allVl?.info);
  coreListUI('amCores', allCoreItems, allOff, saveAllInterp, redrawAllMap);
}
attachMapZoom($('allMap'), allMapGet, (b) => { allView = b; saveAllStyle(); }, redrawAllMap);
$('geoMapCtl').addEventListener('change', (e) => {
  const m = S.geo.map, el = e.target, num = (v) => (v === '' ? null : +v);
  if (el.id === 'gmA0') m.a0 = num(el.value); else if (el.id === 'gmA1') m.a1 = num(el.value); else if (el.id === 'gmMode') m.mode = el.value; else if (el.id === 'gmSrc') m.src = el.value;
  else if (el.id === 'gmFeature') m.feature = el.value; else if (el.id === 'gmIdw') m.idw = el.checked; else if (el.id === 'gmPower') m.power = +el.value;
  else if (el.id === 'gmRef') m.ref = el.checked; else if (el.id === 'gmR0') m.r0 = +el.value; else if (el.id === 'gmR1') m.r1 = +el.value;
  markDirty(); renderGeoMap();
});
for (const [id, dir] of [['gmPrev', -1], ['gmNext', 1]]) $(id).addEventListener('click', () => { const m = S.geo.map, w = m.a1 - m.a0; m.a0 += dir * w; m.a1 += dir * w; markDirty(); renderGeoMap(); });
$('gmPng').addEventListener('click', () => busy(() => exportMapPNG(() => renderGeoMap() || '', `${safe(S.name)}_mapa_${S.geo.map.a0}-${S.geo.map.a1}.png`, +$('gmPngW').value)));
$('gmBig').addEventListener('click', () => { $('work').classList.toggle('mapwide'); $('gmBig').setAttribute('aria-pressed', String($('work').classList.contains('mapwide'))); placeSplitters(); renderGeoMap(); });
$('gmFull').addEventListener('click', () => { const el = $('geoMapSvg'); if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.().catch(() => toast(t('ms.noFull'))); });
$('gmSvg').addEventListener('click', () => { if (geoLastMap) saveFile(`${safe(S.name)}_mapa_${S.geo.map.a0}-${S.geo.map.a1}.svg`, geoLastMap.svg, 'image/svg+xml'); });
$('gmCsv').addEventListener('click', () => {
  if (!geoLastMap) return;
  const rows = [['core', 'lat', 'lon', 'n_samples', 'dominant_class', 'fraction', 'value']];
  for (const p of geoLastMap.pts) rows.push([p.name, p.lat, p.lon, p.n, p.dominant ? geoCat(p.dominant)?.name : null, p.fraction, p.value]);
  saveFile(`${safe(S.name)}_mapa_${S.geo.map.a0}-${S.geo.map.a1}.csv`, withProv(toCSV(rows)), 'text/csv');
});

function renderGeoModel() {
  const box = $('geoModelOut'), st = S.geo.settings, target = geoLayer(st.target), g = S.geo, curC = curClf();
  // V26: comparison of every classifier and family, then the details of the selected one
  let cmp = '';
  if (g.classifiers.length) {
    const rows = g.classifiers.flatMap((c) => c.targets.map((lid) => { const r = geoRT.runs.get(c.id)?.byTarget.get(lid), cv = r?.cv;
      return `<tr data-c="${c.id}" data-l="${lid}" class="${c === curC && lid === st.target ? 'sel' : ''}"><td>⚙ ${esc(c.name)}</td><td>${esc(geoLayer(lid)?.name || '')}</td><td>${t('geo.m.name.' + c.method)}</td>
        <td>${cv ? fmt(cv.balancedAccuracy * 100, 1) + ' %' : r?.error ? `<span class="warn">${t(r.error)}</span>` : '—'}</td><td>${cv ? fmt(cv.accuracy * 100, 1) + ' %' : '—'}</td><td>${r?.model?.n ?? '—'}</td></tr>`; })).join('');
    cmp = `<h3>${t('cl.compare')}</h3><div class="tablewrap"><table class="cmpt"><thead><tr><th>${t('cl.clf')}</th><th>${t('cl.family')}</th><th>${t('cl.model')}</th><th title="${esc(t('gx.baccTip'))}">${t('geo.bacc')}</th><th title="${esc(t('gx.accTip'))}">${t('geo.acc')}</th><th>n</th></tr></thead><tbody>${rows}</tbody></table></div><p class="note">${t('cl.compareNote')}</p>`;
  } else { box.innerHTML = `<p class="note">${t('cl.empty')}</p><button class="btn primary" id="geoModelNew">${t('cl.add')}</button>`; $('geoModelNew').onclick = () => newClassifier(); return; }
  const counts = {}; geoRT.labels.forEach((l) => { if (l.label) counts[l.label] = (counts[l.label] || 0) + 1; });
  const nInt = geoRT.labels.filter((l) => l.source === 'interval').length, nRule = geoRT.labels.filter((l) => l.source === 'rule').length;
  const mc = geoRT.model?.isNum || (curC ? clfCols(curC).map((j) => j < (geoRT.nNum ?? 0)) : []), nn = mc.filter(Boolean).length;
  let html = cmp + `<h3>⚙ ${esc(curC?.name || '')} → ${esc(target?.name || '')}</h3><p class="note">${t('geo.modelIntro', { l: esc(target?.name || ''), v: nn, c: mc.length - nn })}</p>`;
  html += `<div class="stat"><div data-tip="${esc(t('gx.tip.samples'))}"><b>${geoRT.samples.length}</b><span>${t('geo.samples')}</span></div><div data-tip="${esc(t('gx.tip.byIv'))}"><b>${nInt}</b><span>${t('geo.byIntervals')}</span></div><div data-tip="${esc(t('gx.tip.byRule'))}"><b>${nRule}</b><span>${t('geo.byRules')}</span></div></div>`;
  html += `<div class="bars">${Object.entries(counts).map(([id, n]) => { const c = geoCat(id); return `<div><span><span class="swatch" style="background:${c?.color}"></span>${esc(c?.name || id)}</span><em>${n}</em></div>`; }).join('')}</div>`;
  if (!geoRT.model || !geoRT.preds.length) { box.innerHTML = html + `<p class="note">${t(geoRT.model ? 'geo.retrain' : 'geo.notTrained')}</p><button class="btn primary" id="geoModelTrain">${t('geo.modelTrain')}</button>`; $('geoModelTrain').onclick = () => curC && geoTrain(false, curC.id); return; }
  html += `<h3>${t('geo.m.name.' + geoRT.model.kind)} · ${t('geo.trainedOn', { n: geoRT.model.n ?? '' })}${geoRT.model.kind === 'mlp' ? ` · ${t('cl.mlpInfo', { s: geoRT.model.sizes.join('–'), e: geoRT.model.epochs })}` : ''}</h3>`;
  if (geoRT.cv) {
    const cv = geoRT.cv, name = (id) => esc(geoCat(id)?.name || id);
    html += `<p>${t('geo.cvScheme.' + (cv.scheme === 'leave-one-core-out' ? 'loco' : 'blocks'), { k: cv.folds })}: <span data-tip="${esc(t('gx.accTip'))}">${t('geo.acc')} <b>${fmt(cv.accuracy * 100, 1)}%</b></span> · <span data-tip="${esc(t('gx.baccTip'))}">${t('geo.bacc')} <b>${fmt(cv.balancedAccuracy * 100, 1)}%</b></span> (n = ${cv.total})</p>`;
    if (cv.foldBalanced?.n > 1 && cv.foldBalanced.sd != null) html += `<p class="note">${t('cv.fold', { m: fmt(cv.foldBalanced.mean * 100, 1), sd: fmt(cv.foldBalanced.sd * 100, 1), n: cv.foldBalanced.n })}</p>`;
    if (cv.coverage) html += `<p class="note">${t('cv.cover', { p: cv.coverage.minProb, s: fmt(cv.coverage.share * 100, 1), a: cv.coverage.accuracy == null ? '—' : fmt(cv.coverage.accuracy * 100, 1) })}</p>`;
    if (nRule) html += `<p class="note">${t('cv.rules')}</p>`;
    html += `<div class="tablewrap"><table><thead><tr><th data-tip="${esc(t('gx.cmTip'))}">${t('geo.trueVsPred')}</th>${cv.classes.map((c) => `<th>${name(c)}</th>`).join('')}<th>${t('geo.recall')}</th></tr></thead><tbody>${cv.classes.map((c, i) => `<tr><th>${name(c)}</th>${cv.cm[i].map((v, j) => `<td style="${i === j ? 'font-weight:600' : ''}" data-tip="${esc(t(i === j ? 'gx.cmOk' : 'gx.cmBad', { n: v, a: geoCat(c)?.name || c, b: geoCat(cv.classes[j])?.name || cv.classes[j] }))}">${v}</td>`).join('')}<td data-tip="${esc(t('gx.recallTip', { a: geoCat(c)?.name || c, p: fmt((cv.perClass[i].recall ?? 0) * 100, 0) }))}">${fmt((cv.perClass[i].recall ?? 0) * 100, 0)}%</td></tr>`).join('')}</tbody></table></div>`;
    html += `<p class="note">${t('geo.cvNote')}</p>`;
  } else html += `<p class="note">${t('geo.kmeansNote')}</p>${geoRT.model.classes.map((c) => `<label class="f"><span><span class="swatch" style="background:${geoCat(c)?.color}"></span>${c}</span><input type="text" data-group="${c}" value="${esc(S.geo.groupNames[c] || '')}" placeholder="${t('geo.groupName')}"></label>`).join('')}`;
  if (geoRT.model.importance) {
    const imp = geoRT.model.features.map((k, j) => [k, geoRT.model.importance[j]]).sort((a, b) => b[1] - a[1]);
    html += `<h3>${t('geo.importance')}</h3><div class="bars">${imp.map(([k, v]) => `<div><span>${esc(k)}<i style="width:${Math.max(2, v * 100)}%;background:var(--accent)"></i></span><em>${fmt(v * 100, 1)}%</em></div>`).join('')}</div><p class="note">${t('geo.importanceNote')}</p>`;
  }
  html += `<details class="mini"${S.cores.some((c) => c.holdout) ? ' open' : ''}><summary>${t('ft.title')}</summary><p class="note">${t('ft.intro')}</p>${holdoutHTML()}
    ${curC && geoRT.model?.kind !== 'kmeans' ? `<button class="btn small primary" type="button" id="geoFinalBtn">${t('ft.run')}</button>` : ''}${finalTestsHTML('geo')}</details>`;   // V0.49
  box.innerHTML = html;
  $('geoFinalBtn') && ($('geoFinalBtn').onclick = () => { if (confirm(t('ft.confirm'))) runFinalGeo(curC); });
}
$('geoModelOut').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-c]'); if (!tr) return; S.geo.view.clf = tr.dataset.c; S.geo.view.clfTarget = tr.dataset.l; syncCurrent(); renderGeoPanel(); renderGeoModel(); });
$('geoModelOut').addEventListener('change', (e) => { const g = e.target.dataset.group; if (!g) return; S.geo.groupNames[g] = e.target.value; markDirty(); scheduleLog(); });
$('geoPredCsv').addEventListener('click', () => {
  if (!geoRT.samples.length) return;
  const st = S.geo.settings, rows = [['core', st.axis, 'depth', 'age', ...geoRT.featNames, 'label', 'label_source', 'predicted', 'probability']];
  geoRT.samples.forEach((s, i) => rows.push([geoCore(s.core)?.name, s.x, s.depth, s.age, ...s.raw, geoCat(geoRT.labels[i]?.label)?.name ?? '', geoRT.labels[i]?.source ?? '', geoCat(geoRT.preds[i]?.label)?.name ?? '', geoRT.preds[i]?.prob]));
  saveFile(`${safe(S.name)}_clasificacion_intervalos.csv`, withProv(toCSV(rows)), 'text/csv');
});

/** Interval layers and automatic classes of the image core, as bands of the composite log (overlay between tools). */
export function geoOverlay(axis) {
  const core = geoCore(S.curCore); if (!core) return {};
  const bands = coreBands(core, axis);
  return bands.length ? { bands, bandLegend: bandLegendOf(bands) } : {};
}

/* ───────────── home: projects, all-projects data and multiproject maps ───────────── */

async function showHome() {
  if (VIEW_ONLY) return;
  await flushSave();
  $('home').hidden = false;
  await renderProjects(); renderBackupState(); await loadLand(); await renderAllProjects();
}
function hideHome() { $('home').hidden = true; requestAnimationFrame(resizeCanvases); setTimeout(updateTip, 0); }

let allLite = [], allMapSvg = '';
async function renderAllProjects() {
  if (!storageOK) { $('allMap').innerHTML = `<p class="note">${t('save.off')}</p>`; return; }
  allLite = (await listLite().catch(() => [])).filter((l) => l.kind !== 'multi').sort((a, b) => a.name.localeCompare(b.name));
  const vars = new Set(), layers = new Set();
  for (const l of allLite) { for (const c of l.cores) Object.keys(c.proxies || {}).forEach((k) => vars.add(k)); for (const L of l.layers || []) if ((l.intervals || []).some((q) => q.layer === L.id)) layers.add(L.name); }
  const fill = (id, list) => { const el = $(id), cur = el.value; el.innerHTML = [...list].sort().map((v) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join(''); };
  fill('amVar', vars); fill('amLayer', layers);
  const mode = $('amMode').value;
  $('amVarRow').hidden = mode !== 'value'; $('amLayRow').hidden = mode !== 'class';
  renderMpCount();
  const shared = sharedCores(allLite), q = coreKey($('homeSearch').value);
  const rows = allLite.flatMap((l) => l.cores.map((c) => ({ l, c }))).filter(({ l, c }) => !q || coreKey(c.name).includes(q) || coreKey(l.name).includes(q))
    .sort((a, b) => coreKey(a.c.name).localeCompare(coreKey(b.c.name)) || a.l.name.localeCompare(b.l.name));
  $('allTable').innerHTML = `<thead><tr><th></th><th>${t('geo.core')}</th><th>${t('home.project')}</th><th>Lat</th><th>Lon</th><th>${t('home.nVars')}</th><th>${t('geo.ivs')}</th><th>${t('home.images')}</th></tr></thead><tbody>${
    rows.map(({ l, c }) => { const n = shared.get(coreKey(c.name))?.size || 1; return `<tr data-p="${l.id}" data-c="${c.id}" style="cursor:pointer"><td><input type="checkbox" class="mpchk" ${mpSel.has(`${l.id}|${c.id}`) ? 'checked' : ''}></td><td class="txt">${esc(c.name)}${n > 1 ? ` <span class="sharedtag" title="${esc(t('home.alsoIn', { p: [...shared.get(coreKey(c.name)).values()].filter((x) => x !== l.name).join(', ') }))}">${t('home.inN', { n })}</span>` : ''}</td><td class="txt">${esc(l.name)}</td><td>${fmt(c.lat, 3)}</td><td>${fmt(c.lon, 3)}</td><td>${Object.keys(c.proxies || {}).length}</td><td>${(l.intervals || []).filter((iv) => iv.core === c.id).length}</td><td>${c.nImages || 0}</td></tr>`; }).join('')}</tbody>`;
  redrawAllMap();
}

/** Map of the cores of every project: sites, mean within-core z-score of a variable, or dominant category of a layer (by name). */
function buildAllMap(mode) {
  const a0 = +$('amA0').value, a1 = +$('amA1').value, pts = [], colors = {}, legend = [];
  allLite.forEach((l, pi) => {
    for (const c of l.cores) {
      if (c.lat == null || c.lon == null) continue;
      const p = { name: c.name, lat: c.lat, lon: c.lon, n: 0, key: `${l.id}|${c.id}`, project: l.name };
      const ages = coreAges(c);
      if (mode === 'sites') { p.n = 1; p.dominant = l.id; p.fraction = null; if (!colors[l.id]) { colors[l.id] = GROUP_COLORS[pi % GROUP_COLORS.length]; legend.push([l.name, colors[l.id]]); } }
      else if (mode === 'value') {
        const v = c.proxies?.[$('amVar').value];
        if (v && ages) {
          const ok = v.map((x, i) => [x, ages[i]]).filter(([x, a]) => x != null && a != null);
          const m = ok.reduce((s2, q) => s2 + q[0], 0) / (ok.length || 1), sd = Math.sqrt(ok.reduce((s2, q) => s2 + (q[0] - m) ** 2, 0) / (ok.length || 1)) || 1;
          const win = ok.filter(([, a]) => a >= a0 && a < a1).map(([x]) => (x - m) / sd);
          if (win.length) { p.n = win.length; p.value = win.reduce((s2, x) => s2 + x, 0) / win.length; }
        }
      } else {
        const L = (l.layers || []).find((x) => x.name === $('amLayer').value);
        if (L) {
          const ivs = intervalsOnAxis((l.intervals || []).filter((q) => q.core === c.id && q.layer === L.id && !q.auto), 'age', c), cover = {};
          for (const q of ivs) { const o = Math.min(q.to, a1) - Math.max(q.from, a0); if (o > 0) cover[q.cat] = (cover[q.cat] || 0) + o; }
          const best = Object.entries(cover).sort((x, y) => y[1] - x[1])[0];
          if (best) {
            const cat = L.cats.find((k) => k.id === best[0]); p.n = 1; p.dominant = cat?.name || best[0]; p.fraction = best[1] / (a1 - a0);
            if (!colors[p.dominant]) { colors[p.dominant] = cat?.color || '#999'; legend.push([p.dominant, colors[p.dominant]]); }
          }
        }
      }
      pts.push(p);
    }
  });
  // the same core in several projects is one point: value = mean of the projects that have data; category = first with data
  const groups = new Map();
  for (const p of pts) { const k = 'ck:' + coreKey(p.name); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const merged = [...groups.entries()].map(([k, g]) => {
    const withData = g.filter((p) => p.n), base = { ...(withData[0] || g[0]) };
    if (mode === 'value' && withData.length > 1) { base.value = withData.reduce((a, p) => a + p.value, 0) / withData.length; base.n = withData.reduce((a, p) => a + p.n, 0); }
    base.key = k; base.project = [...new Set(g.map((p) => p.project))].join(', '); base.nProjects = new Set(g.map((p) => p.project)).size;
    return base;
  });
  allCoreItems = merged.map((p) => ({ id: p.key, name: p.nProjects > 1 ? `${p.name} (${p.nProjects})` : p.name, lat: p.lat, where: p.project }));
  pts.length = 0; pts.push(...merged.filter((p) => !allOff.has(p.key)));
  if (!pts.length) return `<p class="note" style="padding:16px">${t('home.noSites')}</p>`;
  const fr = frameRatio('amFrame');
  let auto = mapBBox(pts); auto[2] += 3; if (fr) { auto = fitBBoxAspect(auto, fr, allStyle.proj); if (allView) allView = fitBBoxAspect(allView, fr, allStyle.proj); } allAutoBBox = auto;
  const bbox = allView || auto;
  const nx = 90, ny = Math.max(10, Math.round((90 * (bbox[3] - bbox[1])) / ((bbox[2] - bbox[0]) * Math.cos((((bbox[1] + bbox[3]) / 2) * Math.PI) / 180))));
  const bg = mapBackground(allStyle.bg, bbox, redrawAllMap, allStyle.proj);
  const vl = mode === 'value' ? valueLayer(pts, bbox, allInterp, `z ${$('amVar').value}`) : null; allVl = vl;
  const title = mode === 'sites' ? t('home.mapSites') : mode === 'value' ? t('home.mapValue', { f: $('amVar').value, a0, a1 }) : t('home.mapLayer', { l: $('amLayer').value, a0, a1 });
  return buildMapSVG({ tipFn: (p) => mapTip(p, mode, $('amVar').value), land: geoLand, bbox, points: pts, mode: mode === 'value' ? 'value' : 'class', colors, legend, title, ...(vl ? { grid: vl.grid, nx: vl.nx, ny: vl.ny, colorFn: vl.colorFn, contours: vl.contours, contourLabels: vl.contourLabels, gridOpacity: vl.gridOpacity, colorbar: vl.colorbar } : {}), subtitle: t('home.mapSub', { n: allLite.length }), note: t('geo.mapNote'), style: allStyle, bg });
}
$('allCtl').addEventListener('change', () => renderAllProjects());
for (const [id, dir] of [['amPrev', -1], ['amNext', 1]]) $(id).addEventListener('click', () => { const a = +$('amA0').value, b = +$('amA1').value, w = b - a; $('amA0').value = a + dir * w; $('amA1').value = b + dir * w; renderAllProjects(); });
$('amPng').addEventListener('click', () => busy(() => exportMapPNG(() => buildAllMap($('amMode').value), 'sedcoretool_mapa_proyectos.png', +$('amPngW').value)));
$('amSvg').addEventListener('click', () => { if (allMapSvg.startsWith('<svg')) saveFile('sedcoretool_mapa_proyectos.svg', allMapSvg, 'image/svg+xml'); });
$('allTable').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr[data-p]'); if (!tr) return;
  const { p, c } = tr.dataset;
  if (e.target.classList.contains('mpchk')) { const k = `${p}|${c}`; if (e.target.checked) mpSel.add(k); else mpSel.delete(k); renderMpCount(); return; }
  if (p !== S.id) { await flushSave(); await busy(async () => { const d = await getProject(p); if (d) await loadProject(d); }); }
  activateCore(c, true); hideHome();
});

/* ───────────── training project, help cards and guided tour (V19) ───────────── */
const TUTORIAL_ID = 'tutorial-corantool';
/** Builds the synthetic training project (examples/tutorial, tools/make_tutorial.py): 7 fictitious cores, intervals and one core image with half of its traces labelled. */
async function buildTutorialProject() {
  const txt = async (f) => (await fetchAsset('tutorial/' + f)).text();
  await flushSave(); resetState();
  S.id = TUTORIAL_ID; S.name = t('tut.name'); S.kind = 'tutorial'; S.notes = t('tut.notes'); S.settings.tips = true;
  const tab = parseTable(await txt('cores.csv')), H = tab.headers, ix = (n) => H.indexOf(n), P = H.slice(5);
  const cores = coresFromLongTable(tab, { core: ix('core'), lat: ix('lat'), lon: ix('lon'), depth: ix('depth_cm'), age: ix('age_ka'), proxies: P.map(ix) });
  const am = parseTable(await txt('age_models.csv'));
  S.cores = [];
  for (const c of cores) {
    c.units = 'cm'; c.ageText = am.rows.filter((r) => r[0] === c.name).map((r) => `${r[1]},${r[2]}`).join('\n');
    addImported(c, 'tutorial', 'tut-' + c.name);
  }
  applyCatalogue(S.cores, parseTable(await txt('catalogue.csv')), { core: 0, lat: 1, lon: 2, wd: 3 });
  for (const c of S.cores) c.notes = t('tut.coreNote');
  const g = S.geo;
  addNamedIntervals(intervalsFromTable(parseTable(await txt('intervals_depth.csv')), { core: 0, from: 1, to: 2, layer: 3, values: [4] }), 'depth');
  addNamedIntervals(intervalsFromTable(parseTable(await txt('intervals_age.csv')), { core: 0, from: 1, to: 2, layer: 3, values: [4] }), 'age');
  const col = { Sapropel: '#4a2f63', ORL: '#2b6f8f', 'Fuera de capa orgánica': '#d9d2bf', Turbidita: '#c07a2c', Tefra: '#9a9a9a', Holoceno: '#f2c14e', 'Younger Dryas': '#5b8bd9', 'Bølling-Allerød': '#e07a3f', HS1: '#8fc1e3', 'Último Máximo Glacial': '#2c4f8c' };
  for (const l of g.layers) for (const k of l.cats) if (col[k.name]) k.color = col[k.name];
  const org = g.layers.find((l) => l.name === 'Capas orgánicas');
  Object.assign(g.settings, { features: ['XRF Ti/Ca', 'XRF Ba/Ti', 'XRF Mn/Ti', 'XRF Fe/Ca', 'XRF Zr/Rb', 'XRF Br/Cl', 'TOC_pct', 'Bentonicos_bajo_O2_pct', 'Bioturbacion_pct'],
    logs: ['XRF Ba/Ti', 'TOC_pct', 'XRF Ti/Ca'], axis: 'age', step: 0.5, scaling: 'core', missing: 'mean', target: org?.id || g.settings.target, useLayers: [] });
  g.map = { ...g.map, a0: 6, a1: 10, mode: 'class', style: { ...MAP_STYLE, symbol: 'diamond' } };
  // core image of ENT-03 with half of the true traces labelled
  const core = S.cores.find((c) => c.name === 'ENT-03');
  activateCore(core.id, true);
  const bytes = new Uint8Array(await (await fetchAsset('tutorial/tutorial_core.jpg')).arrayBuffer());
  const truth = JSON.parse(await txt('tutorial_truth.json'));
  const { w, h, rgba } = await decodeBytes(bytes, 'tutorial_core.jpg', 'image/jpeg', { k: 1 });
  const s = newSection({ name: 'ENT-03 · 0-150 cm', file: { name: 'tutorial_core.jpg', type: 'image/jpeg', bytes }, w, h, orig: rgba, full: { w, h } });
  s.top = truth.top_cm; s.bottom = truth.bottom_cm; s.units = 'cm';
  s.detect = { ...DEFAULT_DETECT, method: 'global', polarity: 'dark', threshold: 105, minArea: 12, smooth: 1 };
  S.sections.push(s); syncSettingsForm(); selectSection(S.sections.length - 1, true);
  await detectSection(s);
  truth.traces.forEach((q, i) => {
    if (i % 2) return; // the other half stays for the suggestions
    const cls = S.classes.find((c) => c.name === q.taxon); if (!cls) return;
    const id = topLab(s, Math.round(q.y) * s.w + Math.round(q.x));
    const o = id > 0 ? s.objects.get(id) : null; if (o && !o.cls) o.cls = cls.id;
  });
  renderCoreBar(); refreshAllCores(); updateProjHeader(); renderRecList(); setAge(); learnNow(); geoReset(); geoMarkDirty();
  await saveToDB();
}
async function openTutorial(withTour = true) {
  hideHome();
  await busy(async () => {
    const have = (await listProjects().catch(() => [])).some((m) => m.id === TUTORIAL_ID);
    if (have) { const d = await getProject(TUTORIAL_ID); if (d) await loadProject(d); } else await buildTutorialProject();
  });
  setMode('section'); updateTip();
  if (withTour) startTour(0);
}
$('openTutorial').addEventListener('click', () => openTutorial(true));

$('tourBtn').addEventListener('click', () => { $('help').close(); startTour(0); });
$('hoverHelpToggle').checked = hoverHelp;
$('hoverHelpToggle').addEventListener('change', (e) => { hoverHelp = e.target.checked; tipHide(); try { localStorage.setItem('ichantool.hoverHelp', hoverHelp ? '1' : '0'); } catch { /* storage blocked */ } });
$('tipsToggle').addEventListener('change', (e) => { S.settings.tips = e.target.checked; markDirty(); updateTip(); });

/* help card of the current tab */
function tipContext() {
  if (!$('home').hidden) return null;
  if (mode === 'section') return 'section.' + ($('sideTabs').querySelector('[aria-selected="true"]')?.dataset.tab || 'classes');
  if (mode === 'geo') return 'geo.' + (S.geo.view.tab || 'logs');
  return mode;
}
function updateTip() {
  const box = $('tipCard'), on = S.settings.tips ?? S.kind === 'tutorial', ctx = tipContext();
  $('tipsToggle').checked = !!on;
  if (!on || !ctx || tourStep >= 0) { box.hidden = true; return; }
  box.innerHTML = `<b>💡 ${t('tip.title')}</b><div>${t('tip.' + ctx)}</div><div class="row"><button class="btn small primary" data-tipact="tour">${t('tip.tour')}</button><button class="btn small ghost" data-tipact="hide">${t('tip.hide')}</button></div>`;
  box.hidden = false;
}
$('tipCard').addEventListener('click', (e) => {
  const a = e.target.closest('[data-tipact]')?.dataset.tipact; if (!a) return;
  if (a === 'hide') { S.settings.tips = false; markDirty(); updateTip(); }
  else { const ctx = tipContext(), k = TOUR.findIndex((st) => st.ctx === ctx || (ctx && st.ctx && ctx.startsWith(st.ctx))); startTour(Math.max(0, k)); }
});

/* guided tour: each step highlights one element (switching mode, side tab or start screen first) */
const TOUR = [
  { sel: '#projBtn' }, { sel: '.corebar' }, { mode: 'section', ctx: 'section', sel: '#modeSection' },
  { mode: 'section', sel: '#addImg' }, { mode: 'section', sel: '#fPreset' }, { mode: 'section', sel: '#detectBtn' }, { mode: 'section', sel: '#tools' },
  { mode: 'section', pane: 'classes', ctx: 'section.classes', sel: '#classList' }, { mode: 'section', pane: 'object', ctx: 'section.object', sel: '#objInfo', pick: true },
  { mode: 'section', pane: 'learn', ctx: 'section.learn', sel: '#mlOpen' }, { mode: 'section', pane: 'results', ctx: 'section.results', sel: '#resSummary' },
  { mode: 'log', ctx: 'log', sel: '#logTracks' }, { mode: 'data', ctx: 'data', sel: '#dataView' },
  { mode: 'geo', geoTab: 'logs', ctx: 'geo', sel: '#geoPanel' }, { mode: 'geo', geoTab: 'logs', sel: '#geoLayerSel' }, { mode: 'geo', geoTab: 'logs', sel: '#geoFeats' },
  { mode: 'geo', geoTab: 'logs', sel: '#geoTrainBtn' }, { mode: 'geo', geoTab: 'logs', sel: '#geoLogSvg' }, { mode: 'geo', geoTab: 'map', ctx: 'geo.map', sel: '#geoMapSvg' },
  { mode: 'geo', geoTab: 'model', ctx: 'geo.model', sel: '#geoModelOut', train: true }, { mode: 'fig', ctx: 'fig', sel: '#figPanel' },
  { home: 'projects', sel: '#projList' }, { home: 'all', sel: '#allMap' }, { home: 'all', sel: '.mpbox' }, { sel: '#helpBtn' },
];
// texts follow the order above: tour.<i>.t/b were written for the old order (home steps first), remapped here
const TOUR_TEXT = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 24];
let tourStep = -1;
function startTour(k = 0) { tourStep = k; $('tipCard').hidden = true; showTourStep(); }
function endTour() { tourStep = -1; $('tour').hidden = true; updateTip(); }
async function showTourStep() {
  const st = TOUR[tourStep]; if (!st) { endTour(); return; }
  if (st.home) { if ($('home').hidden) await showHome(); setHomeTab(st.home); } else if (!$('home').hidden) hideHome();
  if (st.mode && mode !== st.mode) setMode(st.mode);
  if (st.pane) showTab(st.pane);
  if (st.geoTab && S.geo.view.tab !== st.geoTab) { S.geo.view.tab = st.geoTab; renderGeo(); }
  if (st.train && !geoRT.model && !$('geoTrainBtn').disabled) { await geoTrain(); renderGeo(); }
  if (st.pick && !S.selected) { const s = sec(), o = s && [...s.objects.values()].find((q) => !q.cls && q.bbox && q.feat); if (o) { centerOn(o); select(o.id); showTab('object'); } }
  await new Promise((r) => setTimeout(r, st.home ? 700 : 260));
  const el = document.querySelector(st.sel); el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  const r = el?.getBoundingClientRect(), ov = $('tour'), hl = ov.querySelector('.tourhl'), box = ov.querySelector('.tourbox');
  ov.hidden = false;
  if (r && r.width && r.height) Object.assign(hl.style, { display: 'block', left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${Math.min(r.height, innerHeight - 24) + 12}px` });
  else hl.style.display = 'none';
  box.innerHTML = `<div class="tourn">${tourStep + 1} / ${TOUR.length}</div><h3>${t(`tour.${TOUR_TEXT[tourStep]}.t`)}</h3><div>${t(`tour.${TOUR_TEXT[tourStep]}.b`)}</div>
    <div class="row" style="justify-content:space-between"><button class="btn small ghost" data-tour="end">${t('tour.end')}</button><span class="row"><button class="btn small" data-tour="prev" ${tourStep ? '' : 'disabled'}>◀ ${t('tour.prev')}</button><button class="btn small primary" data-tour="next">${tourStep === TOUR.length - 1 ? t('tour.finish') : t('tour.next') + ' ▶'}</button></span></div>`;
  // bubble beside the element (below if there is room, else above, else centred)
  const bw = Math.min(380, innerWidth - 24); box.style.width = bw + 'px';
  const bh = box.offsetHeight || 220;
  let left = r && r.width ? Math.min(Math.max(12, r.left), innerWidth - bw - 12) : (innerWidth - bw) / 2, top;
  if (r && r.width && r.bottom + bh + 18 < innerHeight) top = r.bottom + 14;
  else if (r && r.width && r.top - bh - 18 > 0) top = r.top - bh - 14;
  else if (r && r.width && r.right + bw + 24 < innerWidth) { left = r.right + 16; top = Math.max(12, Math.min(r.top, innerHeight - bh - 12)); }
  else top = (innerHeight - bh) / 2;
  Object.assign(box.style, { left: `${left}px`, top: `${top}px` });
}
$('tour').addEventListener('click', (e) => {
  const a = e.target.closest('[data-tour]')?.dataset.tour; if (!a) return;
  if (a === 'end') endTour(); else { tourStep += a === 'next' ? 1 : -1; if (tourStep >= TOUR.length) endTour(); else showTourStep(); }
});
window.addEventListener('keydown', (e) => {
  if (tourStep < 0 || e.target.closest('input, textarea, select')) return;
  if (e.key === 'Escape') endTour(); else if (e.key === 'ArrowRight') { tourStep++; if (tourStep >= TOUR.length) endTour(); else showTourStep(); } else if (e.key === 'ArrowLeft' && tourStep > 0) { tourStep--; showTourStep(); }
});
window.addEventListener('resize', () => { if (tourStep >= 0) showTourStep(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('home').hidden && tourStep < 0 && !document.querySelector('dialog[open]') && S.cores.length) hideHome(); });

/* ───────────── models and training dialog (V18): guide, method and parameters, evaluation, examples ───────────── */
/** Small cached image of a labelled trace (JPEG data URL), for the example galleries. */
function thumbOf(s, o) {
  if (o._thumb) return o._thumb;
  try { if (s.enh && o.bbox) o._thumb = traceCanvas(s, o, 64, 'enh', true).canvas.toDataURL('image/jpeg', 0.7); } catch { /* try again next time */ }
  return o._thumb || null;
}
let mlTab = 'guide', mlScope = null, mlOtherProj = '';
const mlPicked = new Set();
function openMl(tab) { if (tab) mlTab = tab; mlScope ||= S.settings.clfScope || 'project'; renderMl(); if (!$('mlDlg').open) $('mlDlg').showModal(); }
$('mlOpen').addEventListener('click', () => openMl());
$('mlClose').addEventListener('click', () => $('mlDlg').close());
$('mlTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-mltab]'); if (b) { mlTab = b.dataset.mltab; renderMl(); } });

function renderMl() {
  for (const b of document.querySelectorAll('[data-mltab]')) b.setAttribute('aria-selected', String(b.dataset.mltab === mlTab));
  const box = $('mlBody');
  if (mlTab === 'guide') box.innerHTML = t('ml.guide') + mlRecommendation();
  else if (mlTab === 'train') box.innerHTML = mlTrainHTML();
  else if (mlTab === 'examples') box.innerHTML = mlExamplesHTML();
  else box.innerHTML = mlOthersHTML();
}

/** Plain-language recommendation from the counts and, if done, from the last evaluation. */
function mlRecommendation() {
  const sets = mlSets(), cnt = (sc) => { const c = {}; for (const e of sets[sc]) c[e.y] = (c[e.y] || 0) + 1; return c; };
  const few = Object.entries(cnt('project')).filter(([, n]) => n < 10).map(([k]) => k);
  let h = `<h3>${t('ml.rec')}</h3><ul>`;
  if (!sets.project.length) h += `<li>${t('ml.recNone')}</li>`;
  else {
    h += `<li>${t('ml.recCounts', { c: sets.core.length, p: sets.project.length, a: sets.all.length })}</li>`;
    if (few.length) h += `<li>${t('ml.recFew', { l: few.map(esc).join(', ') })}</li>`;
    if (mlEval?.best) { const b = mlEval.best; h += `<li><b>${t('ml.recBest', { s: t('l.scope.' + b.scope), m: t('ml.m.' + b.method), v: Math.round(b.balanced * 100) })}</b> ${b.close ? t('ml.recClose') : ''}</li>`; }
    else h += `<li>${t('ml.recEval')}</li>`;
  }
  return h + '</ul>';
}

function mlTrainHTML() {
  const m = { ...ML_DEFAULT, ...(S.settings.ml || {}) }, num = (k, a, b, st) => `<input type="number" data-ml="${k}" min="${a}" max="${b}" step="${st}" value="${m[k]}" style="width:80px">`;
  const methods = ['knn', 'rf', 'nb'].map((k) => `<label class="mlm ${m.method === k ? 'on' : ''}"><input type="radio" name="mlMethod" data-ml="method" value="${k}" ${m.method === k ? 'checked' : ''}><b>${t('ml.m.' + k)}</b><span class="note">${t('ml.d.' + k)}</span></label>`).join('');
  const params = m.method === 'knn' ? `<label class="f"><span>${t('ml.p.k')}</span>${num('k', 1, 25, 1)}</label><label class="f"><span>${t('ml.p.weights')}</span><select data-ml="weights"><option value="distance" ${m.weights === 'distance' ? 'selected' : ''}>${t('ml.p.wDist')}</option><option value="uniform" ${m.weights === 'uniform' ? 'selected' : ''}>${t('ml.p.wUni')}</option></select></label>`
    : m.method === 'rf' ? `<label class="f"><span>${t('ml.p.trees')}</span>${num('trees', 10, 500, 10)}</label><label class="f"><span>${t('ml.p.depth')}</span>${num('maxDepth', 2, 30, 1)}</label><label class="f"><span>${t('ml.p.leaf')}</span>${num('minLeaf', 1, 20, 1)}</label><label class="chk"><input type="checkbox" data-ml="balanced" ${m.balanced ? 'checked' : ''}><span>${t('ml.p.balanced')}</span></label>`
      : `<label class="f"><span>${t('ml.p.priors')}</span><select data-ml="priors"><option value="uniform" ${m.priors === 'uniform' ? 'selected' : ''}>${t('ml.p.pUni')}</option><option value="empirical" ${m.priors === 'empirical' ? 'selected' : ''}>${t('ml.p.pEmp')}</option></select></label>`;
  let ev = '';
  if (mlEval) {
    const r = mlEval.res, cell = (sc, me) => { const v = r[sc]?.[me]; const on = mlEval.best && mlEval.best.scope === sc && mlEval.best.method === me; return `<td class="${on ? 'on' : ''}">${v?.balanced == null ? '—' : `${Math.round(v.balanced * 100)}% <span class="note">(${Math.round(v.accuracy * 100)}%)</span>`}</td>`; };
    const b = mlEval.best, cm = b ? r[b.scope][b.method] : null;
    const r0 = Object.values(r)[0]?.knn || {};   // V0.37: validation scheme and optimism warning
    ev = `<h3>${t('ml.evalTitle')}</h3><p class="note">${t('ml.evalNote', { n: mlEval.nTest, w: t(mlEval.on === 'core' ? 'ml.onCore' : 'ml.onProject') })}</p>
      <p class="note ${r0.scheme === 'examples' ? 'warn' : ''}">${t('ml.scheme.' + (r0.scheme || 'groups'), { g: r0.nGroups ?? '?', f: r0.folds ?? '?', u: t('ml.cvGroup.' + (S.settings.ml?.cvGroup || 'section')).toLowerCase() })} ${t('ml.optimistic')}</p>
      <table class="dtable mtab"><thead><tr><th></th>${['knn', 'rf', 'nb'].map((me) => `<th>${t('ml.m.' + me)}</th>`).join('')}</tr></thead><tbody>${CLF_SCOPES.map((sc) => `<tr><td class="txt">${t('l.scope.' + sc)}</td>${['knn', 'rf', 'nb'].map((me) => cell(sc, me)).join('')}</tr>`).join('')}</tbody></table>
      ${b ? `<p>${t('ml.recBest', { s: t('l.scope.' + b.scope), m: t('ml.m.' + b.method), v: Math.round(b.balanced * 100) })} ${b.close ? t('ml.recClose') : ''} <button class="btn small primary" id="mlUseBest">${t('ml.useBest')}</button></p>
      <details><summary>${t('ml.cm')}</summary><p class="note">${t('ml.cmNote')}</p><div class="tablewrap"><table class="dtable mtab"><thead><tr><th>${t('ml.real')} \\ ${t('ml.pred')}</th>${cm.classes.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${cm.classes.map((c, i) => `<tr><td class="txt">${esc(c)}</td>${cm.cm[i].map((v, j) => `<td class="${i === j ? 'on' : ''}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>` : ''}`;
  }
  const fset = m.features || 'shape', pend = fset === 'vision' ? pendingEmb() : 0;   // V0.17: input vectors
  const feats = `<h3>${t('vis.title')}</h3><div class="mlmethods">${['shape', 'vision'].map((k) => `<label class="mlm ${fset === k ? 'on' : ''}"><input type="radio" name="mlFeat" data-ml="features" value="${k}" ${fset === k ? 'checked' : ''}><b>${t('vis.f.' + k)}</b><span class="note">${t('vis.d.' + k)}</span></label>`).join('')}</div>`
    + (fset === 'vision' ? `<p class="note">${VIS ? t('vis.ready', { n: esc(VIS.src) }) + (VIS.sha256 ? ` <span class="note" title="SHA-256 ${VIS.sha256}">(${VIS.sha256.slice(0, 12)}…)</span>` : '') : t('vis.none', { mb: VISION_MODEL.mb })} ${t('vis.pending', { n: pend })}</p><div class="row">${VIS ? '' : `<button class="btn small primary" id="visDl">${t('vis.dl', { mb: VISION_MODEL.mb })}</button><label class="btn small file"><span>${t('vis.file')}</span><input type="file" id="visFile" accept=".onnx"></label>`}<button class="btn small" id="visCalc" ${VIS && pend ? '' : 'disabled'}>${t('vis.calc', { n: pend })}</button></div>` : '');
  return `${feats}<h3>${t('ml.tab.train')}</h3><p class="note">${t('ml.trainIntro')}</p><div class="mlmethods">${methods}</div><div class="row" style="align-items:end;gap:12px">${params}
    <label class="f"><span>${t('l.novelty')}</span><input type="number" data-ml="novelty" min="1" max="8" step="0.5" value="${S.settings.novelty}" style="width:80px"></label></div>
    <p class="note">${t('ml.paramHelp.' + m.method)} ${t('ml.noveltyHelp')}</p>
    <div class="row"><button class="btn primary" id="mlEvalBtn">${t('ml.eval')}</button><label class="f"><span>${t('ml.cvGroup')}</span><select data-ml="cvGroup">${['section', 'core'].map((g) => `<option value="${g}" ${(m.cvGroup || 'section') === g ? 'selected' : ''}>${t('ml.cvGroup.' + g)}</option>`).join('')}</select></label><span class="note">${t('ml.evalHint')}</span></div>${ev}
    <h3>${t('ft.title')}</h3><p class="note">${t('ft.intro')}</p>${holdoutHTML()}
    <div class="row"><button class="btn primary" id="mlFinalBtn" ${S.cores.some((c) => c.holdout) ? '' : 'disabled'}>${t('ft.run')}</button><span class="note">${t('ft.ichnoHint')}</span></div>${finalTestsHTML('ichno')}`;   // V0.49
}

function runMlEval() {
  const sets = mlSets(), cur = S.cores.find((c) => c.id === S.curCore);
  const coreTest = ownExamples(cur ? [cur] : []), on = coreTest.length >= 10 && new Set(coreTest.map((e) => e.y)).size >= 2 ? 'core' : 'project';
  const test = on === 'core' ? coreTest : sets.project;
  if (test.length < 6 || new Set(test.map((e) => e.y)).size < 2) { toast(t('ml.evalNeed')); return; }
  const byCore = (S.settings.ml?.cvGroup || 'section') === 'core', group = (e) => (e.g == null ? null : byCore ? String(e.g).split('|').slice(0, 2).join('|') : e.g);   // V0.37
  const res = evaluateModels({ test, pools: sets, methods: ['knn', 'rf', 'nb'], opt: mlOpt(), k: 5, seed: 42, group });
  // best = highest balanced accuracy; when another option is within 3 points, the simpler one is preferred (k-NN, then naive Bayes, then RF; this core, then project)
  const order = { knn: 0, nb: 1, rf: 2 }, list = [];
  for (const sc of CLF_SCOPES) for (const me of ['knn', 'rf', 'nb']) if (res[sc][me].balanced != null) list.push({ scope: sc, method: me, balanced: res[sc][me].balanced });
  list.sort((a, b) => b.balanced - a.balanced);
  let best = list[0];
  if (best) { const near = list.filter((q) => best.balanced - q.balanced <= 0.03).sort((a, b) => order[a.method] - order[b.method] || CLF_SCOPES.indexOf(a.scope) - CLF_SCOPES.indexOf(b.scope)); best = { ...near[0], close: near.length > 1 }; }
  mlEval = { res, best, on, nTest: test.length, when: Date.now() };
  learnNow(); renderMl();
}

function mlExamplesHTML() {
  const sc = mlScope || 'project', sets = mlSets();
  let list = sc === 'core' ? ownExamples(S.cores.filter((c) => c.id === S.curCore), true) : ownExamples(S.cores, true);
  const lib = S.library.map((e, i) => ({ key: e.key || `lib|${i}`, y: e.name, lib: e, libIndex: i, thumb: e.thumb || null, where: `${t('ml.library')}${e.from ? ': ' + e.from : ''}` }));
  list = list.map((e) => ({ ...e, thumb: thumbOf(e.s, e.o), where: `${e.c.name} · ${e.s.name}`, excluded: !!e.o.nt })).concat(lib);
  if (sc === 'all') list = list.concat(otherExamples.filter((e) => !list.some((q) => q.key === e.key)).map((e) => ({ ...e, other: true, excluded: mlExcluded.has(e.key) })));
  const by = {}; for (const e of list) (by[e.y] ||= []).push(e);
  const used = sets[sc].length;
  const card = (e) => `<figure class="mlx ${e.excluded ? 'off' : ''}" data-key="${esc(e.key)}">${e.thumb ? `<img src="${e.thumb}" alt="" ${e.o ? 'data-go="1"' : ''}>` : `<div class="noimg">${t('ml.noImg')}</div>`}
    <figcaption title="${esc(e.where)}">${esc(e.where)}</figcaption>
    <div class="row">${e.lib ? `<button class="btn small ghost" data-act="libdel">${t('ml.remove')}</button>` : `<label class="chk"><input type="checkbox" data-act="use" ${e.excluded ? '' : 'checked'}><span>${t('ml.use')}</span></label>`}</div></figure>`;
  return `<div class="row" style="align-items:end"><label class="f"><span>${t('ml.exScope')}</span><select id="mlScopeSel">${CLF_SCOPES.map((k) => `<option value="${k}" ${k === sc ? 'selected' : ''}>${t('l.scope.' + k)}</option>`).join('')}</select></label>
    <span class="note">${t('ml.exCount', { n: used, t: list.length })}</span></div><p class="note">${t('ml.exHelp')}</p>
    ${Object.keys(by).sort().map((y) => `<h3>${esc(y)} <span class="note">${by[y].filter((e) => !e.excluded).length}/${by[y].length}${by[y].filter((e) => !e.excluded).length < 10 ? ' · ' + t('ml.fewWarn') : ''}</span></h3><div class="mlgrid">${by[y].map(card).join('')}</div>`).join('') || `<p class="note">${t('l.none')}</p>`}`;
}

function mlOthersHTML() {
  const projs = [...new Map(otherExamples.map((e) => [e.project, e.where.split(' · ')[0]])).entries()];
  if (!projs.length) return `<p class="note">${t('ml.othersNone')}</p>`;
  if (!projs.some(([id]) => id === mlOtherProj)) mlOtherProj = projs[0][0];
  const inLib = new Set(S.library.map((e) => e.key)), list = otherExamples.filter((e) => e.project === mlOtherProj);
  const by = {}; for (const e of list) (by[e.y] ||= []).push(e);
  return `<p class="note">${t('ml.othersIntro')}</p><div class="row" style="align-items:end"><label class="f"><span>${t('home.project')}</span><select id="mlOtherSel">${projs.map(([id, n]) => `<option value="${id}" ${id === mlOtherProj ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    <button class="btn small" id="mlPickAll">${t('mp.all')}</button><button class="btn small" id="mlPickNone">${t('mp.none')}</button><button class="btn small primary" id="mlAddLib">${t('ml.addLib', { n: mlPicked.size })}</button></div>
    ${Object.keys(by).sort().map((y) => `<h3>${esc(y)} <span class="note">${by[y].length}</span></h3><div class="mlgrid">${by[y].map((e) => `<figure class="mlx ${inLib.has(e.key) ? 'off' : ''}" data-key="${esc(e.key)}">${e.thumb ? `<img src="${e.thumb}" alt="">` : `<div class="noimg">${t('ml.noImg')}</div>`}<figcaption>${esc(e.where)}</figcaption>
      <div class="row">${inLib.has(e.key) ? `<span class="note">${t('ml.inLib')}</span>` : `<label class="chk"><input type="checkbox" data-act="pick" ${mlPicked.has(e.key) ? 'checked' : ''}><span>${t('ml.pick')}</span></label>`}</div></figure>`).join('')}</div>`).join('')}`;
}

$('mlBody').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.ml) {
    const k = el.dataset.ml, v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value;
    if (k === 'novelty') { S.settings.novelty = v; $('novelty').value = v; $('novOut').textContent = '×' + v; }
    else S.settings.ml = { ...ML_DEFAULT, ...(S.settings.ml || {}), [k]: v };
    if (k === 'method') mlEval = mlEval && { ...mlEval };
    if (k === 'cvGroup') mlEval = null;
    if (k === 'features') { mlEval = null; for (const x of S.cores.flatMap((c) => c.sections)) for (const o of x.objects.values()) o._pv = 0; if (v === 'vision' && !VIS) loadVision(); }
    markDirty(); learnNow(); renderMl(); return;
  }
  if (el.id === 'visFile') { const f = el.files[0]; el.value = ''; if (f) loadVision(f); return; }
  if (el.id === 'mlScopeSel') { mlScope = el.value; renderMl(); return; }
  if (el.id === 'mlOtherSel') { mlOtherProj = el.value; mlPicked.clear(); renderMl(); return; }
  const fig = el.closest('.mlx'); if (!fig) return;
  const key = fig.dataset.key;
  if (el.dataset.act === 'use') {
    const own = ownExamples(S.cores, true).find((q) => q.key === key);
    if (own) { own.o.nt = !el.checked; markDirty(); }
    else { if (el.checked) mlExcluded.delete(key); else mlExcluded.add(key); setPref('ml.excluded', [...mlExcluded]).catch(() => {}); }
    learnNow();
  } else if (el.dataset.act === 'pick') { if (el.checked) mlPicked.add(key); else mlPicked.delete(key); const b = $('mlAddLib'); if (b) b.textContent = t('ml.addLib', { n: mlPicked.size }); }
});
$('mlBody').addEventListener('click', (e) => {
  const el = e.target;
  if (el.id === 'mlEvalBtn') { busy(async () => runMlEval()); return; }
  if (el.id === 'mlFinalBtn') { if (confirm(t('ft.confirm'))) runFinalIchno(); return; }
  if (el.id === 'visDl') { loadVision(null, true); return; }
  if (el.id === 'visCalc') { busy(async () => { const n = await computeEmbeddings(S.cores.flatMap((c) => c.sections), (k, tot) => { $('busy').textContent = t('vis.progress', { k, n: tot }); }); $('busy').textContent = t('busy'); toast(t('vis.done', { n })); renderMl(); }); return; }
  if (el.id === 'mlUseBest' && mlEval?.best) { S.settings.clfScope = mlEval.best.scope; S.settings.ml = { ...ML_DEFAULT, ...(S.settings.ml || {}), method: mlEval.best.method }; markDirty(); learnNow(); renderMl(); toast(t('ml.applied')); return; }
  if (el.id === 'mlPickAll') { for (const q of otherExamples) if (q.project === mlOtherProj) mlPicked.add(q.key); renderMl(); return; }
  if (el.id === 'mlPickNone') { mlPicked.clear(); renderMl(); return; }
  if (el.id === 'mlAddLib') {
    const have = new Set(S.library.map((q) => q.key));
    for (const q of otherExamples) if (mlPicked.has(q.key) && !have.has(q.key)) S.library.push({ key: q.key, name: q.y, x: q.x, xv: q.xv, thumb: q.thumb, from: q.where, core: q.core });
    if (!S.classes.length) return;
    for (const q of S.library) if (!S.classes.some((c) => c.name === q.name)) S.classes.splice(S.classes.length - 1, 0, { id: 'c' + uid(), name: q.name, color: GROUP_COLORS[S.classes.length % GROUP_COLORS.length], counts: true });
    toast(t('ml.added', { n: mlPicked.size })); mlPicked.clear(); markDirty(); renderClasses(); learnNow(); return;
  }
  const fig = el.closest('.mlx'); if (!fig) return;
  if (el.dataset.act === 'libdel') { const i = S.library.findIndex((q, k) => (q.key || `lib|${k}`) === fig.dataset.key); if (i >= 0) S.library.splice(i, 1); markDirty(); learnNow(); return; }
  if (el.dataset.go) { // go to the trace in the image
    const own = ownExamples(S.cores, true).find((q) => q.key === fig.dataset.key); if (!own) return;
    $('mlDlg').close();
    if (own.c.id !== S.curCore) activateCore(own.c.id, true);
    selectSection(S.sections.indexOf(own.s)); centerOn(own.o); select(own.o.id);
  }
});

/* ───────────── multiproject analysis (V17): cores of several projects in one analysis project ───────────── */
const mpSel = new Set(); // keys 'projectId|coreId'
/** Same core found in two projects (V23): one series on a common axis; rows at the same depth/age are fused (first non-empty value wins). */
function mergeImp(a, b) {
  const rows = [], add = (t0) => (t0.depth || t0.age || []).forEach((_, i) => rows.push({ d: t0.depth?.[i] ?? null, a: t0.age?.[i] ?? null, t: t0, i }));
  add(a); add(b);
  const names = [...new Set([...Object.keys(a.proxies || {}), ...Object.keys(b.proxies || {})])];
  // sort on depth only if every row has one, else on age if every row has one; otherwise keep the two series one after the other
  const key = rows.every((r) => r.d != null) ? 'd' : rows.every((r) => r.a != null) ? 'a' : null;
  if (key) rows.sort((x, y) => x[key] - y[key]);
  const out = [];
  for (const r of rows) {
    const v = Object.fromEntries(names.map((n) => [n, r.t.proxies?.[n]?.[r.i] ?? null])), last = out[out.length - 1];
    if (key && last && Math.abs(last[key] - r[key]) < 1e-6) { for (const n of names) if (last.v[n] == null) last.v[n] = v[n]; if (last.d == null) last.d = r.d; if (last.a == null) last.a = r.a; }
    else out.push({ d: r.d, a: r.a, v });
  }
  const P = Object.fromEntries(names.map((n) => [n, out.map((r) => r.v[n])]));
  return { depth: out.some((r) => r.d != null) ? out.map((r) => r.d) : null, age: out.some((r) => r.a != null) ? out.map((r) => r.a) : null, proxies: P };
}
/** Build (or refresh) a project of kind 'multi' from the light copies of the chosen cores; layers and categories are merged by name. */
async function buildMultiProject(name, keys, keepId = null) {
  const lites = (await listLite().catch(() => [])).filter((l) => l.kind !== 'multi');
  const chosen = [];
  for (const l of lites) for (const c of l.cores) if (keys.includes(`${l.id}|${c.id}`)) chosen.push({ l, c });
  if (chosen.length < 2) { toast(t('mp.need')); return false; }
  await flushSave();
  const prev = keepId ? await getProject(keepId) : null;
  if (prev) await loadProject(prev); else { resetState(); S.id = 'mp' + uid(); }
  S.name = name; S.kind = 'multi'; S.multiSource = { keys: [...keys], built: new Date().toISOString() };
  S.notes = chosen.map(({ l, c }) => `${c.name} (${l.name})`).join('; ');
  // layers by name
  const layers = new Map(), layerId = new Map(), catId = new Map();
  for (const { l } of chosen) for (const L of l.layers || []) {
    let m = layers.get(L.name);
    if (!m) { m = { ...L, id: 'L' + uid(), cats: [], parentName: (l.layers || []).find((q) => q.id === L.parent)?.name || null }; layers.set(L.name, m); }
    layerId.set(`${l.id}|${L.id}`, m.id);
    for (const k of L.cats || []) { let mk = m.cats.find((q) => q.name === k.name); if (!mk) { mk = { ...k, id: 'k' + uid() }; m.cats.push(mk); } catId.set(`${l.id}|${L.id}|${k.id}`, mk.id); }
  }
  for (const m of layers.values()) { m.parent = m.parentName ? layers.get(m.parentName)?.id || null : null; delete m.parentName; }
  // cores: the same core chosen from several projects (same name, coreKey) becomes ONE core whose table joins the
  // rows of every project (no duplicated core, no double weight in models or maps)
  const coreId = new Map(), byKey = new Map();
  for (const { l, c } of chosen) { const k = coreKey(c.name) || `${l.id}|${c.id}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push({ l, c }); }
  S.cores = [...byKey.values()].map((grp) => {
    const { c } = grp[0], projects = grp.map((q) => q.l.name);
    let imp = { depth: c.depth, age: c.age, proxies: c.proxies || {} };
    for (const { c: o } of grp.slice(1)) imp = mergeImp(imp, { depth: o.depth, age: o.age, proxies: o.proxies || {} });
    const core = makeCore({ name: c.name, lat: c.lat ?? grp.find((q) => q.c.lat != null)?.c.lat, lon: c.lon ?? grp.find((q) => q.c.lon != null)?.c.lon, units: c.units, source: 'multi',
      notes: t('mp.from', { p: projects.join(', ') }), imp, age: { text: c.ageText || grp.find((q) => q.c.ageText)?.c.ageText || '' } });
    core.origin = grp.map((q) => ({ project: q.l.id, core: q.c.id }));
    for (const q of grp) coreId.set(`${q.l.id}|${q.c.id}`, core.id);
    return core;
  });
  const g = S.geo;
  g.layers = [...layers.values()];
  g.intervals = chosen.flatMap(({ l, c }) => (l.intervals || []).filter((q) => q.core === c.id && !q.auto).map((q) => ({
    ...q, id: uid(), core: coreId.get(`${l.id}|${c.id}`), layer: layerId.get(`${l.id}|${q.layer}`), cat: catId.get(`${l.id}|${q.layer}|${q.cat}`) }))).filter((q) => q.layer && q.cat)
    .filter((q, i, arr) => arr.findIndex((r) => r.core === q.core && r.layer === q.layer && r.cat === q.cat && r.axis === q.axis && Math.abs(r.from - q.from) < 1e-9 && Math.abs(r.to - q.to) < 1e-9) === i);
  const st = g.settings;
  if (!g.layers.some((L) => L.id === st.target)) st.target = g.layers.find((L) => g.intervals.some((q) => q.layer === L.id))?.id || g.layers[0]?.id || null;
  // default variables: columns present in at least two of the cores (up to 12)
  const cnt = {}; for (const c of S.cores) for (const k of Object.keys(c.imp.proxies)) cnt[k] = (cnt[k] || 0) + 1;
  const names2 = Object.keys(cnt);
  st.features = (st.features || []).filter((k) => names2.includes(k));
  if (!st.features.length) st.features = names2.filter((k) => cnt[k] >= 2).sort((a, b) => cnt[b] - cnt[a]).slice(0, 12);
  if (st.missing === 'drop' && st.features.length > 1) st.missing = 'mean';
  for (const c of S.cores) refreshCoreData(c);
  S.curCore = S.cores[0].id; activateCore(S.curCore, true); renderCoreBar();
  geoReset(); geoMarkDirty();
  await saveToDB(); updateProjHeader();
  return true;
}
async function updateMultiProject(id) {
  const meta = (await listProjects().catch(() => [])).find((m) => m.id === id); if (!meta) return;
  const data = await getProject(id); const keys = data?.multiSource?.keys || [];
  await busy(async () => { if (await buildMultiProject(meta.name, keys, id)) toast(t('mp.updated')); });
  await renderProjects();
}
function renderMpCount() { $('mpCount').textContent = t('mp.sel', { n: mpSel.size }); }
$('mpAll').addEventListener('click', () => { for (const l of allLite.filter((x) => x.kind !== 'multi')) for (const c of l.cores) mpSel.add(`${l.id}|${c.id}`); renderAllProjects(); });
$('mpNone').addEventListener('click', () => { mpSel.clear(); renderAllProjects(); });
$('mpCreate').addEventListener('click', async () => {
  const name = $('mpName').value.trim() || t('mp.title');
  const same = (await listProjects().catch(() => [])).find((m) => m.kind === 'multi' && m.name === name);
  let ok = false;
  await busy(async () => { ok = await buildMultiProject(name, [...mpSel], same?.id || null); });
  if (ok) { hideHome(); setMode('geo'); }
});
// tabs of the start screen
for (const b of document.querySelectorAll('[data-htab]')) b.addEventListener('click', () => setHomeTab(b.dataset.htab));
function setHomeTab(tab) {
  for (const b of document.querySelectorAll('[data-htab]')) b.setAttribute('aria-selected', String(b.dataset.htab === tab));
  for (const p of document.querySelectorAll('[data-hpane]')) p.hidden = p.dataset.hpane !== tab;
  try { localStorage.setItem('ichantool.homeTab', tab); } catch { /* storage blocked */ }
  if (tab === 'all') requestAnimationFrame(() => redrawAllMap());
}
try { setHomeTab(localStorage.getItem('ichantool.homeTab') || 'projects'); } catch { setHomeTab('projects'); }

/* ───────────── data tab: all data of the project, computed and manual columns, free cells ───────────── */

/* ───────────── data tab: Grapher-like plots (V21) ───────────── */
const defaultPlot = (n = 1) => ({ name: `${t('pl.plot')} ${n}`, layout: 'strat', cores: S.curCore ? [S.curCore] : [], v: 'depth', ys: [], title: '', width: 900, height: 620, panelWidth: 150,
  legend: true, grid: true, xmin: null, xmax: null, ymin: null, ymax: null, xlog: false, ylog: false, xinv: false, yinv: false, y2label: '' });
const plotCol = (c, name) => (name === 'depth' ? c.depth : name === 'age' ? c.age : c.proxies?.[name]) || [];
function plotColumns() { const s = new Set(); for (const c of S.cores) Object.keys(c.proxies || {}).forEach((k) => s.add(k)); return [...s].sort(); }
const curPlot = () => { S.plots ||= []; if (!S.plots.length) S.plots.push(defaultPlot()); S.plotCur = Math.min(S.plotCur || 0, S.plots.length - 1); return S.plots[S.plotCur]; };
let plotLast = null;

function plotSpec(p) {
  const cores = S.cores.filter((c) => p.cores.includes(c.id)), axisName = (k) => (k === 'depth' ? `${t('log.depth')} (${cores[0]?.units || ''})` : k === 'age' ? `${t('log.age')} (ka)` : k);
  const num = (v) => (v === '' || v == null ? null : +v);
  if (p.layout === 'strat') {
    return { kind: 'strat', spec: { title: p.title, width: p.width, height: p.height, panelWidth: p.panelWidth, legend: p.legend, grid: p.grid, v: { label: axisName(p.v), min: num(p.ymin), max: num(p.ymax), invert: !p.yinv },
      panels: p.ys.map((y) => ({ label: y.col, log: y.log, invert: y.inv, fit: y.fit, deg: y.deg, window: y.window, series: cores.map((c, k) => ({ name: c.name, core: c.name, x: plotCol(c, p.v), y: plotCol(c, y.col), type: y.type, color: cores.length > 1 ? PLOT_COLORS[k % PLOT_COLORS.length] : (y.color || PLOT_COLORS[0]) })) })) } };
  }
  const series = [];
  p.ys.forEach((y, i) => cores.forEach((c, k) => series.push({ name: cores.length > 1 ? `${y.col} · ${c.name}` : y.col, x: plotCol(c, p.v), y: plotCol(c, y.col), type: y.type, y2: y.y2, fit: y.fit, deg: y.deg, window: y.window,
    color: cores.length > 1 && p.ys.length === 1 ? PLOT_COLORS[k % PLOT_COLORS.length] : y.color || PLOT_COLORS[(i * Math.max(1, cores.length) + k) % PLOT_COLORS.length], dash: cores.length > 1 && p.ys.length > 1 && k ? '4 2' : null })));
  return { kind: 'xy', spec: { title: p.title, width: p.width, height: p.height, legend: p.legend, grid: p.grid, series,
    x: { label: axisName(p.v), min: num(p.xmin), max: num(p.xmax), log: p.xlog, invert: p.xinv },
    y: { label: p.ys.filter((y) => !y.y2).map((y) => y.col).join(', '), min: num(p.ymin), max: num(p.ymax), log: p.ylog, invert: p.yinv },
    y2: { label: p.y2label || p.ys.filter((y) => y.y2).map((y) => y.col).join(', ') } } };
}

function renderDataPlot() {
  const p = curPlot(), cols = plotColumns(), box = $('dBody');
  if (!p.ys.length && cols.length) p.ys.push({ col: cols[0], type: 'line', y2: false, fit: 'none', deg: 2, window: 5, log: false, inv: false, color: '' });
  const opt = (list, v) => list.map(([k, n]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const axisOpts = [['depth', t('log.depth')], ['age', t('log.age')], ...cols.map((c) => [c, c])];
  const ck = (k, l) => `<label class="chk"><input type="checkbox" data-p="${k}" ${p[k] ? 'checked' : ''}><span>${t(l)}</span></label>`;
  const nm = (k, l, w = 80) => `<label class="f"><span>${t(l)}</span><input type="number" step="any" data-p="${k}" value="${p[k] ?? ''}" style="width:${w}px"></label>`;
  const yRows = p.ys.map((y, i) => `<div class="prow2" data-y="${i}">
      <select data-yk="col">${opt(cols.map((c) => [c, c]), y.col)}</select>
      <select data-yk="type">${opt(PLOT_TYPES.map((k) => [k, t('pl.t.' + k)]), y.type)}</select>
      <select data-yk="fit">${opt(FIT_KINDS.map((k) => [k, t('pl.f.' + k)]), y.fit)}</select>
      ${y.fit === 'poly' ? `<input type="number" data-yk="deg" min="2" max="6" value="${y.deg}" title="${t('pl.deg')}" style="width:50px">` : ''}${y.fit === 'movavg' ? `<input type="number" data-yk="window" min="3" max="99" step="2" value="${y.window}" title="${t('pl.window')}" style="width:56px">` : ''}
      ${p.layout === 'xy' ? `<label class="chk"><input type="checkbox" data-yk="y2" ${y.y2 ? 'checked' : ''}><span>Y2</span></label>` : `<label class="chk"><input type="checkbox" data-yk="log" ${y.log ? 'checked' : ''}><span>log</span></label><label class="chk"><input type="checkbox" data-yk="inv" ${y.inv ? 'checked' : ''}><span>${t('pl.inv')}</span></label>`}
      <input type="color" data-yk="color" value="${y.color || PLOT_COLORS[i % PLOT_COLORS.length]}" title="${t('pl.color')}">
      <button class="btn small ghost" data-pa="dely" title="${t('pl.del')}">×</button></div>`).join('');
  box.innerHTML = `<div class="plotwrap"><div class="pctl">
    <div class="row"><select id="plSel" style="flex:1">${opt(S.plots.map((q, i) => [i, q.name]), S.plotCur)}</select><button class="btn small" data-pa="new">+</button><button class="btn small" data-pa="dup">${t('pl.dup')}</button><button class="btn small ghost" data-pa="del">×</button></div>
    <label class="f"><span>${t('pl.name')}</span><input type="text" data-p="name" value="${esc(p.name)}"></label>
    <label class="f"><span>${t('pl.layout')}</span><select data-p="layout">${opt([['strat', t('pl.l.strat')], ['xy', t('pl.l.xy')]], p.layout)}</select></label>
    <p class="note">${t('pl.l.' + p.layout + 'Help')}</p>
    <div class="f"><span>${t('pl.cores')}</span><div class="chklist">${S.cores.map((c) => `<label class="chk"><input type="checkbox" data-core="${c.id}" ${p.cores.includes(c.id) ? 'checked' : ''}><span>${esc(c.name)}</span></label>`).join('')}</div></div>
    <label class="f"><span>${t(p.layout === 'strat' ? 'pl.vaxis' : 'pl.xaxis')}</span><select data-p="v">${opt(axisOpts, p.v)}</select></label>
    <div class="f"><span>${t(p.layout === 'strat' ? 'pl.panels' : 'pl.yvars')}</span>${yRows}<button class="btn small" data-pa="addy">+ ${t('pl.addy')}</button></div>
    <details><summary>${t('pl.axes')}</summary><div class="row" style="margin-top:6px">
      ${p.layout === 'xy' ? nm('xmin', 'pl.xmin') + nm('xmax', 'pl.xmax') + ck('xlog', 'pl.xlog') + ck('xinv', 'pl.xinv') : ''}
      ${nm('ymin', p.layout === 'strat' ? 'pl.vmin' : 'pl.ymin') + nm('ymax', p.layout === 'strat' ? 'pl.vmax' : 'pl.ymax')}${p.layout === 'xy' ? ck('ylog', 'pl.ylog') : ''}${ck('yinv', p.layout === 'strat' ? 'pl.vup' : 'pl.yinv')}
      ${p.layout === 'xy' ? `<label class="f"><span>${t('pl.y2label')}</span><input type="text" data-p="y2label" value="${esc(p.y2label || '')}"></label>` : ''}</div></details>
    <details><summary>${t('pl.look')}</summary><div class="row" style="margin-top:6px">
      <label class="f" style="flex-basis:100%"><span>${t('pl.title')}</span><input type="text" data-p="title" value="${esc(p.title || '')}"></label>
      ${nm('width', 'pl.width') + nm('height', 'pl.height')}${p.layout === 'strat' ? nm('panelWidth', 'pl.pw') : ''}${ck('legend', 'pl.legend')}${ck('grid', 'pl.grid')}</div></details>
    <div class="row"><button class="btn small primary" data-pa="svg">SVG</button><button class="btn small" data-pa="png">PNG ×3</button><button class="btn small" data-pa="csv">CSV</button></div>
  </div><div class="pout" id="plOut"></div></div>`;
  drawDataPlot();
}
function drawDataPlot() {
  const p = curPlot(), out = $('plOut'); if (!out) return;
  if (!p.cores.length || !p.ys.length) { out.innerHTML = `<p class="note">${t('pl.empty')}</p>`; plotLast = null; return; }
  const { kind, spec } = plotSpec(p), r = kind === 'strat' ? buildStratPlot(spec) : buildXYPlot(spec);
  plotLast = { ...r, spec, kind };
  const f3 = (v) => (v == null || !Number.isFinite(v) ? '—' : +v.toPrecision(4));
  out.innerHTML = `<div class="psvg">${r.svg}</div>
    ${r.fits.length ? `<h4>${t('pl.fits')}</h4><table class="dtable mtab"><thead><tr><th>${t('pl.series')}</th><th>${t('pl.eq')}</th><th>R²</th><th>n</th></tr></thead><tbody>${r.fits.map((f) => `<tr><td class="txt">${esc(f.name)}</td><td class="txt">${esc(f.eq)}</td><td>${f3(f.r2)}</td><td>${f.n}</td></tr>`).join('')}</tbody></table>` : ''}
    <h4>${t('pl.stats')}</h4><table class="dtable mtab"><thead><tr><th>${t('pl.series')}</th><th>n</th><th>${t('pl.mean')}</th><th>${t('pl.sd')}</th><th>${t('pl.min')}</th><th>${t('pl.median')}</th><th>${t('pl.max')}</th>${kind === 'xy' ? '<th>r (X, Y)</th>' : ''}</tr></thead><tbody>${r.stats.map((q) => `<tr><td class="txt">${esc(q.name)}</td><td>${q.n}</td><td>${f3(q.mean)}</td><td>${f3(q.sd)}</td><td>${f3(q.min)}</td><td>${f3(q.median)}</td><td>${f3(q.max)}</td>${kind === 'xy' ? `<td>${f3(q.r)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
}
$('dBody').addEventListener('change', (e) => {
  if ($('dView').value !== 'plot') return;
  const el = e.target, p = curPlot(), val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
  if (el.id === 'plSel') { S.plotCur = +el.value; renderDataPlot(); return; }
  if (el.dataset.core) { if (el.checked) p.cores.push(el.dataset.core); else p.cores = p.cores.filter((id) => id !== el.dataset.core); }
  else if (el.dataset.p) { p[el.dataset.p] = val; if (el.dataset.p === 'layout' && val === 'strat' && (p.v !== 'depth' && p.v !== 'age')) p.v = 'depth'; }
  else if (el.dataset.yk) { const i = +el.closest('[data-y]').dataset.y; p.ys[i][el.dataset.yk] = val; }
  else return;
  markDirty();
  const rebuild = ['layout', 'fit'].includes(el.dataset.p || el.dataset.yk) || el.dataset.p === 'name';
  if (rebuild) renderDataPlot(); else drawDataPlot();
});
$('dBody').addEventListener('click', (e) => {
  const a = e.target.closest('[data-pa]')?.dataset.pa; if (!a || $('dView').value !== 'plot') return;
  const p = curPlot(), cols = plotColumns();
  if (a === 'addy') p.ys.push({ col: cols.find((c) => !p.ys.some((y) => y.col === c)) || cols[0], type: 'line', y2: false, fit: 'none', deg: 2, window: 5, log: false, inv: false, color: '' });
  else if (a === 'dely') p.ys.splice(+e.target.closest('[data-y]').dataset.y, 1);
  else if (a === 'new') { S.plots.push(defaultPlot(S.plots.length + 1)); S.plotCur = S.plots.length - 1; }
  else if (a === 'dup') { S.plots.push({ ...JSON.parse(JSON.stringify(p)), name: p.name + ' (2)' }); S.plotCur = S.plots.length - 1; }
  else if (a === 'del') { S.plots.splice(S.plotCur, 1); S.plotCur = 0; }
  else if (a === 'svg') { if (plotLast) saveFile(`${safe(p.name)}.svg`, plotLast.svg, 'image/svg+xml'); return; }
  else if (a === 'png') { if (plotLast) busy(async () => { const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(plotLast.svg); await img.decode(); const c = document.createElement('canvas'); c.width = img.width * 3; c.height = img.height * 3; const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); const b = await new Promise((r) => c.toBlob(r, 'image/png')); if (b) await saveFile(`${safe(p.name)}.png`, b, 'image/png'); }); return; }
  else if (a === 'csv') {
    const rows = [['core', p.v, 'variable', 'value']];
    for (const c of S.cores.filter((q) => p.cores.includes(q.id))) for (const y of p.ys) { const X = plotCol(c, p.v), Y = plotCol(c, y.col); for (let i = 0; i < X.length; i++) if (X[i] != null && Y[i] != null) rows.push([c.name, X[i], y.col, Y[i]]); }
    saveFile(`${safe(p.name)}.csv`, withProv(toCSV(rows)), 'text/csv'); return;
  }
  markDirty(); renderDataPlot();
});

let dataLimit = 400;
const SRC_ORDER = { imp: 0, rec: 1, img: 2, man: 3, calc: 4 };
function dataCores() { const v = $('dCore').value; return v === '__all' ? S.cores : S.cores.filter((c) => c.id === (v || S.curCore)); }
function renderData() {
  if (mode !== 'data') return;
  const sel = $('dCore'), cur = sel.value || S.curCore;
  sel.innerHTML = S.cores.map((c) => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)}</option>`).join('') + `<option value="__all" ${cur === '__all' ? 'selected' : ''}>${t('data.allCores')}</option>`;
  refreshAllCores();
  // V0.35: the sheet replaces the old «computed columns» view; the free cell sheet stays only for projects that use it
  for (const o of $('dView').options) if (o.value === 'cols' || (o.value === 'cells' && !Object.keys(S.sheet.cells || {}).length)) o.hidden = true;
  if ($('dView').selectedOptions[0]?.hidden) $('dView').value = 'table';
  const view = $('dView').value;
  if (view === 'cols') renderDataCols(); else if (view === 'cells') renderDataCells(); else if (view === 'plot') renderDataPlot(); else renderDataTable();
}
function tableModel() {
  const cores = dataCores(), names = new Map();
  for (const c of cores) for (const [k, v] of Object.entries(c.src)) if (!names.has(k)) names.set(k, v);
  const cols = [...names.entries()].sort((a, b) => SRC_ORDER[a[1]] - SRC_ORDER[b[1]] || a[0].localeCompare(b[0]));
  const layers = $('dLayers').checked ? S.geo.layers.filter((L) => S.geo.intervals.some((q) => q.layer === L.id && cores.some((c) => c.id === q.core))) : [];
  const rows = [];
  for (const c of cores) {
    const n = (c.depth || c.age || []).length;
    const ivs = new Map(layers.map((L) => [L.id, intervalsOnAxis(S.geo.intervals.filter((q) => q.core === c.id && q.layer === L.id), c.depth ? 'depth' : 'age', c)]));
    for (let i = 0; i < n; i++) {
      const x = c.depth ? c.depth[i] : c.age[i];
      rows.push({ c, i, depth: c.depth?.[i] ?? null, age: c.age?.[i] ?? null, vals: cols.map(([k]) => c.proxies[k]?.[i] ?? null),
        lay: layers.map((L) => { const q = ivs.get(L.id).find((v) => x >= v.from && x < v.to); return q ? geoCat(q.cat)?.name || '' : ''; }) });
    }
  }
  return { cores, cols, layers, rows };
}
/* ───────────── V0.35: Data as a spreadsheet — every value editable (flagged), computed columns ───────────── */
let dataEditOn = false, dataFormOpen = null, dataLastCell = null;
function renderDataTable() {
  const M = tableModel(), multi = M.cores.length > 1, nEd = editCount(M.cores);
  $('dInfo').textContent = t('data.info', { r: M.rows.length, c: M.cols.length });
  const colLetter = (i) => cellName(i, 0).replace(/\d+$/, '');
  const fixed = (multi ? 1 : 0) + 2;
  const head = `<tr><th class="rn"></th>${multi ? `<th class="txt">${t('geo.core')}</th>` : ''}<th>${t('r.depth')}</th><th>${t('r.age')}</th>${M.cols.map(([k, src], j) => {
    const calc = S.sheet.columns.findIndex((x) => x.name === k);
    return `<th class="src-${src}" title="${esc(t('data.src.' + src))}"><span class="tag">${colLetter(fixed + j)} · ${t('data.src.' + src)}</span>${esc(k)}${src === 'calc' && calc >= 0 ? ` <button type="button" class="btn small ghost fx" data-fx="${calc}" title="${esc(t('ds.editFx'))}">ƒ</button>` : ''}</th>`;
  }).join('')}${M.layers.map((L) => `<th class="src-lay txt"><span class="tag">${t('data.src.lay')}</span>${esc(L.name)}</th>`).join('')}</tr>`;
  const body = M.rows.slice(0, dataLimit).map((r, ri) => {
    const x = r.depth ?? r.age;
    return `<tr><td class="rn">${ri + 1}</td>${multi ? `<td class="txt">${esc(r.c.name)}</td>` : ''}<td class="ax">${fmt(r.depth, 4)}</td><td class="ax">${fmt(r.age, 3)}</td>${r.vals.map((v, j) => {
      const [k, src] = M.cols[j], ed = src !== 'man' && cellEdit(r.c, k, x), canEdit = dataEditOn && src !== 'calc' && x != null;
      const tip = ed ? t('ds.modTip', { o: ed.o == null ? '—' : fmt(ed.o, 6), d: (ed.at || '').slice(0, 10) }) : '';
      return `<td${canEdit ? ' contenteditable spellcheck="false"' : ''} class="${ed ? 'mod' : ''}${src === 'calc' ? ' calc' : ''}" data-core="${r.c.id}" data-col="${esc(k)}" data-src="${src}" data-x="${x}"${tip ? ` title="${esc(tip)}"` : ''}>${v == null ? '' : fmt(v, 6)}</td>`;
    }).join('')}${r.lay.map((v) => `<td class="txt">${esc(v)}</td>`).join('')}</tr>`;
  }).join('');
  const cores = S.cores.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const f = dataFormOpen, fcol = f?.i != null ? S.sheet.columns[f.i] : null;
  const names = [...new Set(M.cols.map(([k]) => k)), 'depth', 'age'];
  const form = f ? `<div class="dsform">
      <div class="row"><label class="f"><span>${t('ds.type')}</span><select id="dsType" ${fcol ? 'disabled' : ''}><option value="calc" ${f.type !== 'man' ? 'selected' : ''}>${t('ds.calc')}</option><option value="man" ${f.type === 'man' ? 'selected' : ''}>${t('ds.man')}</option></select></label>
      <label class="f" style="flex:1"><span>${t('ds.name')}</span><input type="text" id="dsName" value="${esc(fcol?.name || '')}"></label>
      <label class="f"><span>${t('data.core')}</span><select id="dsCore">${f.type === 'man' ? '' : `<option value="all">${t('data.allCores')}</option>`}${cores}</select></label></div>
      ${f.type !== 'man' ? `<label class="f"><span>${t('ds.formula')}</span><input type="text" id="dsFormula" value="${esc(fcol?.formula || '')}" placeholder="[reflectance_L*] / [reflectance_a*]" spellcheck="false"></label>
      <p class="note">${t('ds.formulaHelp', { f: FUNCTIONS.join(', ') })}</p>
      <div class="dsnames">${names.map((n) => `<button type="button" class="btn small ghost" data-ins="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : `<p class="note">${t('ds.manHelp')}</p>`}
      ${f.type !== 'man' ? `<label class="chk"><input type="checkbox" id="dsInterp" ${fcol?.interp === false ? '' : 'checked'}><span>${t('ds.interp')}</span></label>` : ''}
      ${fcol?.error ? `<p class="note err">${esc(fcol.error)}</p>` : ''}
      <div class="row"><button type="button" class="btn small primary" id="dsSave">${t(fcol ? 'ds.save' : 'ds.add')}</button>${fcol ? `<button type="button" class="btn small" id="dsDel">${t('ds.del')}</button>` : ''}<button type="button" class="btn small ghost" id="dsCancel">${t('ds.cancel')}</button></div></div>` : '';
  $('dBody').innerHTML = `<div class="dsbar">
      <label class="chk ${dataEditOn ? 'on' : ''}"><input type="checkbox" id="dsEdit" ${dataEditOn ? 'checked' : ''}><span>${t('ds.edit')}</span></label>
      <button type="button" class="btn small" id="dsNewCol">${t('ds.newCol')}</button>
      <span class="dsmod">${nEd ? t('ds.nMod', { n: nEd }) : ''}</span>
      ${nEd ? `<button type="button" class="btn small ghost" id="dsRestoreCell" disabled>${t('ds.restoreCell')}</button><button type="button" class="btn small ghost" id="dsRestoreAll">${t('ds.restoreAll')}</button>` : ''}
    </div>
    ${dataEditOn ? `<p class="dswarn">${t('ds.warn')}</p>` : ''}${form}
    <div class="dsgrid"><table class="dtable sheet"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    ${M.rows.length > dataLimit ? `<p><button class="btn small" id="dMore">${t('data.more', { n: M.rows.length - dataLimit })}</button></p>` : ''}`;
  if ($('dMore')) $('dMore').onclick = () => { dataLimit += 1000; renderDataTable(); };
  if (f && $('dsCore')) $('dsCore').value = fcol?.core || (f.type === 'man' ? M.cores[0]?.id : 'all') || 'all';
}
$('dBody').addEventListener('change', (e) => {
  if (e.target.id === 'dsEdit') { dataEditOn = e.target.checked; renderDataTable(); }
  else if (e.target.id === 'dsType') { dataFormOpen = { type: e.target.value }; renderDataTable(); }
});
$('dBody').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'dsNewCol') { dataFormOpen = dataFormOpen ? null : { type: 'calc' }; renderDataTable(); }
  else if (b.dataset.fx != null) { dataFormOpen = { type: 'calc', i: +b.dataset.fx }; renderDataTable(); }
  else if (b.dataset.ins != null) { const i = $('dsFormula'), ins = /^[\w.]+$/.test(b.dataset.ins) ? b.dataset.ins : `[${b.dataset.ins}]`; const p0 = i.selectionStart ?? i.value.length; i.value = i.value.slice(0, p0) + ins + i.value.slice(i.selectionEnd ?? p0); i.focus(); i.selectionStart = i.selectionEnd = p0 + ins.length; }
  else if (b.id === 'dsCancel') { dataFormOpen = null; renderDataTable(); }
  else if (b.id === 'dsDel') { S.sheet.columns.splice(dataFormOpen.i, 1); dataFormOpen = null; refreshAllCores(); geoRT.dirty = true; markDirty(); renderDataTable(); }
  else if (b.id === 'dsSave') {
    const name = $('dsName').value.trim(), core = $('dsCore').value; if (!name) { toast(t('ds.needName')); return; }
    if (dataFormOpen.type === 'man') {
      const c = S.cores.find((x) => x.id === core); if (!c) return;
      c.user ||= {}; c.user[name] ||= { d: (c.depth || []).slice(), v: (c.depth || []).map(() => null) };
      dataEditOn = true; refreshCoreData(c);
    } else {
      const formula = $('dsFormula').value.trim(); if (!formula) { toast(t('ds.needFormula')); return; }
      try { parseFormula(formula); } catch (err) { toast(t('ds.badFormula', { e: err.message })); return; }
      const interp = $('dsInterp')?.checked !== false;
      if (dataFormOpen.i != null) Object.assign(S.sheet.columns[dataFormOpen.i], { name, formula, core, interp }); else S.sheet.columns.push({ name, formula, core, interp });
      refreshAllCores();
    }
    dataFormOpen = null; geoRT.dirty = true; markDirty(); renderDataTable();
  }
  else if (b.id === 'dsRestoreAll') { if (!armed(b)) return; for (const c of dataCores()) c.edits = {}; refreshAllCores(); geoRT.dirty = true; markDirty(); renderDataTable(); }
  else if (b.id === 'dsRestoreCell' && dataLastCell) {
    const { core, col, x } = dataLastCell, c = S.cores.find((q) => q.id === core);
    if (c?.edits?.[col]) { delete c.edits[col][x]; if (!Object.keys(c.edits[col]).length) delete c.edits[col]; }
    dataLastCell = null; refreshCoreData(c); geoRT.dirty = true; markDirty(); renderDataTable();
  }
});
$('dBody').addEventListener('focusin', (e) => {
  const td = e.target.closest?.('td[data-col]'); if (!td) return;
  td.dataset.before = td.textContent;
  dataLastCell = td.classList.contains('mod') ? { core: td.dataset.core, col: td.dataset.col, x: td.dataset.x } : null;
  if ($('dsRestoreCell')) $('dsRestoreCell').disabled = !dataLastCell;
});
$('dBody').addEventListener('keydown', (e) => {
  const td = e.target.closest?.('td[contenteditable]'); if (!td) return;
  if (e.key === 'Escape') { td.textContent = td.dataset.before || ''; td.blur(); return; }
  const move = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0; if (!move) return;
  e.preventDefault();
  const tr = move > 0 ? td.parentElement.nextElementSibling : td.parentElement.previousElementSibling, nx = tr?.children[td.cellIndex];
  if (nx?.isContentEditable) nx.focus(); else td.blur();
});
$('dBody').addEventListener('focusout', (e) => {
  const td = e.target.closest('td[contenteditable]'); if (!td) return;
  const raw = td.textContent.trim(); if (raw === (td.dataset.before || '').trim()) return;
  const c = S.cores.find((x) => x.id === td.dataset.core); if (!c) return;
  const v = raw === '' ? null : +raw.replace(',', '.');
  if (raw !== '' && !Number.isFinite(v)) { td.textContent = td.dataset.before || ''; toast(t('ds.notNumber')); return; }
  const col = td.dataset.col, x = td.dataset.x;
  if (td.dataset.src === 'man') {   // manual column: the value is the data itself
    const u = c.user?.[col]; if (!u) return; const d = +x, k = u.d.indexOf(d);
    if (k >= 0) u.v[k] = v; else { u.d.push(d); u.v.push(v); }
  } else {   // V0.35: any other value is kept as an edit over the original, flagged and reversible
    c.edits ||= {}; const E = (c.edits[col] ||= {}), prev = E[x];
    const orig = prev ? prev.o : (td.dataset.before === '' ? null : +td.dataset.before.replace(',', '.'));
    if (orig != null && v != null && Math.abs(orig - v) <= 1e-12 * Math.max(1, Math.abs(orig))) delete E[x];
    else E[x] = { v, o: orig, at: new Date().toISOString() };
    if (!Object.keys(E).length) delete c.edits[col];
  }
  refreshCoreData(c); geoRT.dirty = true; markDirty();
  const ed = cellEdit(c, col, x); td.classList.toggle('mod', !!ed);
  if (ed) td.title = t('ds.modTip', { o: ed.o == null ? '—' : fmt(ed.o, 6), d: ed.at.slice(0, 10) }); else td.removeAttribute('title');
  const n = editCount(dataCores()); const m = $('dBody').querySelector('.dsmod'); if (m) m.textContent = n ? t('ds.nMod', { n }) : '';
  if (n && !$('dsRestoreAll')) renderDataTable();
});
function renderDataCols() {
  const cores = S.cores.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('dInfo').textContent = '';
  $('dBody').innerHTML = `<h3>${t('data.calcTitle')}</h3><p class="note">${t('data.calcHelp', { f: FUNCTIONS.join(', ') })}</p>
    <div style="display:grid;gap:6px;max-width:1100px">${S.sheet.columns.map((col, i) => `<div class="colrow" data-i="${i}"><input type="text" data-k="name" value="${esc(col.name)}"><input type="text" data-k="formula" value="${esc(col.formula)}"><select data-k="core"><option value="all">${t('data.allCores')}</option>${S.cores.map((c) => `<option value="${c.id}" ${c.id === col.core ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><button class="btn small ghost" data-del="${i}">✕</button>${col.error ? `<span class="note" style="grid-column:1/-1;color:var(--danger)">${esc(col.error)}</span>` : ''}</div>`).join('') || `<p class="note">—</p>`}
    <div class="colrow"><input type="text" id="ncName" placeholder="${t('data.newName')}"><input type="text" id="ncFormula" placeholder="[XRF Ba/Ti] / TOC_pct"><select id="ncCore"><option value="all">${t('data.allCores')}</option>${cores}</select><button class="btn small primary" id="ncAdd">${t('data.addCalc')}</button></div></div>
    <h3>${t('data.manTitle')}</h3><p class="note">${t('data.manHelp')}</p>
    <div class="row"><input type="text" id="nmName" placeholder="${t('data.newName')}"><select id="nmCore">${cores}</select><button class="btn small" id="nmAdd">${t('data.addMan')}</button></div>
    <div style="display:grid;gap:4px">${S.cores.flatMap((c) => Object.keys(c.user || {}).map((k) => `<div class="row"><span>${esc(c.name)} · <b>${esc(k)}</b> (${c.user[k].v.filter((v) => v != null).length})</span><button class="btn small ghost" data-delman="${c.id}|${esc(k)}">✕</button></div>`)).join('')}</div>`;
  $('ncAdd').onclick = () => {
    const name = $('ncName').value.trim(), formula = $('ncFormula').value.trim(); if (!name || !formula) return;
    S.sheet.columns.push({ name, formula, core: $('ncCore').value }); refreshAllCores(); geoRT.dirty = true; markDirty(); renderDataCols();
  };
  $('nmAdd').onclick = () => {
    const name = $('nmName').value.trim(), c = S.cores.find((x) => x.id === $('nmCore').value); if (!name || !c) return;
    c.user ||= {}; c.user[name] ||= { d: (c.depth || []).slice(), v: (c.depth || []).map(() => null) };
    refreshCoreData(c); markDirty(); $('dView').value = 'table'; $('dCore').value = c.id; renderData();
  };
}
$('dBody').addEventListener('change', (e) => {
  const row = e.target.closest('.colrow[data-i]'); if (!row) return;
  const col = S.sheet.columns[+row.dataset.i]; col[e.target.dataset.k] = e.target.value; refreshAllCores(); geoRT.dirty = true; markDirty(); renderDataCols();
});
$('dBody').addEventListener('click', (e) => {
  const d = e.target.closest('button')?.dataset; if (!d) return;
  if ((d.del != null || d.delman) && !armed(e.target, '?')) return;
  if (d.del != null) { S.sheet.columns.splice(+d.del, 1); refreshAllCores(); geoRT.dirty = true; markDirty(); renderDataCols(); }
  else if (d.delman) { const [id, k] = d.delman.split('|'), c = S.cores.find((x) => x.id === id); if (c) { delete c.user[k]; refreshCoreData(c); markDirty(); renderDataCols(); } }
});
const CELL_COLS = 10, CELL_ROWS = 40;
function cellResults() {
  return evalCells(S.sheet.cells, (name, coreName) => {
    const c = coreName ? S.cores.find((x) => x.name === coreName || x.id === coreName) : curCore();
    if (!c) throw new Error(`no existe el sondeo «${coreName}»`);
    if (name === 'depth' || name === 'age') return c[name] || [];
    if (!c.proxies[name]) throw new Error(`no existe la columna «${name}»`);
    return c.proxies[name];
  });
}
function renderDataCells() {
  const R = cellResults(), show = (v) => (v && v.error ? '#ERR' : typeof v === 'number' ? fmt(v, 6) : v ?? '');
  $('dInfo').textContent = t('data.cellsInfo');
  let h = `<table class="dtable cells"><thead><tr><th></th>${Array.from({ length: CELL_COLS }, (_, c) => `<th>${cellName(c, 0).replace(/\d+/, '')}</th>`).join('')}</tr></thead><tbody>`;
  for (let r = 0; r < CELL_ROWS; r++) {
    h += `<tr><th>${r + 1}</th>`;
    for (let c = 0; c < CELL_COLS; c++) { const ref = cellName(c, r), raw = S.sheet.cells[ref] ?? '', v = R[ref]; h += `<td class="${v && v.error ? 'err' : ''}" title="${esc(v && v.error ? v.error : raw)}"><input data-ref="${ref}" data-raw="${esc(raw)}" value="${esc(String(raw).startsWith('=') ? show(v) : raw)}"></td>`; }
    h += '</tr>';
  }
  $('dBody').innerHTML = h + `</tbody></table><p class="note">${t('data.cellsHelp')}</p>`;
}
$('dBody').addEventListener('focusin', (e) => { const i = e.target.closest('input[data-ref]'); if (i) i.value = i.dataset.raw; });
$('dBody').addEventListener('focusout', (e) => {
  const i = e.target.closest('input[data-ref]'); if (!i) return;
  const v = i.value.trim(); if (v) S.sheet.cells[i.dataset.ref] = v; else delete S.sheet.cells[i.dataset.ref];
  markDirty(); setTimeout(() => { if (!document.activeElement?.dataset?.ref) renderDataCells(); else { const a = document.activeElement.dataset.ref; renderDataCells(); const n = $('dBody').querySelector(`input[data-ref="${a}"]`); n?.focus(); } }, 0);
});
$('dBody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.ref) e.target.blur(); });
for (const id of ['dCore', 'dView', 'dLayers']) $(id).addEventListener('change', () => { dataLimit = 400; renderData(); });
$('dCsv').addEventListener('click', () => {
  const M = tableModel();
  const rows = [['core', 'depth', 'age', ...M.cols.map(([k]) => k), ...M.layers.map((L) => L.name)], ...M.rows.map((r) => [r.c.name, r.depth, r.age, ...r.vals, ...r.lay])];
  // V0.35: the cells edited by hand are listed in the header (lines starting with # are ignored when the file is read back)
  const notes = [];
  for (const c of M.cores) for (const [col, E] of Object.entries(c.edits || {})) for (const [x, ed] of Object.entries(E)) notes.push(`# edited by hand: ${c.name}; ${col}; ${c.depth ? 'depth' : 'age'} ${x}; original ${ed.o ?? ''}; new ${ed.v ?? ''}; ${ed.at || ''}`);
  saveFile(`${safe(S.name)}_datos.csv`, notes.join('\n') + '\n' + withProv(toCSV(rows)), 'text/csv');
});

/* ───────────── windows and floating panel (work on a core while watching the map) ───────────── */

document.addEventListener('click', (e) => {
  const w = e.target.closest('[data-win]'); if (w) { openWindow(w.dataset.win); return; }
  const f = e.target.closest('[data-float]'); if (f) openFloat(f.dataset.float);
});
async function openWindow(kind) {
  await flushSave();
  if (location.protocol === 'file:') toast(t('win.fileNote'));
  window.open(`${location.href.split('#')[0]}#win=${kind}&project=${encodeURIComponent(S.id)}&core=${encodeURIComponent(S.curCore)}`, '_blank', 'width=1200,height=850');
}
let floatKind = null, floatTimer = 0;
function openFloat(kind) { floatKind = kind; $('float').hidden = false; $('floatTitle').textContent = t('win.title.' + kind); updateFloat(); }
$('floatClose').addEventListener('click', () => { $('float').hidden = true; floatKind = null; });
function scheduleFloat() { if (!floatKind) return; clearTimeout(floatTimer); floatTimer = setTimeout(updateFloat, 500); }
function updateFloat() {
  if (!floatKind) return;
  try {
    if (floatKind === 'map') { if (geoRT.dirty) geoComputeSamples(); $('floatBody').innerHTML = renderGeoMap() || ''; }
    else { renderLog(); $('floatBody').innerHTML = lastLog?.svg || ''; }
  } catch (e) { $('floatBody').innerHTML = `<p class="note">${esc(e.message)}</p>`; }
}
{ // drag the panel by its title bar
  let d = null;
  $('floatHead').addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; const r = $('float').getBoundingClientRect(); d = { x: e.clientX - r.left, y: e.clientY - r.top }; $('floatHead').setPointerCapture(e.pointerId); });
  $('floatHead').addEventListener('pointermove', (e) => { if (!d) return; const f = $('float'); f.style.left = e.clientX - d.x + 'px'; f.style.top = e.clientY - d.y + 'px'; f.style.right = 'auto'; f.style.bottom = 'auto'; });
  $('floatHead').addEventListener('pointerup', () => { d = null; });
}

/** A second window: read-only view of one project that follows the changes saved by the main window. */
async function startWindow() {
  document.body.classList.add('viewonly');
  const q = new URLSearchParams(location.hash.slice(1)), kind = q.get('win'), id = q.get('project'), coreId = q.get('core');
  let last = 0;
  const load = async () => {
    const meta = await getMeta(id).catch(() => null); if (!meta || meta.updated === last) return; last = meta.updated;
    if (kind === 'corelog') { const d = await getProject(id); if (d) await loadProject(d); activateCore(coreId, true); setMode('log'); return; }
    const lite = (await listLite()).find((l) => l.id === id); if (!lite) return;
    loading = true;
    S.id = id; S.name = lite.name; S.geo = normalizeGeo(lite.geo || { layers: lite.layers, intervals: lite.intervals });
    S.cores = lite.cores.map((c) => Object.assign(makeCore(c), { depth: c.depth, age: c.age, proxies: c.proxies, src: c.src || {}, ageText: c.ageText, frozen: true }));
    S.curCore = coreId; geoReset(); loading = false;
    updateProjHeader(); $('projName').textContent = `${lite.name} · ${t('win.title.' + kind)}`;
    S.geo.view.tab = kind === 'map' ? 'map' : 'logs'; S.geo.view.core = coreId || S.cores[0]?.id;
    await loadLand(); setMode('geo');
    if (S.geo.trained) geoTrain(true);
  };
  await busy(load);
  bc?.addEventListener('message', (e) => { if (e.data?.type === 'saved' && e.data.id === id) busy(load); });
  setInterval(() => load().catch(() => {}), 4000); // fallback when the channel is not shared (local files)
}
/* ───────────── misc ───────────── */

/* light / dark theme (follows the system until the user chooses) */
const currentTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function applyTheme(th) {
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme;
  $('themeBtn').textContent = currentTheme() === 'dark' ? '☀' : '☾'; $('themeBtn').setAttribute('aria-pressed', String(currentTheme() === 'dark'));
}
$('themeBtn').addEventListener('click', () => { const th = currentTheme() === 'dark' ? 'light' : 'dark'; applyTheme(th); try { localStorage.setItem('ichantool.theme', th); } catch { /* storage blocked */ } });
try { applyTheme(localStorage.getItem('ichantool.theme')); } catch { applyTheme(null); }

let toastTimer = 0;
/**
 * V0.36: every exported CSV starts with lines (beginning with #, ignored when read back) that say which version and
 * which settings produced it, so a table can be reproduced.
 */
function withProv(csv) {
  const det = [...new Set(S.cores.flatMap((c) => c.sections.map((x) => (x.detect || DEFAULT_DETECT).method || 'adaptive')))].join('/');
  return withProvenance(csv, { delivery: DELIVERY, format: FORMAT_VERSION, date: new Date().toISOString(), project: S.name, settings: S.settings, detection: det, age: ageModelText(S.age.model, S.age) });   // V0.44: exportio.js
}
export function toast(msg, ms = 3200) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), ms); }

export async function busy(fn) {
  $('busy').hidden = false;
  await new Promise((r) => setTimeout(r, 30));
  try { await fn(); }
  catch (err) { console.error(err); toast(t('err.generic', { e: err?.message || String(err) }), 8000); }   // V0.36: errors are shown
  finally { $('busy').hidden = true; }
}
/* V0.36: errors nobody caught are shown instead of being lost (once every 5 s at most) */
let lastErrToast = 0;
function showUncaught(err) {
  console.error(err);
  if (Date.now() - lastErrToast < 5000) return; lastErrToast = Date.now();
  toast(t('err.generic', { e: err?.message || String(err) }), 8000);
}
window.addEventListener('unhandledrejection', (e) => showUncaught(e.reason));
window.addEventListener('error', (e) => { if (e.error) showUncaught(e.error); });

function syncSettingsForm() {
  const st = S.settings;
  $('inclPred').checked = st.includePred; $('countCand').checked = st.countCandidates; $('idMode').checked = !!st.idMode;
  $('predThr').value = st.predThr; $('thrOut').textContent = Math.round(st.predThr * 100) + '%';
  $('novelty').value = st.novelty; $('novOut').textContent = '×' + st.novelty;
  $('maxMP').value = st.maxMP; $('minValid').value = st.minValid ?? 20; $('noDataPad').value = st.noDataPad || 0;
  renderBinNote();
}

/* ───────────── V0.39: accessibility helpers ───────────── */
/** Names for range inputs that are not inside a <label>: the text of the sibling <span> of their .slider. */
function nameSliders(root = document) {
  for (const inp of root.querySelectorAll('input[type=range]')) {
    if (inp.closest('label') || inp.hasAttribute('aria-labelledby')) continue;
    const sp = inp.closest('.slider')?.querySelector('span'); if (sp?.textContent) inp.setAttribute('aria-label', sp.textContent.trim());
  }
}
/** ARIA tab pattern for every [role=tablist]: roving tabindex and ←/→/Home/End to move between tabs. */
function tabsA11y() {
  const sync = (list) => { const tabs = [...list.querySelectorAll('[role=tab]')], on = tabs.find((b) => b.getAttribute('aria-selected') === 'true') || tabs[0]; tabs.forEach((b) => (b.tabIndex = b === on ? 0 : -1)); };
  for (const list of document.querySelectorAll('[role=tablist]')) {
    if (list.dataset.a11y) { sync(list); continue; }
    list.dataset.a11y = '1'; sync(list);
    new MutationObserver(() => sync(list)).observe(list, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    list.addEventListener('keydown', (e) => {
      const tabs = [...list.querySelectorAll('[role=tab]')].filter((b) => !b.hidden && !b.disabled), i = tabs.indexOf(document.activeElement); if (i < 0) return;
      const j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key]; if (j == null) return;
      e.preventDefault(); const b = tabs[(j + tabs.length) % tabs.length]; b.focus(); b.click();
    });
  }
  for (const p of document.querySelectorAll('.pane[data-pane]')) { p.setAttribute('role', 'tabpanel'); const b = document.querySelector(`#sideTabs [data-tab="${p.dataset.pane}"]`); if (b) { b.id ||= 'tab-' + p.dataset.pane; p.setAttribute('aria-labelledby', b.id); p.id ||= 'pane-' + p.dataset.pane; b.setAttribute('aria-controls', p.id); } }
}

function applyLanguage() {
  applyI18n(); buildForms(); nameSliders(); tabsA11y(); renderSectionForm(); renderClasses(); renderObject(); renderLearn(); renderResults(); setAge();
  $('langBtn').textContent = lang() === 'es' ? 'EN' : 'ES';
  renderRecList(); updateProjHeader(); scheduleLog(0); scheduleGeo(0);
  requestRender();
}
$('langBtn').addEventListener('click', () => { setLang(lang() === 'es' ? 'en' : 'es'); applyLanguage(); });
let singleKeys = true; try { singleKeys = localStorage.getItem('ichantool.keys') !== 'off'; } catch { /* storage blocked */ }
$('keysToggle').checked = singleKeys;
$('keysToggle').addEventListener('change', (e) => { singleKeys = e.target.checked; try { localStorage.setItem('ichantool.keys', singleKeys ? 'on' : 'off'); } catch { /* storage blocked */ } });
$('helpBtn').addEventListener('click', () => $('help').showModal());
$('helpClose').addEventListener('click', () => $('help').close());

/* ───────────── start ───────────── */

new ResizeObserver(resizeCanvases).observe(vp);
buildForms(); applyLanguage(); syncSettingsForm();
setTool('select'); setBrush(10); $('wandTol').value = S.wandTol; $('tolOut').textContent = S.wandTol; $('ovAlpha').value = S.ovAlpha * 100;
resizeCanvases();
startup();

// Exposed for automated tests.
window.ichantool = { S, saveToDB, renderProjects, showHome, runDetection, analyze, assignClass, learnNow, setTool, nextReview, setMode, renderLog, openTestProject, loadProject, serialize, BI, II, geoRT, geoTrain, renderGeo, loadGeoDemo };
