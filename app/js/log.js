// SedCoreTool web — composite core log (no DOM): table parsing, axis transforms, SVG and CSV of a window.
import { interpAge, toCSV } from './core.js';

/** Parse CSV / TXT tables: delimiter , ; tab | or spaces; optional header; decimal comma; '#' comments. */
export function parseTable(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  if (!lines.length) return { headers: [], rows: [], text: [], dropped: 0, droppedCols: [] };
  const head = lines.slice(0, 6);
  // V0.38: fields between double quotes may contain the delimiter ("a, b") and "" for a quote
  const splitQ = (l, d) => {
    if (!l.includes('"')) return l.split(d);
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"' && !cur.trim()) { q = true; cur = ''; }
      else if (l.startsWith(d, i)) { out.push(cur); cur = ''; i += d.length - 1; }
      else cur += ch;
    }
    out.push(cur); return out;
  };
  // the delimiter splits the first line and all but at most one of the next lines (a stray last line is tolerated)
  const delim = ['\t', ';', ',', '|'].find((d) => splitQ(head[0], d).length > 1 && head.filter((l) => splitQ(l, d).length > 1).length >= head.length - (head.length > 2 ? 1 : 0)) || /\s+/;
  const split = (l) => (delim instanceof RegExp ? l.trim().split(delim) : splitQ(l, delim)).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const sample = lines.slice(0, 30).flatMap(split);   // V0.38: "1,5" means decimal comma; "1,234.5" means thousands
  const decimalComma = delim !== ',' && sample.some((c) => /^[-+]?\d+,\d+$/.test(c) || /^[-+]?\d{1,3}(\.\d{3})+,\d+$/.test(c)) && !sample.some((c) => /^[-+]?\d{1,3}(,\d{3})+\.\d+$/.test(c));
  const num = (c) => {
    if (c == null || c === '') return null;
    let x = c.replace(/^\+/, '');
    // V0.38: thousands separators ("1.234,5" with decimal comma, "1,234.5" otherwise) and spaces inside numbers
    if (decimalComma && /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, '');
    else if (!decimalComma && delim !== ',' && /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.replace(/,/g, '');
    if (/^-?\d{1,3}( \d{3})+([.,]\d+)?$/.test(x)) x = x.replace(/ /g, '');
    const v = Number(decimalComma ? x.replace(',', '.') : x);
    return Number.isFinite(v) ? v : null;
  };
  const first = split(lines[0]);
  const hasHeader = first.some((c) => c !== '' && num(c) === null);
  const headers = hasHeader ? first : first.map((_, i) => `col${i + 1}`);
  const body = (hasHeader ? lines.slice(1) : lines).map(split);
  const rows = body.map((c) => headers.map((_, i) => num(c[i])));
  const cells = body.map((c) => headers.map((_, i) => c[i] ?? ''));
  // V0.38: cells with text in mostly numeric columns are read as empty: counted so the interface can warn
  let dropped = 0; const droppedCols = [];
  headers.forEach((h, i) => {
    const filled = cells.filter((r) => r[i] !== ''), ok = rows.filter((r) => r[i] != null).length, bad = filled.length - ok;
    if (bad > 0 && ok >= bad) { dropped += bad; droppedCols.push(h); }
  });
  const short = body.filter((c) => c.length < headers.length).length;
  return { headers, rows, text: cells, dropped, droppedCols, short };
}

/** V0.38: text of a file, as UTF-8 or, if it is not valid UTF-8 (e.g. Excel CSV on Windows), as Windows-1252. */
export function decodeText(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); }
}

/** Guess which column holds depth/age and which axis it is. */
export function guessAxisColumn(headers) {
  const i = headers.findIndex((h) => /age|edad|\bka\b|\bma\b|yr|años|cal/i.test(h));
  const j = headers.findIndex((h) => /depth|prof|mbsf|csf|ccsf|mcd|\bm\b|cm/i.test(h));
  if (j >= 0) return { col: j, axis: 'depth' };
  if (i >= 0) return { col: i, axis: 'age' };
  return { col: 0, axis: 'depth' };
}

export function niceTicks(a, b, n = 5) {
  if (!(b > a)) return [a];
  const raw = (b - a) / n, mag = 10 ** Math.floor(Math.log10(raw));
  const st = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const out = [];
  for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + st * 1e-9; v += st) out.push(+v.toFixed(10));
  return out;
}

/** Vertical ticks in displayed units, shared by column and publication figures. */
export function verticalTicks(from, to, height, style = {}) {
  const f = +style.yFactor || 1, step = +style.yStep;
  if (step > 0) {
    const out = [], a = Math.ceil(from * f / step - 1e-9), b = Math.floor(to * f / step + 1e-9);
    for (let k = a; k <= b && out.length < 400; k++) out.push(k * step / f || 0);
    return out;
  }
  return niceTicks(from * f, to * f, style.yDiv > 0 ? style.yDiv : Math.max(3, Math.round(height / 70))).map((v) => v / f);
}

/**
 * V0.22: extra ticks of the vertical axis without labels. Steps are in displayed units (× yFactor):
 * yMajor = long ticks (default: none besides the labelled ones), yMinor = short ticks. Returns [{ v, len }] in axis units,
 * skipping positions that already carry a labelled tick (or a long tick, for the short ones).
 */
export function extraTicks(from, to, height, style = {}) {
  const f = +style.yFactor || 1, out = [], lab = verticalTicks(from, to, height, style), eps = Math.abs(to - from) * 1e-7 + 1e-12;
  const near = (list, v) => list.some((u) => Math.abs(u - v) < eps);
  const steps = (step) => { const r = []; if (!(step > 0)) return r; const a = Math.ceil(Math.min(from, to) * f / step - 1e-9), b = Math.floor(Math.max(from, to) * f / step + 1e-9); if (b - a > 4000) return r; for (let k = a; k <= b; k++) r.push(k * step / f || 0); return r; };
  const major = steps(+style.yMajor).filter((v) => !near(lab, v));
  const minor = steps(+style.yMinor).filter((v) => !near(lab, v) && !near(major, v));
  for (const v of major) out.push({ v, len: +style.yMajorLen > 0 ? +style.yMajorLen : 6 });
  for (const v of minor) out.push({ v, len: +style.yMinorLen > 0 ? +style.yMinorLen : 3 });
  return out;
}
const labelLen = (st) => (+st?.yLabelLen > 0 ? +st.yLabelLen : 6);

/** V0.33: reorder (st.colOrder) and hide (st.colHide) columns in place, keeping the first `keep` columns fixed. */
export function orderCols(cols, st = {}, keep = 0) {
  const ord = st.colOrder || [], hide = new Set(st.colHide || []), rank = (c) => { const k = ord.indexOf(c.id); return k < 0 ? 1e6 : k; };
  const body = cols.slice(keep).map((c, i) => ({ c, i })).filter(({ c }) => !hide.has(c.id)).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map(({ c }) => c);
  cols.splice(keep, cols.length - keep, ...body);
  return cols;
}

export function niceRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) { min -= Math.abs(min) * 0.1 || 1; max += Math.abs(max) * 0.1 || 1; }
  const t = niceTicks(min, max, 4), st = t.length > 1 ? t[1] - t[0] : 1;
  return [Math.floor(min / st + 1e-9) * st, Math.ceil(max / st - 1e-9) * st];
}

/** Age model swapped to age → depth (assumes ages increase monotonically with depth). */
export function invertModel(m) {
  if (!m) return null;
  const p = m.depth.map((d, i) => [m.age[i], d]).sort((a, b) => a[0] - b[0]);
  return { depth: p.map((x) => x[0]), age: p.map((x) => x[1]) };
}

/** Convert a value from one axis (depth/age) to another with the age model; null if impossible. */
export function toAxis(v, from, to, model, inverse = invertModel(model)) {
  if (v == null) return null;
  if (from === to) return v;
  if (!model) return null;
  return from === 'depth' ? interpAge(model, v) : interpAge(inverse, v);
}

/**
 * Interval rows of all sections on the chosen axis.
 * sections: [{name, bins}] with bins in common depth units (dTop, dBottom, depth, pct, classPct, BI, ii, BIm, iim).
 */
export function compositeRows(sections, { axis, model }) {
  const rows = [];
  for (const s of sections) {
    for (const b of s.bins) {
      const age = interpAge(model, b.depth);
      let a0 = b.dTop, a1 = b.dBottom, c = b.depth;
      if (axis === 'age') {
        a0 = interpAge(model, b.dTop); a1 = interpAge(model, b.dBottom); c = age;
        if (a0 == null || a1 == null) continue;
      }
      rows.push({ ...b, section: s.name, a0: Math.min(a0, a1), a1: Math.max(a0, a1), c, age });
    }
  }
  return rows.sort((p, q) => p.a0 - q.a0);
}

export function rowsRange(rows) {
  if (!rows.length) return [0, 1];
  return [Math.min(...rows.map((r) => r.a0)), Math.max(...rows.map((r) => r.a1))];
}

/** Identification marker: its reference point remains at the trace depth. */
export function traceSymbolPath(kind = 'triDown') {
  if (kind === 'circle') return 'M4.5 -4a4.5 4.5 0 1 0 -9 0a4.5 4.5 0 1 0 9 0';
  if (kind === 'square') return 'M-4 -8h8v8h-8z';
  if (kind === 'diamond') return 'M0 -9L5 -4L0 1L-5 -4z';
  if (kind === 'tri') return 'M0 -8L4.5 0h-9z';
  if (kind === 'cross') return 'M-5 -7L-3 -9L0 -6L3 -9L5 -7L2 -4L5 -1L3 1L0 -2L-3 1L-5 -1L-2 -4z';
  if (kind === 'star') return Array.from({length:10}, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.2 : 5.5; return `${i ? 'L' : 'M'}${f2(r * Math.cos(a))} ${f2(-4 + r * Math.sin(a))}`; }).join('') + 'z';
  return 'M0 0l-4.5 -8h9z';
}
let SYM = { k: 1, stroke: '#ffffff', sw: 0.8 };   // V0.23: marker size and border of the current figure
const traceSymbol = (x, y, color, kind) => `<path transform="translate(${f2(x)} ${f2(y)})${SYM.k !== 1 ? ` scale(${f2(SYM.k)})` : ''}" d="${traceSymbolPath(kind)}" fill="${color}" stroke="${SYM.stroke}" stroke-width="${SYM.sw}"/>`;
/** V0.23: style of NO DATA intervals: show, fill (hatch / solid / none), colours and label. */
export const ND_STYLE = { ndShow: true, ndFill: 'hatch', ndColor: '#f2f2f0', ndLine: '#b9bdbb', ndLabel: true, ndText: '', ndImage: false };
export function noDataDefs(st) {
  const q = { ...ND_STYLE, ...(st || {}) };
  return `<pattern id="nodata" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${q.ndColor}"/>${q.ndFill === 'hatch' ? `<line x1="0" y1="0" x2="0" y2="6" stroke="${q.ndLine}" stroke-width="1.6"/>` : ''}</pattern>`;
}
/** NO DATA rectangle (and label) for one column; '' when hidden. */
export function noDataRect(st, x, w, ya, h, text) {
  const q = { ...ND_STYLE, ...(st || {}) };
  if (!q.ndShow || q.ndFill === 'none' || h <= 0) return '';
  let r = `<rect x="${f2(x)}" y="${f2(ya)}" width="${f2(w)}" height="${f2(Math.max(0.4, h))}" fill="url(#nodata)"/>`;
  if (q.ndLabel && h >= 12 && w >= 44) r += `<text x="${f2(x + w / 2)}" y="${f2(ya + h / 2 + 3)}" text-anchor="middle" font-size="8.5" font-weight="600" fill="#6b7471">${escXml(q.ndText || text || 'NO DATA')}</text>`;
  return r;
}
/** Intervals without data among rows (merged when contiguous). */
export function noDataGaps(rows) {
  const gaps = [];
  for (const r of rows) {
    if (r.pct != null) continue;
    const g = gaps[gaps.length - 1];
    if (g && Math.abs(r.a0 - g.a1) < 1e-9) g.a1 = r.a1; else gaps.push({ a0: r.a0, a1: r.a1 });
  }
  return gaps;
}
const escXml = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const f2 = (v) => +(+v).toFixed(2);
const lbl = (v) => String(+(+v).toPrecision(6));

/** Split a track name into at most two lines of about w px (10 px font); the second line ends in … if cut. */
export function wrapTitle(text, w) {
  // V0.27: long names also break after "_", "-" or "/" (magnetic_ / susceptibility_IU)
  const max = Math.max(4, Math.floor((w - 4) / 5.6)), parts = String(text ?? '').match(/\s*[^\s_\-/]+[_\-/]*|\s*[_\-/]+/g) || [], lines = [''];
  for (const raw of parts) {
    const sp = /^\s/.test(raw), wd = raw.trim(), cur = lines[lines.length - 1], next = cur ? cur + (sp ? ' ' : '') + wd : wd;
    if (next.length <= max || !cur) lines[lines.length - 1] = next; else lines.push(wd);
  }
  const out = lines.slice(0, 2).map((l) => (l.length > max ? l.slice(0, max - 1) + '…' : l));
  if (lines.length > 2) out[1] = (out[1].length >= max ? out[1].slice(0, max - 1) : out[1]) + '…';
  return out;
}

/**
 * Build the composite log as an SVG string.
 * o = { title, subtitle, axisLabel, from, to, height, rows, classes:[{name,color,index}],
 *       tracks:{image,total,species,BI,ii,manual}, image:{href}|null, imageWidth,
 *       records:[{name, color, reverse, pts:[[axisValue, y], ...]}], boundaries:[{a,label}], labels:{...},
 *       bands:[{title, full, key, w, segs:[{a0,a1,color,opacity}]}] (key: stable id for widths and clicks),
 *       marks:[{a, xf, color, abbr}] (identified traces: triangle on the image at relative x xf),
 *       idList:[{a0, a1, items:[{name, abbr, color, plain}]}] (identified ichnotaxa per interval, column at the right),
 *       legendClasses:[{name, color}] (ichnotaxa legend, always drawn when given), bandLegend, shade:[{a0,a1,color}] (class colours behind the record curves) }
 */
/**
 * V0.5: style of the column and its figure. yFactor converts axis values to the displayed unit (e.g. m → cm: 100);
 * yStep (displayed units) or yDiv (approximate number of divisions) set the vertical ticks; pctDiv the divisions of
 * the 0–100 % axes; totalStyle: 'barsline' | 'bars' | 'line' | 'points'; frame/grid/boundaries on or off; custom
 * titles for the bioturbation and ichnotaxa columns; fontSize and whether title/subtitle are drawn.
 */
export const LOG_STYLE = { yFactor: 1, yStep: null, yDiv: null, pctDiv: 4, totalStyle: 'barsline', barColor: '#e7c9a5', lineColor: '#a85f1c',
  frame: true, grid: true, boundaries: true, totalTitle: '', speciesTitle: '', fontSize: 10, showTitle: true,
  axes: {} };   // V0.6: per column {min, max, div, dec, rev, log} keyed by column id (total, species, BI, ii, rec:<name>)
export function buildLogSVG(o) {
  const st = { ...LOG_STYLE, ...(o.style || {}) };
  SYM = { k: +st.markSize > 0 ? +st.markSize : 1, stroke: st.markStroke === 'none' ? 'none' : st.markStroke || '#ffffff', sw: +st.markStrokeW >= 0 && st.markStrokeW != null ? +st.markStrokeW : 0.8 };
  const L = { total: 'Bioturbation (%)', species: 'Ichnotaxa (%)', image: 'Core', ...(o.labels || {}) };
  if (st.totalTitle) L.total = st.totalTitle;
  if (st.speciesTitle) L.species = st.speciesTitle;
  const H = o.height, top = 84, from = o.from, to = o.to;
  const span = to - from || 1;
  const y = (v) => f2(top + ((v - from) / span) * H);
  const rows = o.rows.filter((r) => r.a1 > from && r.a0 < to);
  const cols = [];
  const t = o.tracks, cw = o.colWidths || {}, wOf = (id, d) => Math.max(30, Math.min(600, +cw[id] || d));
  cols.push({ key: 'axis', w: 64 });
  if (t.image && o.images?.length) for (const im of o.images) cols.push({ key: 'image', w: im.w || o.imageWidth || 60, title: im.title || L.image, img: im });   // V0.23: several panels
  else if (t.image && o.image) cols.push({ key: 'image', w: o.imageWidth || 60, title: L.image, img: o.image });
  if (t.total) cols.push({ key: 'total', id: 'total', w: wOf('total', 150), title: L.total });
  // V0.31: ichnotaxa can be hidden (style.speciesHide, names) and drawn stacked in one column or each in its own (speciesMode 'separate')
  const spHide = new Set(st.speciesHide || []), presentClasses = o.classes.filter((c) => !spHide.has(c.name) && rows.some((r) => (r.classPct[c.index] || 0) > 0));
  if (t.species && st.speciesMode === 'separate') for (const k of presentClasses) { const id = 'sp:' + k.name; cols.push({ key: 'sp1', id, w: wOf(id, 70), title: k.name, cls: k }); }
  else if (t.species) cols.push({ key: 'species', id: 'species', w: wOf('species', 150), title: L.species });
  if (t.BI) cols.push({ key: 'BI', id: 'BI', w: wOf('BI', 46), title: 'BI' });
  if (t.ii) cols.push({ key: 'ii', id: 'ii', w: wOf('ii', 46), title: 'ii' });
  for (const b of o.bands || []) { const id = 'band:' + (b.key || b.full || b.title); cols.push({ key: 'band', id, w: wOf(id, b.w || 46), title: b.title, full: b.full, band: b }); }
  for (const r of o.records) { const id = 'rec:' + r.name; cols.push({ key: 'rec', id, w: wOf(id, o.recWidth || 120), title: r.name, rec: r }); }
  if (o.marks?.length && !(t.image && o.image)) cols.splice(1, 0, { key: 'marks', id: 'marks', w: wOf('marks', 40), title: L.marks || 'Traces' });
  if (o.idList) cols.push({ key: 'idlist', id: 'idlist', w: wOf('idlist', 150), title: L.idList || 'Identified ichnotaxa' });
  // V0.33: column order (style.colOrder, ids) and hidden columns (style.colHide, ids; nothing is deleted); the axis stays first
  cols.forEach((c, i) => { if (!c.id && c.key === 'image') c.id = 'image:' + (c.img?.title || i); });
  const allCols = cols.filter((c) => c.key !== 'axis').map((c) => ({ id: c.id, title: c.full || c.title, key: c.key }));
  orderCols(cols, st, 1);
  let x = 8;
  for (const c of cols) { c.x = x; x += c.w + 14; }
  const W = x;
  const seenL = new Set(), legendItems = [...(t.species ? presentClasses : []), ...(o.legendClasses || []), ...(o.bandLegend || [])].filter((k) => !seenL.has(k.name) && seenL.add(k.name));
  const perRow = Math.max(1, Math.floor((W - 16) / 170));
  const legendH = legendItems.length ? Math.ceil(legendItems.length / perRow) * 16 + 14 : 0;
  const Htot = top + H + 22 + legendH;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${Htot}" viewBox="0 0 ${W} ${Htot}" font-family="IBM Plex Sans, Arial, Helvetica, sans-serif" font-size="${st.fontSize}">`);
  out.push(`<rect x="0" y="0" width="${W}" height="${Htot}" fill="#ffffff"/>`);
  out.push(`<defs><clipPath id="plot"><rect x="0" y="${top}" width="${W}" height="${H}"/></clipPath>${noDataDefs(st)}</defs>`);
  // V0.3: intervals without data (excluded or too few valid pixels) are drawn as NO DATA, never as 0
  const gaps = noDataGaps(rows);
  if (st.showTitle) {
    out.push(`<text x="8" y="16" font-size="${st.fontSize + 3}" font-weight="600" fill="#1c2422">${escXml(o.title || '')}</text>`);
    if (o.subtitle) out.push(`<text x="8" y="31" fill="#5b6763">${escXml(o.subtitle)}</text>`);
  }

  const fy = +st.yFactor || 1, yTicks = verticalTicks(from, to, H, st);
  const frame = (c) => { if (st.frame) out.push(`<rect x="${c.x}" y="${top}" width="${c.w}" height="${H}" fill="none" stroke="#9aa5a1" stroke-width="0.8"/>`); };
  // track names: up to two lines that fit the column width (V25); the full name is in the returned layout
  const title = (c) => {
    if (c.w < 34 && c.title) { out.push(`<text transform="translate(${f2(c.x + c.w / 2 + 3)},80) rotate(-90)" text-anchor="start" font-size="9" font-weight="600" fill="#1c2422">${escXml(c.title)}</text>`); return; }   // V0.27: narrow columns, upright title
    const ls = wrapTitle(c.title, c.w);
    out.push(`<text x="${c.x + c.w / 2}" y="${ls.length > 1 ? 46 : 54}" text-anchor="middle" font-weight="600" fill="#1c2422">${ls.map((l, i) => `<tspan x="${c.x + c.w / 2}" dy="${i ? 12 : 0}">${escXml(l)}</tspan>`).join('')}</text>`);
  };
  // V0.6: axis of a column; the user may fix min/max, divisions, decimals, invert it or (records) use a log scale
  const xScale = (c, lo, hi, reverse = false, ticks = null) => {
    const ax = (st.axes || {})[c.id || c.key] || {};
    if (ax.min != null && ax.min !== '') lo = +ax.min;
    if (ax.max != null && ax.max !== '') hi = +ax.max;
    if (ax.rev) reverse = !reverse;
    if (ax.log && !(lo > 0) && ax.min == null) lo = hi > 0 ? hi / 1000 : 0.001;
    if (!(hi > lo) || (ax.log && !(lo > 0))) throw new Error('Invalid horizontal axis: max > min; logarithmic limits must be positive.');
    const lg = !!ax.log, tf = (v) => (lg ? Math.log10(Math.max(v, 1e-12)) : v), L0 = tf(lo), L1 = tf(hi);
    const sx = (v) => f2(c.x + ((reverse ? L1 - tf(v) : tf(v) - L0) / (L1 - L0 || 1)) * c.w);
    sx.base = sx(lg ? lo : Math.min(Math.max(0, lo), hi));
    if (ax.step > 0 && !lg) { ticks = []; for (let v = Math.ceil(lo / ax.step) * ax.step; v <= hi && ticks.length < 400; v += ax.step) ticks.push(v); }
    else if (ax.div > 0 || lg) {
      if (lg) { ticks = []; for (let e = Math.floor(L0); e <= Math.ceil(L1); e++) { const v = 10 ** e; if (v >= lo * 0.999 && v <= hi * 1.001) ticks.push(v); } }
      else ticks = Array.from({ length: Math.min(400, Math.round(ax.div)) + 1 }, (_, k) => lo + ((hi - lo) * k) / Math.min(400, Math.round(ax.div)));
    }
    const fmtT = (v) => (ax.dec != null && ax.dec !== '' ? (+v).toFixed(Math.max(0, Math.min(6, +ax.dec))) : lbl(v));
    out.push('</g><g>');
    for (const tv of (ticks || niceTicks(lo, hi, 3)).filter((v) => v >= lo && v <= hi)) {
      const xx = sx(tv);
      if (st.grid) out.push(`<line x1="${xx}" y1="${top}" x2="${xx}" y2="${top + H}" stroke="#e3e8e6" stroke-width="0.6"/>`);
      out.push(`<line x1="${xx}" y1="${top - 4}" x2="${xx}" y2="${top}" stroke="#5b6763" stroke-width="0.6"/>`);
      out.push(`<text x="${xx}" y="${top - 7}" text-anchor="middle" fill="#5b6763" font-size="9">${fmtT(tv)}</text>`);
    }
    out.push(`</g><g clip-path="url(#track-${c.x})">`);
    sx.log = lg; return sx;
  };

  for (const c of cols) {
    if (c.key === 'axis') {
      out.push(`<text transform="translate(${c.x + 10},${top + H / 2}) rotate(-90)" text-anchor="middle" fill="#1c2422" font-weight="600">${escXml(o.axisLabel)}</text>`);
      for (const v of yTicks) {
        const yy = y(v);
        out.push(`<line x1="${c.x + c.w - labelLen(st)}" y1="${yy}" x2="${c.x + c.w}" y2="${yy}" stroke="#1c2422" stroke-width="0.8"/>`);
        out.push(`<text x="${c.x + c.w - labelLen(st) - 3}" y="${yy + 3}" text-anchor="end" fill="#1c2422">${lbl(v * fy)}</text>`);
      }
      for (const e of extraTicks(from, to, H, st)) out.push(`<line x1="${c.x + c.w - e.len}" y1="${y(e.v)}" x2="${c.x + c.w}" y2="${y(e.v)}" stroke="#1c2422" stroke-width="0.6"/>`);
      out.push(`<line x1="${c.x + c.w}" y1="${top}" x2="${c.x + c.w}" y2="${top + H}" stroke="#1c2422" stroke-width="0.8"/>`);
      continue;
    }
    title(c);
    out.push(`<defs><clipPath id="track-${c.x}"><rect x="${c.x}" y="${top}" width="${c.w}" height="${H}"/></clipPath></defs><g clip-path="url(#track-${c.x})">`);
    if (['total', 'species', 'sp1', 'BI', 'ii'].includes(c.key)) for (const g of gaps) {
      const ya = y(Math.max(g.a0, from)), yb = y(Math.min(g.a1, to));
      out.push(noDataRect(st, c.x, c.w, ya, yb - ya, L.noData));
    }
    if (c.key === 'image') {
      out.push(`<image x="${c.x}" y="${top}" width="${c.w}" height="${H}" preserveAspectRatio="none" href="${c.img.href}" xlink:href="${c.img.href}"/>`);
      if (st.ndImage) for (const g of gaps) { const ya = y(Math.max(g.a0, from)), yb = y(Math.min(g.a1, to)); out.push(noDataRect(st, c.x, c.w, ya, yb - ya, L.noData)); }
      if (typeof c.img.draw === 'function') out.push(c.img.draw(c.x, c.w, y));   // V0.23: overlay (e.g. arrows) drawn by the caller
      if (c.img.marks !== false) for (const m of o.marks || []) if (m.a >= from && m.a <= to) out.push(traceSymbol(c.x + Math.min(1, Math.max(0, m.xf)) * c.w, y(m.a), m.color, m.symbol));
    } else if (c.key === 'total') {
      const nd = Math.max(1, Math.min(20, Math.round(st.pctDiv) || 4)), sx = xScale(c, 0, 100, false, Array.from({ length: nd + 1 }, (_, k) => +((100 * k) / nd).toFixed(4)));
      const bars = st.totalStyle === 'barsline' || st.totalStyle === 'bars', line = st.totalStyle === 'barsline' || st.totalStyle === 'line';
      let d = '', prev = null;
      for (const r of rows) {
        if (r.pct == null || (sx.log && r.pct <= 0)) { prev = null; continue; }
        if (bars) out.push(`<rect x="${f2(Math.min(sx.base, sx(r.pct)))}" y="${y(r.a0)}" width="${f2(Math.abs(sx(r.pct) - sx.base))}" height="${f2(Math.max(0.3, y(r.a1) - y(r.a0)))}" fill="${st.barColor}"/>`);
        if (st.totalStyle === 'points') out.push(`<circle cx="${sx(r.pct)}" cy="${f2((y(r.a0) + y(r.a1)) / 2)}" r="2.2" fill="${st.lineColor}"/>`);
        d += prev && Math.abs(r.a0 - prev.a1) < 1e-9 ? `L${sx(r.pct)} ${y(r.a0)}` : `M${sx(r.pct)} ${y(r.a0)}`;
        d += `L${sx(r.pct)} ${y(r.a1)}`;
        prev = r;
      }
      if (d && line) out.push(`<path d="${d}" fill="none" stroke="${st.lineColor}" stroke-width="1.2"/>`);
    } else if (c.key === 'species') {
      const max = Math.max(1, ...rows.map((r) => presentClasses.reduce((s, k) => s + (r.classPct[k.index] || 0), 0)));
      const [, hi] = niceRange(0, max);
      const sx = xScale(c, 0, hi);
      for (const r of rows) {
        let acc = 0;
        for (const k of presentClasses) {
          const v = r.classPct[k.index] || 0; if (!v) continue;
          out.push(`<rect x="${f2(Math.min(sx(acc), sx(acc + v)))}" y="${y(r.a0)}" width="${f2(Math.abs(sx(acc + v) - sx(acc)))}" height="${f2(Math.max(0.3, y(r.a1) - y(r.a0)))}" fill="${k.color}"/>`);
          acc += v;
        }
      }
    } else if (c.key === 'sp1') {   // V0.31: one ichnotaxon per column, own scale (editable in the axes table as sp:<name>)
      const k = c.cls, [, hi] = niceRange(0, Math.max(1, ...rows.map((r) => r.classPct[k.index] || 0))), sx = xScale(c, 0, hi);
      for (const r of rows) {
        const v = r.classPct[k.index] || 0; if (!v || (sx.log && v <= 0)) continue;
        out.push(`<rect x="${f2(Math.min(sx.base, sx(v)))}" y="${y(r.a0)}" width="${f2(Math.abs(sx(v) - (sx.base)))}" height="${f2(Math.max(0.3, y(r.a1) - y(r.a0)))}" fill="${k.color}"/>`);
      }
    } else if (c.key === 'BI' || c.key === 'ii') {
      const lo = c.key === 'BI' ? 0 : 1;
      const sx = xScale(c, 0, 6, false, c.key === 'BI' ? [0, 3, 6] : [1, 3, 6]);
      for (const r of rows) {
        const v = r[c.key];
        if (v != null && v >= lo && (!sx.log || v > 0)) out.push(`<rect x="${f2(Math.min(sx.base, sx(v)))}" y="${y(r.a0)}" width="${f2(Math.abs(sx(v) - sx.base))}" height="${f2(Math.max(0.3, y(r.a1) - y(r.a0)))}" fill="#c98a4b"/>`);
        const m = t.manual ? r[c.key === 'BI' ? 'BIm' : 'iim'] : null;
        if (m != null) out.push(`<line x1="${sx(m)}" y1="${y(r.a0)}" x2="${sx(m)}" y2="${y(r.a1)}" stroke="#1c2422" stroke-width="2"/>`);
      }
    } else if (c.key === 'band') {
      for (const g of c.band.segs) {
        if (g.a1 <= from || g.a0 >= to) continue;
        out.push(`<rect x="${c.x}" y="${y(g.a0)}" width="${c.w}" height="${f2(Math.max(0.4, y(g.a1) - y(g.a0)))}" fill="${g.color}"${g.opacity != null ? ` fill-opacity="${g.opacity}"` : ''}/>`);
      }
    } else if (c.key === 'idlist') {
      // identified ichnotaxa per interval: thin bracket and one line per taxon (abbreviations if the interval is short)
      let lastY = -Infinity;
      for (const g of o.idList) {
        if (g.a1 <= from || g.a0 >= to || !g.items.length) continue;
        const ya = y(Math.max(g.a0, from)), yb = y(Math.min(g.a1, to));
        out.push(`<path d="M${c.x + 6} ${ya}h-3V${yb}h3" fill="none" stroke="#9aa5a1" stroke-width="0.8"/>`);
        const short = (yb - ya) < g.items.length * 11, lines = short ? [g.items] : g.items.map((k) => [k]);
        let yy = Math.max(ya + 9, lastY + 11);
        for (const line of lines) {
          if (yy > top + H - 2) break;
          let xx = c.x + 10;
          out.push(`<text x="${xx}" y="${yy}" fill="#1c2422" font-size="9.5">${line.map((k, i) => `<tspan fill="${k.color}" font-weight="700">■</tspan><tspan font-style="${k.plain ? 'normal' : 'italic'}"> ${escXml(short ? k.abbr : k.name)}${i < line.length - 1 ? ', ' : ''}</tspan>`).join('')}</text>`);
          lastY = yy; yy += 11;
        }
      }
    } else if (c.key === 'marks') {
      for (const m of o.marks) if (m.a >= from && m.a <= to) out.push(traceSymbol(c.x + c.w / 2, y(m.a), m.color, m.symbol));
    } else if (c.key === 'rec') {
      const pts = c.rec.pts.filter((p) => p[0] != null && p[1] != null && p[0] >= from - span * 0.02 && p[0] <= to + span * 0.02);
      if (pts.length) {
        const [lo, hi] = niceRange(Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1])));
        const sx = xScale(c, lo, hi, c.rec.reverse);
        // V0.34: several families: side by side (g.lane of o.shadeLanes) or blended (translucent layers over each other)
        const nl = Math.max(1, o.shadeLanes || 1);
        for (const g of o.shade || []) if (g.a1 > from && g.a0 < to) out.push(`<rect x="${f2(c.x + ((g.lane || 0) * c.w) / nl)}" y="${y(Math.max(g.a0, from))}" width="${f2(c.w / nl)}" height="${f2(Math.max(0.4, y(Math.min(g.a1, to)) - y(Math.max(g.a0, from))))}" fill="${g.color}" fill-opacity="${g.fo ?? 0.22}"/>`);
        if (!sx.log) out.push(`<polyline fill="none" stroke="${c.rec.color}" stroke-width="1.1" points="${pts.map((p) => `${sx(p[1])},${y(p[0])}`).join(' ')}"/>`);
        let path = '', connected = false;
        for (const p of sx.log ? pts : []) { if (sx.log && p[1] <= 0) { connected = false; continue; } path += `${connected ? 'L' : 'M'}${sx(p[1])} ${y(p[0])}`; connected = true; }
        if (sx.log) out.push(`<path fill="none" stroke="${c.rec.color}" stroke-width="1.1" d="${path}"/>`);
      }
    }
    out.push('</g>');
    frame(c);
  }
  for (const b of st.boundaries ? o.boundaries || [] : []) {
    if (b.a <= from || b.a >= to) continue;
    out.push(`<line x1="${cols[0].x + cols[0].w}" y1="${y(b.a)}" x2="${W - 14}" y2="${y(b.a)}" stroke="#5b6763" stroke-width="0.6" stroke-dasharray="3 3"/>`);
    if (b.label) out.push(`<text x="${W - 16}" y="${y(b.a) - 2}" text-anchor="end" fill="#5b6763" font-size="8">${escXml(b.label)}</text>`);
  }
  legendItems.forEach((k, i) => {
    const lx = 8 + (i % perRow) * 170, ly = top + H + 22 + Math.floor(i / perRow) * 16;
    out.push(`${k.symbol ? traceSymbol(lx + 5, ly + 9, k.color, k.symbol) : `<rect x="${lx}" y="${ly}" width="10" height="10" fill="${k.color}"/>`}<text x="${lx + 14}" y="${ly + 9}" fill="#1c2422">${escXml(k.name)}</text>`);
  });
  out.push('</svg>');
  return { svg: out.join(''), width: W, height: Htot, plotTop: top, plotHeight: H, columns: allCols,
    layout: cols.filter((c) => c.key !== 'axis').map((c) => ({ id: c.id || null, key: c.key, x: c.x, w: c.w, title: c.full || c.title, bkey: c.band?.key || null })) };
}

/** Unique short labels for ichnotaxa (Chondrites → Ch, Planolites → Pl…): 2 letters, 3 if two names collide. */
export function abbrevs(names) {
  const out = new Map(), used = new Set();
  for (const n of names) {
    const w = String(n).replace(/\(.*?\)/g, '').trim(), letters = w.replace(/[^\p{L}]/gu, '');
    const cand = [letters.slice(0, 2), letters[0] + (letters[2] || ''), letters.slice(0, 3), letters.slice(0, 4)].map((c) => c && c[0].toUpperCase() + c.slice(1).toLowerCase());
    let a = cand.find((c) => c && !used.has(c)) || `${letters.slice(0, 2)}${out.size}`;
    used.add(a); out.set(n, a);
  }
  return out;
}

/**
 * Ichnotaxa range chart: one column per ichnotaxon along depth or age; bars proportional to its percentage in each
 * interval (scaled to its own maximum) or, with presence, a mark where it was identified. o = {title, subtitle,
 * axisLabel, from, to, height, rows:[{a0,a1,classPct}], classes:[{name,color,index,plain}], presence:[{a0,a1,index}],
 * total: bool (bioturbation % column)}.
 */
export function buildRangeSVG(o) {
  const H = o.height, from = o.from, to = o.to, span = to - from || 1, colW = Math.max(16, Math.min(200, +o.colW || 30)), x0 = 72;   // V0.51: column width
  const longest = Math.max(8, ...o.classes.map((c) => String(c.name).length)), top = 46 + Math.min(150, longest * 5.2 * 0.87);   // room for names at 60°
  const y = (v) => f2(top + ((v - from) / span) * H);
  const rows = (o.rows || []).filter((r) => r.a1 > from && r.a0 < to), display = o.display || 'symbols';
  const spHide = new Set(o.style?.speciesHide || []);   // V0.31
  const inWin = (p) => (p.a != null ? p.a >= from && p.a <= to : p.a1 > from && p.a0 < to);
  const cols = o.classes.filter((c) => !spHide.has(c.name)).filter((c) => rows.some((r) => (r.classPct?.[c.index] || 0) > 0) || [...(o.presence || []), ...(o.points || [])].some((p) => p.index === c.index && inWin(p)));
  const allCols = cols.map((c) => ({ id: 'sp:' + c.name, title: c.name, key: 'sp' }));   // V0.33: ichnotaxon columns can be reordered and hidden
  cols.forEach((c) => { c.id = 'sp:' + c.name; }); orderCols(cols, o.style || {});
  const totW = o.total ? 90 : 0, W = x0 + totW + (o.total ? 14 : 0) + cols.length * colW + 20 + Math.min(110, longest * 5.2 * 0.5), Htot = top + H + 26;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Htot}" viewBox="0 0 ${W} ${Htot}" font-family="IBM Plex Sans, Arial, Helvetica, sans-serif" font-size="10">`,
    `<rect width="${W}" height="${Htot}" fill="#ffffff"/>`, `<text x="8" y="16" font-size="13" font-weight="600" fill="#1c2422">${escXml(o.title || '')}</text>`];
  if (o.subtitle) out.push(`<text x="8" y="31" fill="#5b6763">${escXml(o.subtitle)}</text>`);
  for (const v of verticalTicks(from, to, H, o.style)) {
    out.push(`<line x1="${x0 - labelLen(o.style)}" y1="${y(v)}" x2="${x0}" y2="${y(v)}" stroke="#1c2422" stroke-width="0.8"/><text x="${x0 - labelLen(o.style) - 3}" y="${y(v) + 3}" text-anchor="end" fill="#1c2422">${lbl(v * (+o.style?.yFactor || 1))}</text>`);
    out.push(`<line x1="${x0}" y1="${y(v)}" x2="${W - 14}" y2="${y(v)}" stroke="#eef1f0" stroke-width="0.6"/>`);
  }
  for (const e of extraTicks(from, to, H, o.style)) out.push(`<line x1="${x0 - e.len}" y1="${y(e.v)}" x2="${x0}" y2="${y(e.v)}" stroke="#1c2422" stroke-width="0.6"/>`);
  out.push(`<line x1="${x0}" y1="${top}" x2="${x0}" y2="${top + H}" stroke="#1c2422" stroke-width="0.8"/>`);
  out.push(`<text transform="translate(16,${top + H / 2}) rotate(-90)" text-anchor="middle" font-weight="600" fill="#1c2422">${escXml(o.axisLabel || '')}</text>`);
  {   // V0.23: NO DATA intervals across the plot (style: show, fill, colours, label)
    const st = o.style || {}; SYM = { k: +st.markSize > 0 ? +st.markSize : 1, stroke: st.markStroke === 'none' ? 'none' : st.markStroke || '#ffffff', sw: st.markStrokeW != null && +st.markStrokeW >= 0 ? +st.markStrokeW : 0.8 };
    out.push(`<defs>${noDataDefs(st)}</defs>`);
    for (const g of noDataGaps(rows)) { const ya = y(Math.max(g.a0, from)), yb = y(Math.min(g.a1, to)); out.push(noDataRect(st, x0, W - 14 - x0, ya, yb - ya, o.labels?.noData)); }
  }
  const rangeScale = (id, x, w, defaultMax) => {
    const ax = id === 'species' && display === 'symbols' ? {} : o.style?.axes?.[id] || {}, hi = ax.max ?? defaultMax, lo = ax.min ?? (ax.log ? hi / 1000 : 0);
    if (!(hi > lo) || (ax.log && !(lo > 0))) throw new Error('Invalid horizontal axis: max > min; logarithmic limits must be positive.');
    const tf = (v) => ax.log ? Math.log10(Math.max(v, 1e-12)) : v;
    const sx = (v) => x + (ax.rev ? 1 - (tf(v) - tf(lo)) / (tf(hi) - tf(lo)) : (tf(v) - tf(lo)) / (tf(hi) - tf(lo))) * w;
    let ticks = niceTicks(lo, hi, ax.div || 3);
    if (ax.log) { ticks = []; for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) ticks.push(10 ** e); }
    else if (ax.step > 0) { ticks = []; for (let k = Math.ceil(lo / ax.step); k * ax.step <= hi && ticks.length < 400; k++) ticks.push(k * ax.step); }
    else if (ax.div > 0) { const n = Math.min(400, Math.max(1, Math.round(ax.div))); ticks = Array.from({length:n + 1}, (_, i) => lo + i * (hi - lo) / n); }
    for (const v of (Object.keys(ax).length ? ticks : []).filter((v) => v >= lo && v <= hi)) out.push(`<text x="${f2(sx(v))}" y="${top + H + 14}" text-anchor="middle" font-size="8">${ax.dec != null ? v.toFixed(Math.min(6, Math.max(0, ax.dec))) : lbl(v)}</text>`);
    out.push(`<defs><clipPath id="range-${x}"><rect x="${x}" y="${top}" width="${id === 'species' && !Object.keys(ax).length ? w + 6 : w}" height="${H}"/></clipPath></defs>`);
    sx.base = sx(lo); sx.log = !!ax.log; return sx;
  };
  let x = x0 + 10;
  if (o.total) {
    out.push(`<text x="${x + totW / 2}" y="${top - 8}" text-anchor="middle" font-weight="600" fill="#1c2422">${escXml(o.totalLabel || 'Bioturbation (%)')}</text>`);
    const sx = rangeScale('total', x, totW, 100);
    out.push(`<g clip-path="url(#range-${x})">`);
    for (const r of rows) if (r.pct != null && (!sx.log || r.pct > 0)) out.push(`<rect x="${f2(Math.min(sx.base, sx(r.pct)))}" y="${y(r.a0)}" width="${f2(Math.abs(sx(r.pct) - sx.base))}" height="${f2(Math.max(0.4, y(r.a1) - y(r.a0)))}" fill="#e7c9a5"/>`);
    out.push('</g>');
    out.push(`<rect x="${x}" y="${top}" width="${totW}" height="${H}" fill="none" stroke="#9aa5a1" stroke-width="0.8"/>`);
    x += totW + 14;
  }
  for (const c of cols) {
    const cx = x + colW / 2, max = Math.max(1e-9, ...rows.map((r) => r.classPct?.[c.index] || 0));
    out.push(`<text transform="translate(${cx + 3},${top - 6}) rotate(-60)" font-style="${c.plain ? 'normal' : 'italic'}" font-weight="600" fill="#1c2422">${escXml(c.name)}</text>`);
    out.push(`<line x1="${cx}" y1="${top}" x2="${cx}" y2="${top + H}" stroke="#d5dbd9" stroke-width="0.6"/>`);
    const sx = rangeScale('species', x, colW - 6, max);
    out.push(`<g clip-path="url(#range-${x})">`);
    // V0.51: display = symbols | bars | both | kite (abundance as two symmetric curves) | kiteSymbols
    const showSym = display === 'symbols' || display === 'both' || display === 'kiteSymbols', kite = display === 'kite' || display === 'kiteSymbols';
    const custom = Object.keys(o.style?.axes?.species || {}).length > 0;
    if (kite) {   // one closed outline per run of intervals with data: right side downwards, left side back up
      const half = (v) => (custom ? Math.abs(sx(v) - sx.base) : (v / max) * (colW - 6)) / 2;
      const runs = []; let cur = [];
      for (const r of [...rows].sort((a, b) => a.a0 - b.a0)) { if (r.classPct?.[c.index] == null || r.pct == null) { if (cur.length) runs.push(cur); cur = []; continue; } cur.push(r); }
      if (cur.length) runs.push(cur);
      for (const run of runs) {
        if (!run.some((r) => r.classPct[c.index] > 0)) continue;
        const pts = run.map((r) => [half(r.classPct[c.index]), y((r.a0 + r.a1) / 2)]), y0 = y(run[0].a0), y1 = y(run.at(-1).a1);
        const right = [[0, y0], ...pts, [0, y1]].map(([h, yy]) => `${f2(cx + h)},${f2(yy)}`), left = [...pts].reverse().map(([h, yy]) => `${f2(cx - h)},${f2(yy)}`);
        out.push(`<polygon points="${[...right, ...left].join(' ')}" fill="${c.color}" fill-opacity="0.85" stroke="${c.color}" stroke-width="0.6" stroke-linejoin="round"/>`);
      }
    }
    for (const r of display === 'bars' || display === 'both' ? rows : []) {
      const v = r.classPct?.[c.index] || 0; if (!v) continue;
      const w = custom ? Math.abs(sx(v) - sx.base) : Math.max(2, (v / max) * (colW - 6));
      out.push(`<rect x="${f2(custom ? Math.min(sx(v), sx.base) : cx - w / 2)}" y="${y(r.a0)}" width="${f2(w)}" height="${f2(Math.max(0.4, y(r.a1) - y(r.a0)))}" fill="${c.color}"/>`);
    }
    if (o.points && showSym) {   // V0.32: one symbol per identified trace or mark, at its own depth or age
      let lastY = -1e9, lastK = '';
      for (const p of o.points) {
        if (p.index !== c.index || p.a < from || p.a > to) continue;
        const yy = y(p.a) + 4; if (Math.abs(yy - lastY) < 0.6 && lastK === p.kind) continue;   // symbols are drawn above their origin: +4 centres them on the depth
        lastY = yy; lastK = p.kind;
        out.push(o.markHollow && p.kind === 'mark' ? traceSymbol(cx, yy, '#ffffff', c.symbol).replace(/stroke="[^"]*"/, `stroke="${c.color}"`).replace(/stroke-width="[^"]*"/, 'stroke-width="1.4"') : traceSymbol(cx, yy, c.color, c.symbol));
      }
    }
    const presence = o.points ? [] : [...(o.presence || []).filter((q) => q.index === c.index)];
    if (!o.points) for (const r of rows) if ((r.classPct?.[c.index] || 0) > 0 && !presence.some((p) => p.a0 === r.a0 && p.a1 === r.a1)) presence.push({a0:r.a0,a1:r.a1});
    if (showSym) for (const p of presence) {
      if (p.a1 <= from || p.a0 >= to) continue;
      const mid = (Math.max(from, p.a0) + Math.min(to, p.a1)) / 2;
      out.push(traceSymbol(cx, y(mid) + 4, c.color, c.symbol));
    }
    out.push('</g>');
    x += colW;
  }
  out.push('</svg>');
  return { svg: out.join(''), width: W, height: Htot, columns: allCols };
}

/** CSV of the intervals inside the window, plus external records interpolated at each interval centre. */
export function windowCSV({ rows, from, to, classes, records, units, ageUnits }) {
  const sel = rows.filter((r) => r.a1 > from && r.a0 < to);
  const head = ['section', `depth_top_${units}`, `depth_bottom_${units}`, `depth_${units}`, `age_${ageUnits}`, 'bioturbation_pct',
    ...classes.map((c) => `${c.name}_pct`), 'BI', 'ii', 'BI_manual', 'ii_manual',
    ...records.map((r) => `${r.name} (interp.)`)];
  const out = [head];
  for (const r of sel) {
    out.push([r.section, r.dTop, r.dBottom, r.depth, r.age, r.pct, ...classes.map((c) => r.classPct[c.index]), r.BI, r.ii, r.BIm, r.iim,
      ...records.map((s) => interpAge({ depth: s.x, age: s.y }, s.axis === 'depth' ? r.depth : r.age))]);
  }
  return toCSV(out);
}
