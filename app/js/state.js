/* Shared application state and small helpers (no DOM work at load time). */
import { t } from './i18n.js';

/** App name (V16: IchAnTool → CorAnTool; V0.52: → SedCoreTool). Files written with the old names are still accepted;
 *  browser storage keys, the IndexedDB name and the desktop origin keep the old names so saved data stays. */
export const APP = 'SedCoreTool', APP_NAMES = ['SedCoreTool', 'CorAnTool', 'IchAnTool'];
export const $ = (id) => document.getElementById(id);
export const VERSION = '3.0.0-dev';
const ASSET_BASES = ['', '../examples/'];

/** Bundled files (example images, test core). The standalone build injects them as data URIs. */
export async function fetchAsset(path) {
  const inline = window.ICHANTOOL_ASSETS?.[path];
  for (const u of inline ? [inline] : ASSET_BASES.map((b) => b + path)) {
    try { const r = await fetch(u); if (r.ok) return r; } catch { /* next */ }
  }
  throw new Error('file not found: ' + path);
}

/** V0.50: whether an example file is available (the downloads carry no sample data; the repository does, for tests). */
async function assetExists(path) {
  if (window.ICHANTOOL_ASSETS?.[path]) return true;
  for (const b of ASSET_BASES) { try { const r = await fetch(b + path, { method: 'HEAD' }); if (r.ok) return true; } catch { /* next */ } }
  return false;
}
/** V0.50: example and demo buttons only where their files exist. */
export async function hideMissingExamples() {
  for (const [id, path] of [['loadExample', 'data/idealized_core_0-500cm.jpg'], ['openIdeal', 'data/idealized_core_0-500cm.jpg'], ['openTest', 'U1385I-1H/records/397-U1385I-1H_MS.csv'], ['geoDemo', 'geochem_demo/intervals.csv'], ['openTutorial', 'tutorial/cores.csv']]) {
    const el = $(id); if (el && !(await assetExists(path))) el.hidden = true;
  }
}

export function defaultClasses() {
  return [
    { id: 'undet', name: t('cls.undet'), color: '#d9a441', counts: true, fixed: true, plain: true },
    { id: 'chondrites', name: 'Chondrites', color: '#4c8dff', counts: true },
    { id: 'planolites', name: 'Planolites', color: '#ef5b3b', counts: true },
    { id: 'thalassinoides', name: 'Thalassinoides', color: '#a26bf0', counts: true },
    { id: 'zoophycos', name: 'Zoophycos', color: '#1fb58f', counts: true },
    { id: 'palaeophycus', name: 'Palaeophycus', color: '#f062b0', counts: true },
    { id: 'teichichnus', name: 'Teichichnus', color: '#22b8e6', counts: true },
    { id: 'scolicia', name: 'Scolicia', color: '#8cc63f', counts: true },
    { id: 'mottled', name: t('cls.mottled'), color: '#b49a7a', counts: true, plain: true },
    { id: 'trichichnus', name: 'Trichichnus', color: '#f2d23c', counts: true },
    { id: 'phycosiphon', name: 'Phycosiphon', color: '#ff9b4a', counts: true },
    { id: 'artifact', name: t('cls.artifact'), color: '#8c8c8c', counts: false, fixed: true, plain: true },
  ];
}

export const S = {
  multi: new Set(), exShape: 'brush',
  name: 'ichantool-project',
  classes: defaultClasses(), active: 'undet',
  sections: [], cur: -1, cores: [], curCore: null, sheet: { columns: [], cells: {} },
  id: '', notes: '', records: [], logView: null,
  settings: { binCm: 1, minValid: 20, noDataPad: 0, includePred: true, predThr: 0.7, countCandidates: true, novelty: 3, maxMP: 8, clfScope: 'project', ml: { method: 'knn', k: 5, weights: 'distance', trees: 100, maxDepth: 12, minLeaf: 2, balanced: true, priors: 'uniform' } },
  age: { text: '', units: 'ka', model: null },
  library: [],
  tool: 'select', prevTool: 'select', brushSize: 10, wandTol: 30,
  selected: 0, view: { x: 0, y: 0, zoom: 1 }, showOrig: false, ovAlpha: 0.5,
  undo: [],
};
/** Three ichnotaxon models (V16): trained on the open core, on every core of the project, or on every project. */
export const CLF_SCOPES = ['core', 'project', 'all'];
/** Training settings of the ichnotaxon models (V18); stored in the project settings. */
export const ML_DEFAULT = { method: 'knn', k: 5, weights: 'distance', trees: 100, maxDepth: 12, minLeaf: 2, balanced: true, priors: 'uniform', features: 'shape' };
export const sec = () => S.sections[S.cur];
export const uid = () => Math.random().toString(36).slice(2, 9);
export const clsById = (id) => S.classes.find((c) => c.id === id);
export const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
export const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : (+v.toFixed(d)).toString());
export const keyOf = (c) => { const k = S.classes.indexOf(c); return c.id === 'artifact' ? '0' : k < 9 ? String(k + 1) : ''; };