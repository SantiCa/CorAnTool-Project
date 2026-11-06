// CorAnTool web — analysis core (no DOM). Mirrors src/ichantool/pipeline.py and indices.py.

export const BI = {
  name: 'BI',
  tiers: [[0, 1, 0], [1, 5, 1], [5, 31, 2], [31, 61, 3], [61, 91, 4], [91, 100, 5], [100, 101, 6]],
  ref: 'Reineck (1963); Taylor & Goldring (1993)',
};
export const II = {
  name: 'ii',
  tiers: [[0, 1, 1], [1, 10, 2], [10, 40, 3], [40, 60, 4], [60, 100, 5], [100, 101, 6]],
  ref: 'Droser & Bottjer (1986)',
};

export function classify(scheme, pct) {
  if (pct == null || Number.isNaN(pct)) return null;
  for (const [lo, hi, v] of scheme.tiers) if (pct >= lo && pct < hi) return v;
  return null;
}

/* ───────── V0.20: overlapping traces ─────────
 * labels[i] > 0: one object id; 0: matrix; < 0: stack −labels[i] in `stacks` (list of ids, bottom → top).
 * stacks[0] is unused. A stack table only grows during a session (undo keeps old codes) and is compacted on load.
 */
const NO_IDS = [];
export const idsAt = (v, stacks) => (v > 0 ? [v] : v < 0 ? stacks[-v] : NO_IDS);
export const topAt = (v, stacks) => (v >= 0 ? v : stacks[-v][stacks[-v].length - 1]);
export const hasId = (v, id, stacks) => v === id || (v < 0 && stacks[-v].includes(id));
/** Index key → code of a stack table (rebuilt when a table is loaded). */
export function stackIndex(stacks) { const m = new Map(); for (let k = 1; k < stacks.length; k++) m.set(stacks[k].join(','), k); return m; }
/** Pixel value for an ordered list of ids (0, the id itself, or a negative stack code; new stacks are appended). */
export function codeFor(ids, stacks, index) {
  if (!ids.length) return 0;
  if (ids.length === 1) return ids[0];
  const key = ids.join(',');
  let k = index.get(key);
  if (k == null) { k = stacks.length; stacks.push(ids.slice()); index.set(key, k); }
  return -k;
}
/** Value with id on top (moved to the top if already present). */
export function withId(v, id, stacks, index) { if (v === 0 || v === id) return id; return codeFor([...idsAt(v, stacks).filter((x) => x !== id), id], stacks, index); }
/** Value without id. */
export function withoutId(v, id, stacks, index) { if (v === id) return 0; if (v >= 0) return v; return codeFor(stacks[-v].filter((x) => x !== id), stacks, index); }
/** Value with id `a` renamed to `b` (used to split and to merge; if b is already in the stack, a is just dropped). */
export function renameId(v, a, b, stacks, index) {
  if (v === a) return b; if (v >= 0) return v;
  const ids = stacks[-v]; if (!ids.includes(a)) return v;
  return codeFor(ids.includes(b) ? ids.filter((x) => x !== a) : ids.map((x) => (x === a ? b : x)), stacks, index);
}
/** Drop unused stacks and renumber the codes in labels (in place; step = 2 for an RLE array). Returns the new table. */
export function compactStacks(labels, stacks, step = 1) {
  if (!stacks || stacks.length < 2) return [null];
  const map = new Int32Array(stacks.length), out = [null];
  for (let i = 0; i < labels.length; i += step) {
    const v = labels[i]; if (v >= 0) continue;
    let k = map[-v]; if (!k) { k = map[-v] = out.length; out.push(stacks[-v]); }
    labels[i] = -k;
  }
  return out;
}

export const UNIT_TO_CM = { mm: 0.1, cm: 1, m: 100 };

/**
 * Per-row pixel counts inside the ROI.
 * effClass[id] = class index counted as bioturbation, or -1 (not counted).
 */
export function rowCounts({ labels, width, roi, exclude, effClass, nClasses, stacks = null }) {
  // V0.20: in an overlap (stack) the pixel is bioturbated once, and once for each distinct class present,
  // so the class percentages may add up to more than the total.
  const { x0, x1, y0, y1 } = roi;
  const nRows = y1 - y0;
  const valid = new Uint32Array(nRows);
  const bio = new Uint32Array(nRows);
  const cls = new Uint32Array(nRows * nClasses);
  const seen = new Int32Array(nClasses); let stamp = 0;
  for (let r = 0; r < nRows; r++) {
    const base = (y0 + r) * width;
    let v = 0, b = 0;
    for (let x = x0; x < x1; x++) {
      const i = base + x;
      if (exclude && exclude[i]) continue;
      v++;
      const id = labels[i];
      if (id > 0) {
        const c = effClass[id];
        if (c >= 0) { b++; cls[r * nClasses + c]++; }
      } else if (id < 0) {
        stamp++; let any = false;
        for (const o of stacks[-id]) { const c = effClass[o]; if (c >= 0 && seen[c] !== stamp) { seen[c] = stamp; any = true; cls[r * nClasses + c]++; } }
        if (any) b++;
      }
    }
    valid[r] = v; bio[r] = b;
  }
  return { nRows, valid, bio, cls, nClasses, nCols: x1 - x0 };
}

/**
 * Aggregate rows into bins of binPx rows (last partial bin kept, as in the Python package).
 * V0.1: binPx may be fractional (an interval given in cm × px/cm); bin j spans rows
 * [⌊j·binPx + ½⌋, ⌊(j+1)·binPx + ½⌋), so the boundaries never drift. Integer binPx gives the old bins.
 */
export const binEdge = (j, binPx) => Math.floor(j * binPx + 0.5);
export function binRows(counts, { top, bottom, binPx, minValid = 0 }) {
  const { nRows, valid, bio, cls, nClasses, nCols = 0 } = counts;
  const step = (bottom - top) / nRows;
  const out = [];
  binPx = Math.max(1, binPx);
  for (let j = 0, r0 = 0; r0 < nRows; j++, r0 = binEdge(j, binPx)) {
    const r1 = Math.min(nRows, binEdge(j + 1, binPx));
    let v = 0, b = 0;
    const c = new Array(nClasses).fill(0);
    for (let r = r0; r < r1; r++) {
      v += valid[r]; b += bio[r];
      for (let k = 0; k < nClasses; k++) c[k] += cls[r * nClasses + k];
    }
    // V0.3: an interval with less than minValid (fraction) of its pixels valid (not excluded) has no data (null, not 0)
    const ok = v > 0 && !(minValid > 0 && nCols > 0 && v < minValid * (r1 - r0) * nCols);
    const pct = ok ? (b / v) * 100 : null;
    out.push({
      index: out.length, r0, r1,
      depth: top + ((r0 + r1) / 2) * step,
      dTop: top + r0 * step, dBottom: top + r1 * step,
      valid: v, pct, ...(ok ? {} : { noData: true }),
      classPct: c.map((x) => (ok ? (x / v) * 100 : null)),
      BI: classify(BI, pct), ii: classify(II, pct),
    });
  }
  return out;
}

/**
 * Age model "depth, age[, min, max]" per line; comment (#) and invalid lines ignored.
 * V0.37: decimal comma when the separator is ";" or tab ("10,5;3,2"); a header line picks the columns by name
 * (depth/prof…, age/edad/median/mean, min/lower, max/upper); without a header the 3rd and 4th columns are an age
 * range only if every row has min ≤ age ≤ max. m.bacon flags a pasted Bacon table (depth, min, max, median, mean).
 */
export function parseAgeModel(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const split = (l) => (/[;\t]/.test(l) ? l.split(/\s*[;\t]\s*/).map((x) => x.replace(/\s+/g, '').replace(',', '.')) : l.split(/[,\s]+/));
  let iD = 0, iA = 1, iMin = 2, iMax = 3, named = false, bacon = false;
  const first = lines.length ? split(lines[0]).map((x) => x.replace(/"/g, '').toLowerCase()) : [];
  if (first.length >= 2 && first.some((x) => x && !Number.isFinite(Number(x)))) {   // header line
    const find = (re) => first.findIndex((x) => re.test(x));
    bacon = ['depth', 'min', 'max', 'median', 'mean'].every((k) => first.includes(k));
    const d = find(/^(depth|prof|mcd|mbsf|cmcd|ccsf|z)/), a = find(/^(age|edad|median|mean|cal)/);
    iD = d >= 0 ? d : 0; iA = a >= 0 ? a : (iD === 0 ? 1 : 0);
    iMin = find(/^(min|lower|low|age_?min|2\.5)/); iMax = find(/^(max|upper|high|age_?max|97\.5)/); named = true;
    lines.shift();
  }
  const pts = [];
  for (const line of lines) {
    const p = split(line).map(Number);
    if (Number.isFinite(p[iD]) && Number.isFinite(p[iA])) pts.push([p[iD], p[iA], iMin >= 0 ? p[iMin] : NaN, iMax >= 0 ? p[iMax] : NaN]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;
  const m = { depth: pts.map((p) => p[0]), age: pts.map((p) => p[1]) };
  // V0.28: age range (e.g. the 95 % interval of a Bacon model), only if every row has one that contains the age
  const lo = (p) => Math.min(p[2], p[3]), hi = (p) => Math.max(p[2], p[3]);
  if (pts.every((p) => Number.isFinite(p[2]) && Number.isFinite(p[3]) && (named || (lo(p) <= p[1] && p[1] <= hi(p))))) { m.min = pts.map(lo); m.max = pts.map(hi); }
  if (bacon) m.bacon = true;
  // reversals (age decreasing downwards) make depth↔age conversion ambiguous: flagged for the interface
  m.reversals = m.age.reduce((k, a, i) => k + (i && a < m.age[i - 1] ? 1 : 0), 0);
  return m;
}

/** Linear interpolation; null outside the model (no extrapolation). */
export function interpAge(model, d) {
  if (!model || d == null) return null;
  const { depth, age } = model;
  if (d < depth[0] || d > depth[depth.length - 1]) return null;
  let lo = 0, hi = depth.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (depth[m] <= d) lo = m; else hi = m; }
  const span = depth[hi] - depth[lo];
  return span ? age[lo] + ((d - depth[lo]) / span) * (age[hi] - age[lo]) : age[lo];
}

/** V0.28: age range at depth d, linearly interpolated like the central age; null without a range or outside the model. */
export function interpAgeRange(model, d) {
  if (!model?.min || d == null) return null;
  const lo = interpAge({ depth: model.depth, age: model.min }, d), hi = interpAge({ depth: model.depth, age: model.max }, d);
  return lo == null ? null : { min: lo, max: hi };
}

/**
 * V0.28: age–depth table written by Bacon (rbacon, *_ages.txt: depth, min, max, median, mean; depth in cm,
 * ages in cal yr BP, min–max = 95 % interval). Returns age-model text in the core units: "depth, age, min, max".
 * center: 'median' (default) or 'mean'; depthUnit: unit of the core depths; ageDiv: years per age unit (ka = 1000).
 */
export function baconToAgeText(text, { center = 'median', depthUnit = 'cm', ageDiv = 1000 } = {}) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return null;
  const head = lines[0].trim().replace(/"/g, '').toLowerCase().split(/[,;\t ]+/);
  const col = (k) => head.indexOf(k), iD = col('depth'), iMin = col('min'), iMax = col('max'), iC = col(center) >= 0 ? col(center) : col('median') >= 0 ? col('median') : col('mean');
  if (iD < 0 || iMin < 0 || iMax < 0 || iC < 0) return null;
  const f = 1 / UNIT_TO_CM[depthUnit], r = (v) => +(+v).toPrecision(8), out = [];
  for (const l of lines.slice(1)) {
    const p = l.trim().split(/[,;\t ]+/).map(Number);
    if ([iD, iMin, iMax, iC].some((i) => !Number.isFinite(p[i]))) continue;
    out.push(`${r(p[iD] * f)}, ${r(p[iC] / ageDiv)}, ${r(p[iMin] / ageDiv)}, ${r(p[iMax] / ageDiv)}`);
  }
  return out.length >= 2 ? out : null;
}

export function toCSV(rows) {
  const q = (v) => {
    if (v == null) return '';
    const s = typeof v === 'number' ? String(+v.toFixed(6)) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(q).join(',')).join('\n') + '\n';
}

/** Run-length encoding for label/exclusion layers in project files: [value, run, value, run, ...]. */
export function rleEncode(arr) {
  const out = [];
  if (!arr.length) return out;
  let prev = arr[0], run = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === prev) run++;
    else { out.push(prev, run); prev = arr[i]; run = 1; }
  }
  out.push(prev, run);
  return out;
}

/** V0.36: an RLE mask is valid when its runs are non-negative integers that add up to exactly n pixels. */
export function rleValid(rle, n) {
  if (!Array.isArray(rle) && !ArrayBuffer.isView(rle)) return false;
  if (rle.length % 2) return false;
  let p = 0; for (let k = 1; k < rle.length; k += 2) { const r = rle[k]; if (!(r >= 0) || r !== Math.floor(r)) return false; p += r; }
  return p === n;
}

export function rleDecode(rle, n, Type = Int32Array) {
  const out = new Type(n);
  let p = 0;
  for (let k = 0; k < rle.length; k += 2) { out.fill(rle[k], p, p + rle[k + 1]); p += rle[k + 1]; }
  return out;
}
