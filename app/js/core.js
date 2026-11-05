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

export const UNIT_TO_CM = { mm: 0.1, cm: 1, m: 100 };

/**
 * Per-row pixel counts inside the ROI.
 * effClass[id] = class index counted as bioturbation, or -1 (not counted).
 */
export function rowCounts({ labels, width, roi, exclude, effClass, nClasses }) {
  const { x0, x1, y0, y1 } = roi;
  const nRows = y1 - y0;
  const valid = new Uint32Array(nRows);
  const bio = new Uint32Array(nRows);
  const cls = new Uint32Array(nRows * nClasses);
  for (let r = 0; r < nRows; r++) {
    const base = (y0 + r) * width;
    let v = 0, b = 0;
    for (let x = x0; x < x1; x++) {
      const i = base + x;
      if (exclude && exclude[i]) continue;
      v++;
      const id = labels[i];
      if (id) {
        const c = effClass[id];
        if (c >= 0) { b++; cls[r * nClasses + c]++; }
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

/** Age model "depth,age" per line; header and invalid lines ignored. */
export function parseAgeModel(text) {
  const pts = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const p = line.trim().split(/[,;\t ]+/).map(Number);
    if (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push([p[0], p[1]]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return null;
  const m = { depth: pts.map((p) => p[0]), age: pts.map((p) => p[1]) };
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

export function rleDecode(rle, n, Type = Int32Array) {
  const out = new Type(n);
  let p = 0;
  for (let k = 0; k < rle.length; k += 2) { out.fill(rle[k], p, p + rle[k + 1]); p += rle[k + 1]; }
  return out;
}
