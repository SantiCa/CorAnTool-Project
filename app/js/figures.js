/* Figures: representative traces, interpreted core, logs, location map and range chart. */
import { $, S, clsById, fmt, hex, uid } from './state.js';
import { tickFieldsHTML, arrowFormHTML, axesFormHTML, colOrderHTML, colView, colorsFormHTML, compositeData, coreImages, lastLog, logRecords, logStyleOf, mode, ndFormHTML, onStyleInput, reduceRGBA, renderLog, scheduleLog, speciesFormHTML, styleFormHTML, syncColOrder } from './columns.js';
import { busy, clsAbbr, compositeMarks, curCore, depthAtRow, effClassArray, effClassId, esc, idListOf, idMode, legendOf, markDirty, needPixels, pxPerCm, requestRender, rowAtDepth, safe, saveFile, toast } from './app.js';
import { fetchImage, geoComputeSamples, geoLand, geoOverlay, geoRT, mapNetConsent, renderGeoLogs, renderGeoMap } from './multiproxy.js';

import { UNIT_TO_CM, hasId, interpAge, topAt } from './core.js';
import { vec } from './learn.js';
import { buildLogSVG, buildRangeSVG, extraTicks, noDataDefs, mergedStyle, noDataGaps, noDataRect, rowsRange, verticalTicks } from './log.js';
import { t } from './i18n.js';
import { LOCMAP_DEFAULTS, buildLocMapSVG, lmFitBBox, lmUtmZone, lmZoom } from './locmap.js';

/* ───────────── figures: representative traces, interpreted core, logs and maps ───────────── */

export const defaultFig = () => ({ type: 'traces', title: '', caption: '', n: 4, pick: 'largest', tile: 150, img: 'enh', outline: true, picks: {}, coreH: 1400,
  secFrom: null, secTo: null, panels: ['orig', 'enh', 'alpha', 'mask', 'arrows'], panelW: 150, panelH: 700, keepRatio: false, tracks: null, recs: null, coreImgW: 70, alpha: 0.5, minArea: 0, hideExcl: false, rangeH: 900, rangeTotal: true,
  arrowSrc: 'all', arrowExcl: [], objScale: 1, markScale: 1, markStroke: '#ffffff', markStrokeW: 0.8, labelSize: 10, labelColor: '#1c2422', labelHalo: true });   // V0.23
export const FIG_PANELS = ['orig', 'enh', 'fill', 'alpha', 'outline', 'mask', 'bw', 'arrows'];
S.fig = defaultFig();
/* V0.73: figures as tabs. S.figTabs = [{ id, name, fig }]; S.fig is always the `fig` of the active tab (S.figTab), so every
   handler that edits S.fig edits the active tab. An empty name shows the figure type. */
S.figTabs = [{ id: 'f1', name: '', fig: S.fig }]; S.figTab = 'f1';
let figSvgCache = '';
export function resetFigTabs(fig = defaultFig()) { S.fig = fig; S.figTabs = [{ id: uid(), name: '', fig }]; S.figTab = S.figTabs[0].id; }
export function loadFigTabs(p) {
  const tabs = Array.isArray(p.figTabs) && p.figTabs.length ? p.figTabs : null;
  if (!tabs) { resetFigTabs({ ...defaultFig(), ...(p.fig || {}) }); return; }
  S.figTabs = tabs.map((x) => ({ id: x.id || uid(), name: x.name || '', fig: { ...defaultFig(), ...(x.fig || {}) } }));
  S.figTab = S.figTabs.some((x) => x.id === p.figTab) ? p.figTab : S.figTabs[0].id;
  S.fig = S.figTabs.find((x) => x.id === S.figTab).fig;
}
export const figTabsData = () => ({ figTabs: S.figTabs.map(({ id, name, fig }) => ({ id, name, fig })), figTab: S.figTab });
const figTabLabel = (tb) => {
  if (tb.name) return tb.name;
  const same = S.figTabs.filter((x) => !x.name && x.fig.type === tb.fig.type), k = same.indexOf(tb) + 1;
  return t('fig.t.' + tb.fig.type) + (same.length > 1 ? ` (${k})` : '');
};
export function renderFigTabs() {
  const box = $('figTabs'); if (!box) return;
  const many = S.figTabs.length > 1;
  box.innerHTML = S.figTabs.map((tb) => `<span class="figtab${tb.id === S.figTab ? ' on' : ''}" role="tab" tabindex="0" aria-selected="${tb.id === S.figTab}" data-ftab="${tb.id}" title="${esc(t('fig.tab.rename'))}"><span class="ftl">${esc(figTabLabel(tb))}</span>${many ? `<button type="button" class="ftx" data-ftabdel="${tb.id}" aria-label="${esc(t('fig.tab.del'))}" title="${esc(t('fig.tab.del'))}">×</button>` : ''}</span>`).join('')
    + `<button type="button" class="figtabadd" data-ftabadd title="${esc(t('fig.tab.add'))}" aria-label="${esc(t('fig.tab.add'))}">+</button>`;
}
function activateFigTab(id) {
  const tb = S.figTabs.find((x) => x.id === id); if (!tb || id === S.figTab) return;
  S.figTab = id; S.fig = tb.fig; markDirty(); renderFigPanel(); scheduleFigure();
}
$('figTabs').addEventListener('click', (e) => {
  const del = e.target.closest('[data-ftabdel]'), add = e.target.closest('[data-ftabadd]'), tab = e.target.closest('[data-ftab]');
  if (e.target.closest('.ftedit')) return;
  if (add) {
    const tb = { id: uid(), name: '', fig: JSON.parse(JSON.stringify(S.fig)) };
    S.figTabs.push(tb); S.figTab = tb.id; S.fig = tb.fig; markDirty(); renderFigPanel(); scheduleFigure();
  } else if (del) {
    if (S.figTabs.length < 2 || !confirm(t('fig.tab.delAsk'))) return;
    const i = S.figTabs.findIndex((x) => x.id === del.dataset.ftabdel); if (i < 0) return;
    const wasActive = S.figTabs[i].id === S.figTab; S.figTabs.splice(i, 1);
    if (wasActive) { const n = S.figTabs[Math.min(i, S.figTabs.length - 1)]; S.figTab = n.id; S.fig = n.fig; }
    markDirty(); renderFigPanel(); scheduleFigure();
  } else if (tab) activateFigTab(tab.dataset.ftab);
});
$('figTabs').addEventListener('keydown', (e) => { const tab = e.target.closest('[data-ftab]'); if (tab && e.target === tab && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activateFigTab(tab.dataset.ftab); } });
$('figTabs').addEventListener('dblclick', (e) => {
  const l = e.target.closest('.ftl'), tab = e.target.closest('[data-ftab]'); if (!l || !tab) return;
  const tb = S.figTabs.find((x) => x.id === tab.dataset.ftab); if (!tb) return;
  const inp = document.createElement('input'); inp.className = 'ftedit'; inp.value = tb.name || l.textContent; inp.maxLength = 60;
  l.replaceWith(inp); inp.focus(); inp.select();
  let fin = false; const done = (ok) => { if (fin) return; fin = true; if (ok) { tb.name = inp.value.trim(); markDirty(); } renderFigTabs(); };
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); });
  inp.addEventListener('blur', () => done(true));
});

/** Crop of one trace (padding 15 %), scaled to `size` px on its long side, with optional outline in the class colour. */
/**
 * Crop of one trace. V0.7: img 'orig' | 'enh' | 'none' (white background); iso = only the trace pixels on white;
 * fillMask = trace filled with its class colour; outline = edge in the class colour.
 */
export function traceCanvas(s, o, size, img, outline, iso = false, fillMask = false) {
  if (!s.orig) {   // V0.1: placeholder until the section's picture is read from disk
    needPixels(s); const p = document.createElement('canvas'); p.width = p.height = Math.max(1, Math.round(size * 0.5));
    const g = p.getContext('2d'); g.fillStyle = '#cfd4d2'; g.fillRect(0, 0, p.width, p.height);
    return { canvas: p, pxPerCm: pxPerCm(s), depth: depthAtRow(s, (o.bbox[1] + o.bbox[3]) / 2), units: s.units };
  }
  const [x0, y0, x1, y1] = o.bbox, pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.15) + 2;
  const X0 = Math.max(0, x0 - pad), Y0 = Math.max(0, y0 - pad), X1 = Math.min(s.w - 1, x1 + pad), Y1 = Math.min(s.h - 1, y1 + pad);
  const cw = X1 - X0 + 1, ch = Y1 - Y0 + 1, src = img === 'orig' ? s.orig : s.enh || s.orig, lab = s.labels;
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d'), im = ctx.createImageData(cw, ch), d = im.data, col = hex(clsById(o.cls || o.pred)?.color || '#ffffff');
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = (Y0 + y) * s.w + X0 + x, j = (y * cw + x) * 4;
    const inT = hasId(lab[i], o.id, s.stacks);
    if (img === 'none' || (iso && !inT)) { d[j] = d[j + 1] = d[j + 2] = 255; } else { d[j] = src[i * 4]; d[j + 1] = src[i * 4 + 1]; d[j + 2] = src[i * 4 + 2]; }
    d[j + 3] = 255;
    if (fillMask && inT) { d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; }
    if (outline && inT) {
      const X = X0 + x, Y = Y0 + y;
      const edge = X === 0 || Y === 0 || X === s.w - 1 || Y === s.h - 1 || !hasId(lab[i - 1], o.id, s.stacks) || !hasId(lab[i + 1], o.id, s.stacks) || !hasId(lab[i - s.w], o.id, s.stacks) || !hasId(lab[i + s.w], o.id, s.stacks);
      if (edge) { d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; }
    }
  }
  ctx.putImageData(im, 0, 0);
  const k = size / Math.max(cw, ch), out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  const o2 = out.getContext('2d'); o2.imageSmoothingQuality = 'high'; o2.drawImage(c, 0, 0, out.width, out.height);
  return { canvas: out, pxPerCm: pxPerCm(s) * k, depth: depthAtRow(s, (y0 + y1) / 2), units: s.units };
}

/** Traces of the active core assigned to a class (sections of this core). */
function classTraces(clsId) {
  const out = [];
  const F = S.fig, win = F.secFrom != null || F.secTo != null, base = [...S.sections].sort((a, b) => a.top * UNIT_TO_CM[a.units] - b.top * UNIT_TO_CM[b.units])[0]?.units || 'cm';
  const inWin = (s, o) => { if (!win) return true; const d = depthAtRow(s, (o.bbox[1] + o.bbox[3] + 1) / 2) * UNIT_TO_CM[s.units] / UNIT_TO_CM[base]; return (F.secFrom == null || d >= F.secFrom) && (F.secTo == null || d < F.secTo); };
  for (const s of S.sections) for (const o of s.objects.values()) if (o.cls === clsId && o.bbox && o.area && inWin(s, o)) out.push({ s, o, key: `${s.id}:${o.id}` });
  return out;
}
/** Automatic choice: largest, most typical (closest to the class median of the shape/colour descriptors) or spread in depth. */
function autoPick(list, n, how) {
  if (how === 'typical' && list.length) {
    const V = list.map((x) => vec(x.o.feat)), d = V[0].length;
    const med = Array.from({ length: d }, (_, j) => { const a = V.map((v) => v[j]).sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; });
    const sd = Array.from({ length: d }, (_, j) => { const m = V.reduce((s2, v) => s2 + v[j], 0) / V.length; return Math.sqrt(V.reduce((s2, v) => s2 + (v[j] - m) ** 2, 0) / V.length) || 1; });
    return list.map((x, i) => [x, V[i].reduce((s2, v, j) => s2 + ((v - med[j]) / sd[j]) ** 2, 0)]).sort((a, b) => a[1] - b[1]).slice(0, n).map((q) => q[0].key);
  }
  if (how === 'spread' && list.length) {
    const byDepth = [...list].sort((a, b) => depthAtRow(a.s, a.o.bbox[1]) - depthAtRow(b.s, b.o.bbox[1]));
    return Array.from({ length: Math.min(n, byDepth.length) }, (_, k) => byDepth[Math.round((k * (byDepth.length - 1)) / Math.max(1, n - 1))].key).filter((v, i, a) => a.indexOf(v) === i);
  }
  return [...list].sort((a, b) => b.o.area - a.o.area).slice(0, n).map((x) => x.key);
}
const niceBar = (pxPerCm, maxPx) => [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10].filter((v) => v * pxPerCm <= maxPx).pop() || 0.05;

/** V0.7: versions of each trace shown side by side in the traces figure. */
const TRACE_VIEWS = { enh: ['enh', false, false, false], enhOut: ['enh', true, false, false], orig: ['orig', false, false, false], origOut: ['orig', true, false, false],
  iso: ['orig', false, true, false], isoEnh: ['enh', false, true, false], isoOut: ['orig', true, true, false], mask: ['none', false, false, true], outline: ['none', true, false, false] };
const traceViews = (F) => (F.tviews?.length ? F.tviews : [F.img === 'orig' ? (F.outline ? 'origOut' : 'orig') : F.outline ? 'enhOut' : 'enh']).filter((v) => TRACE_VIEWS[v]);
/** Scale bar of a tile: 'bar' (filled), 'ticks' (alternating segments), 'line' (line with end ticks) or 'none'. */
function traceScale(X, y, T, pxPerCm, sc) {
  const style = sc.style || 'bar'; if (style === 'none') return '';
  const col = sc.color || '#ffffff', ink = sc.ink || '#000000', len = sc.len > 0 ? +sc.len : niceBar(pxPerCm, T * 0.45), bw = len * pxPerCm;
  const pos = sc.pos || 'bl', bx = pos.endsWith('r') ? X + T - 6 - bw : X + 6, by = pos.startsWith('t') ? y + 22 : y + T - 12;
  const txt = `<text x="${(pos.endsWith('r') ? bx + bw : bx).toFixed(1)}" y="${(by - 3).toFixed(1)}" text-anchor="${pos.endsWith('r') ? 'end' : 'start'}" fill="${col}" stroke="${ink}" stroke-width="0.25" font-size="10" font-weight="600">${len < 1 ? +(len * 10).toFixed(2) + ' mm' : +len.toFixed(2) + ' cm'}</text>`;
  if (style === 'line') return `<path d="M${bx.toFixed(1)} ${by - 2}v6M${bx.toFixed(1)} ${by + 1}h${bw.toFixed(1)}M${(bx + bw).toFixed(1)} ${by - 2}v6" stroke="${ink}" stroke-width="2.6" fill="none"/><path d="M${bx.toFixed(1)} ${by - 2}v6M${bx.toFixed(1)} ${by + 1}h${bw.toFixed(1)}M${(bx + bw).toFixed(1)} ${by - 2}v6" stroke="${col}" stroke-width="1.2" fill="none"/>${txt}`;
  if (style === 'ticks') {
    const n = Math.max(2, Math.min(10, Math.round(sc.div) || 4)), seg = bw / n;
    return `<rect x="${bx.toFixed(1)}" y="${by}" width="${bw.toFixed(1)}" height="4" fill="${col}" stroke="${ink}" stroke-width="0.6"/>${Array.from({ length: n }, (_, k) => (k % 2 ? '' : `<rect x="${(bx + k * seg).toFixed(1)}" y="${by}" width="${seg.toFixed(1)}" height="4" fill="${ink}"/>`)).join('')}${txt}`;
  }
  return `<rect x="${bx.toFixed(1)}" y="${by}" width="${bw.toFixed(1)}" height="4" fill="${col}" stroke="${ink}" stroke-width="0.6"/>${txt}`;
}
/** V0.59: text and background colours of the figures built here, from the core-column style (validated hex colours). */
function figInk() { const st = mergedStyle(S.logView.style); return { text: st.textColor, sub: st.subColor, bg: st.bgColor }; }
function tracesSVG() {
  const INK = figInk();
  const F = S.fig, T = F.tile, gap = 12, vgap = 4, labW = 190, rows = [], views = traceViews(F), sc = F.scale || {};
  for (const c of S.classes) {
    if (!c.counts && c.id !== 'undet') continue;
    const list = classTraces(c.id), keys = F.picks[c.id]?.length ? F.picks[c.id] : [];
    const chosen = keys.map((k) => list.find((x) => x.key === k)).filter(Boolean);
    if (chosen.length) rows.push({ c, chosen });
  }
  if (!rows.length) return null;
  const nv = views.length, TW = nv * T + (nv - 1) * vgap, head = nv > 1 ? 16 : 0;
  const maxN = Math.max(...rows.map((r) => r.chosen.length)), W = labW + maxN * (TW + gap) + 10, rowH = T + 34, H = head + rows.length * rowH + 10;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="IBM Plex Sans, Arial, sans-serif" font-size="11"><rect width="${W}" height="${H}" fill="${INK.bg}"/>`];
  if (nv > 1) for (let k = 0; k < maxN; k++) views.forEach((v, vi) => parts.push(`<text x="${labW + k * (TW + gap) + vi * (T + vgap) + T / 2}" y="12" text-anchor="middle" fill="${INK.sub}" font-size="10">${esc(t('fig.tv.' + v))}</text>`));
  rows.forEach((r, ri) => {
    const y = head + 6 + ri * rowH;
    parts.push(`<rect x="8" y="${y + 4}" width="10" height="10" fill="${r.c.color}"/><text x="24" y="${y + 13}" font-size="13" font-style="${r.c.plain ? 'normal' : 'italic'}" font-weight="600" fill="${INK.text}">${esc(r.c.name)}</text>`);
    parts.push(`<text x="24" y="${y + 29}" fill="${INK.sub}">${t('fig.nOf', { n: r.chosen.length, m: classTraces(r.c.id).length })}</text>`);
    r.chosen.forEach((x, k) => {
      let tc0 = null;
      views.forEach((v, vi) => {
        const [img, out, iso, mask] = TRACE_VIEWS[v], tc = traceCanvas(x.s, x.o, T, img, out, iso, mask), X = labW + k * (TW + gap) + vi * (T + vgap);
        const ox = X + (T - tc.canvas.width) / 2, oy = y + (T - tc.canvas.height) / 2; tc0 ||= tc;
        parts.push(`<rect x="${X}" y="${y}" width="${T}" height="${T}" fill="${img === 'none' || iso ? '#ffffff' : '#f0f0ee'}"${img === 'none' || iso ? ' stroke="#d9dedc" stroke-width="0.6"' : ''}/><image x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${tc.canvas.width}" height="${tc.canvas.height}" href="${tc.canvas.toDataURL(mask || img === 'none' ? 'image/png' : 'image/jpeg', 0.92)}"/>`);
        if (vi === 0 || sc.all) parts.push(traceScale(X, y, T, tc.pxPerCm, { ...sc, ...((img === 'none' || iso) && (sc.color || '#ffffff').toLowerCase() === '#ffffff' ? { color: sc.ink || '#000000', ink: '#ffffff' } : {}) }));
      });
      parts.push(`<text x="${labW + k * (TW + gap) + TW / 2}" y="${y + T + 13}" text-anchor="middle" fill="${INK.sub}" font-size="10">${esc(x.s.name)} · ${fmt(tc0.depth, 3)} ${tc0.units}</text>`);
    });
  });
  parts.push('</svg>');
  return parts.join('');
}

/** Whole interpreted core: image with traces, bioturbation, ichnotaxa, indices, records and interval bands. */
function coreSVG() {
  if (!S.sections.length && !S.records.length) return null;
  const D = compositeData(), [from, to] = figAxisWin(D), F = S.fig, lv = { ...S.logView, tracks: F.tracks || S.logView.tracks };
  const { W: imgW, H } = coreFigSize(D);
  const classes = S.classes.map((c, i) => ({ name: c.name, color: c.color, symbol: c.symbol || 'triDown', index: i, counts: c.counts })).filter((c) => c.counts);
  const images = S.sections.length && lv.tracks.image ? coreImages(D, from, to, H, { panels: F.corePanels, mode: 'enh', hideExcl: F.coreHideExcl, w: imgW }) : null, image = images?.[0] || null;   // V0.25
  const boundaries = D.secs.map((x) => ({ a: D.axis === 'age' ? interpAge(D.model, x.top * D.f(x)) : x.top * D.f(x), label: x.name })).filter((b) => b.a != null);
  const LS = logStyleOf(D), marks = lv.tracks.marks !== false ? compositeMarks(D) : [];
  const res = buildLogSVG({
    style: LS.style, colWidths: S.logView.colW || {}, title: curCore()?.name || S.name, subtitle: t('fig.coreSub', { n: D.secs.length }), axisLabel: LS.label,
    from, to, height: H, rows: D.rows, classes, tracks: { ...lv.tracks, image: !!image }, image, images, imageWidth: imgW, records: figRecords(D), boundaries, ...geoOverlay(D.axis),
    marks, idList: idMode() || marks.length ? idListOf(D.rows, marks) : null, legendClasses: legendOf(classes.filter((c) => D.rows.some((r) => r.classPct?.[c.index] > 0)), marks),
    labels: { noData: t('log.noData'), total: t('log.total'), species: t('log.species'), image: t('log.image'), marks: t('id.marks'), idList: t('id.list') },
  });
  syncColOrder('log', res.columns);   // V0.33
  return res.svg;
}

/* ── V32: core-section figure (versions of the same interval side by side) and ichnotaxa range chart ── */
/** Section picture in one of the figure styles, reduced to ≤ 900 px wide and cached per section. */
function sectionModeCanvas(s, mode, hx = S.fig.hideExcl) {   // V0.25: hx = paint excluded zones white (per figure)
  const F = S.fig, key = `${s.logVer}|${mode}|${F.alpha}|${!!hx}|${S.settings.predThr}|${S.settings.includePred}`, mk = mode + (hx ? '|x' : '');
  s._fc ||= new Map(); if (s._fc.get(mk)?.key === key) return s._fc.get(mk);
  if (!s.orig && !['mask', 'bw'].includes(mode)) { needPixels(s); const p = document.createElement('canvas'); p.width = 1; p.height = Math.max(1, Math.round(s.h / s.w)); const g = p.getContext('2d'); g.fillStyle = '#e4e7e6'; g.fillRect(0, 0, 1, p.height); return { key: 'pending', canvas: p, k: 1 / s.w }; }
  // V0.41: each pixel's colour is computed and averaged straight into the ≤ 900 px picture (no full-size canvas)
  const lab = s.labels, ex = s.exclude, W = s.w;
  const eff = effClassArray(s), cols = S.classes.map((k) => hex(k.color)), photo = !['mask', 'bw'].includes(mode), src = mode === 'orig' ? s.orig : s.enh;
  const k = Math.min(1, 900 / s.w), out = document.createElement('canvas'); out.width = Math.max(1, Math.round(s.w * k)); out.height = Math.max(1, Math.round(s.h * k));
  const px = [0, 0, 0, 255];
  const im = reduceRGBA(s.w, s.h, out.width, out.height, (i) => {
    const j = i * 4;
    if (photo) { px[0] = src[j]; px[1] = src[j + 1]; px[2] = src[j + 2]; } else px[0] = px[1] = px[2] = 255;
    if (ex[i] && (hx || !photo)) { px[0] = px[1] = px[2] = photo ? 255 : 236; return px; }
    const id = topAt(lab[i], s.stacks); if (!id) return px; const q = eff[id]; if (q < 0) return px; const col = cols[q];
    if (mode === 'fill' || mode === 'mask') { px[0] = col[0]; px[1] = col[1]; px[2] = col[2]; }
    else if (mode === 'bw') { px[0] = px[1] = px[2] = 20; }
    else if (mode === 'alpha') { const a = F.alpha; px[0] += (col[0] - px[0]) * a; px[1] += (col[1] - px[1]) * a; px[2] += (col[2] - px[2]) * a; }
    else if (mode === 'outline') { const x = i % W; if (x === 0 || x === W - 1 || !hasId(lab[i - 1], id, s.stacks) || !hasId(lab[i + 1], id, s.stacks) || !hasId(lab[i - W], id, s.stacks) || !hasId(lab[i + W], id, s.stacks)) { px[0] = col[0]; px[1] = col[1]; px[2] = col[2]; } }
    return px;
  });
  out.getContext('2d').putImageData(im, 0, 0);
  const r = { key, canvas: out, k: out.width / s.w }; s._fc.set(mk, r); return r;
}
/** One panel image for depths [from, to) (base units), H × W px. */
export function panelDataURL(D, from, to, H, W, mode, hx = S.fig.hideExcl) {
  const Hc = Math.min(6000, Math.round(H * 2)), Wc = W * 2, c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, Wc, Hc);
  for (let r = 0; r < Hc; r++) {
    const dd = from + ((r + 0.5) / Hc) * (to - from), s = D.secs.find((q) => dd >= q.top * D.f(q) && dd < q.bottom * D.f(q)); if (!s) continue;
    const row = Math.floor(rowAtDepth(s, dd / D.f(s))); if (row < s.roi.y0 || row >= s.roi.y1) continue;
    const pc = sectionModeCanvas(s, mode, hx), k = pc.k;
    ctx.drawImage(pc.canvas, s.roi.x0 * k, Math.min(pc.canvas.height - 1, Math.floor(row * k)), Math.max(1, (s.roi.x1 - s.roi.x0) * k), 1, 0, r, Wc, 1);
  }
  return ['mask', 'bw'].includes(mode) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92);
}
/** Identified traces in [from, to): classified objects (centroid) of at least minArea px and the marks. */
export function figTraces(D, from, to) {
  const out = [], ab = clsAbbr(), F = S.fig;
  for (const s of D.secs) {
    const add = (x, y, cid) => {
      const c = clsById(cid); if (!c || c.id === 'artifact' || y < s.roi.y0 || y >= s.roi.y1) return;
      const dd = depthAtRow(s, y) * D.f(s); if (dd < from || dd >= to) return;
      if ((F.arrowExcl || []).includes(c.id)) return;   // V0.23: excluded groups (e.g. undetermined)
      out.push({ d: dd, xf: (x - s.roi.x0) / Math.max(1, s.roi.x1 - s.roi.x0), color: c.color, abbr: ab.get(c.name), name: c.name, plain: !!c.plain, k: src === 'obj' ? +F.objScale || 1 : 1 });
    };
    let src = 'obj';
    // V0.23: 'all' = every trace and every mark, 'marks' = only the marks placed by hand, 'objects' = only traces
    if ((F.arrowSrc || 'all') !== 'marks') for (const o of s.objects.values()) { const cid = effClassId(o); if (!cid || !o.stats || o.area < F.minArea) continue; add(o.stats.sx / o.stats.n, o.stats.sy / o.stats.n, cid); }
    src = 'mark';
    if ((F.arrowSrc || 'all') !== 'objects') for (const m of s.marks || []) add(m.x, m.y, m.cls);
  }
  return out;
}
/** V0.2: sections and units of the core without analysing them (for sizes in the figure forms). */
function figLightD() {
  const secs = [...S.sections].sort((a, b) => a.top * UNIT_TO_CM[a.units] - b.top * UNIT_TO_CM[b.units]), base = secs[0]?.units || 'cm';
  return { secs, base, f: (q) => UNIT_TO_CM[q.units] / UNIT_TO_CM[base], axis: 'depth', get rows() { return compositeData().rows; } };
}
/** V0.2: depth window shared by all figures (base units of the core; empty fields = whole core). */
function secFigRange(D) {
  const F = S.fig;
  let dMin = Math.min(...D.secs.map((s) => s.top * D.f(s))), dMax = Math.max(...D.secs.map((s) => s.bottom * D.f(s)));
  if (!D.secs.length) { const r = D.axis === 'depth' ? rowsRange(D.rows) : [0, 1]; [dMin, dMax] = r; }
  let from = F.secFrom ?? dMin, to = F.secTo ?? dMax;
  if (!(to > from)) { from = dMin; to = dMax; }
  return { from, to };
}
/** The depth window on the axis of the figure (age if the column is shown in age). */
function figAxisWin(D) {
  const S0 = S.fig;
  if (S0.secFrom == null && S0.secTo == null) return rowsRange(D.rows);
  const { from, to } = secFigRange(D);
  if (D.axis !== 'age') return [from, to];
  const a = interpAge(D.model, from), b = interpAge(D.model, to);
  return a == null || b == null ? rowsRange(D.rows) : [Math.min(a, b), Math.max(a, b)];
}
/** Width/height ratio of the core in the window: (window length in cm) / (core width in cm, median of the sections). */
export function coreRatio(D, from, to) {
  const ws = D.secs.filter((s) => s.bottom * D.f(s) > from && s.top * D.f(s) < to).map((s) => (s.roi.x1 - s.roi.x0) / pxPerCm(s)).sort((a, b) => a - b);
  const wcm = ws.length ? ws[ws.length >> 1] : 0, hcm = (to - from) * UNIT_TO_CM[D.base];
  return wcm > 0 && hcm > 0 ? hcm / wcm : null;
}
/** Records of the core figure: the ones chosen in the figure, or those shown in the column. */
function figRecords(D) {
  const want = S.fig.recs; if (!want) return logRecords(D);
  const keep = S.records.map((r) => ({ ...r, series: r.series.map((s) => ({ ...s, show: want.includes(s.name) })) }));
  const saved = S.records; S.records = keep;
  try { return logRecords(D); } finally { S.records = saved; }
}
/**
 * V0.2: panel size of the section figure. With «keep proportion» the height follows the width so the core keeps its real
 * shape: H = W · (window length in cm) / (core width in cm, median of the analysis areas of the sections in the window).
 * Above 4000 px the height is capped and the width reduced instead.
 */
function secFigSize(D) {
  const F = S.fig; let W = F.panelW, H = F.panelH, r = null;
  if (F.keepRatio && D.secs.length) {
    const { from, to } = secFigRange(D);
    r = coreRatio(D, from, to);
    if (r) {
      H = Math.max(50, Math.round(W * r));
      if (H > 4000) { H = 4000; W = Math.max(10, Math.round(H / r)); }
    }
  }
  return { W, H, r };
}
/** Show in the form the panel size actually used (with «keep proportion» one side follows the other). */
function syncSecFigSize() {
  const z = secFigSize(figLightD()), F = S.fig;
  if (F.keepRatio && z.r) { F.panelW = z.W; F.panelH = z.H; $('figPanelW').value = z.W; $('figPanelH').value = z.H; $('figRatioNote').textContent = t('fig.ratioNote', { r: fmt(z.r, 3) }); }
  else $('figRatioNote').textContent = '';
}
/** Size of the core figure: image width and column height (with «keep proportion», height = width × ratio, max. 6000 px). */
function coreFigSize(D) {
  const F = S.fig; let W = F.coreImgW || 70, H = F.coreH, r = null;
  if (F.keepRatio && D.secs.length) {
    const { from, to } = secFigRange(D); r = coreRatio(D, from, to);
    if (r) { H = Math.max(200, Math.round(W * r)); if (H > 6000) { H = 6000; W = Math.max(10, Math.round(H / r)); } }
  }
  return { W, H, r };
}
/**
 * V0.5: marker of an identified trace at (px, py) in the trace colour: 'arrow' (from the upper right), 'triDown'
 * (inverted triangle above the trace), 'tri', 'circle', 'square', 'star', 'cross'. legend = small version centred at (px, py).
 */
function figSymbol(kind, px, py, color, xMax = 1e9, legend = false, k = 1) {
  const F = S.fig, kk = legend ? 1 : k * (+F.markScale || 1);
  if (kk !== 1) return `<g transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${+kk.toFixed(3)}) translate(${(-px).toFixed(1)} ${(-py).toFixed(1)})">${figSymbol(kind, px, py, color, px + (xMax - px) / kk, legend, 1 / (+F.markScale || 1))}</g>`;
  const f = (v) => v.toFixed(1), c = color, halo = F.markStroke === 'none' ? 'stroke="none"' : `stroke="${F.markStroke || '#fff'}" stroke-width="${F.markStrokeW ?? 0.8}"`;   // V0.23: border of the marker
  if (kind === 'arrow') {
    if (legend) return `<path d="M${f(px + 5)} ${f(py - 6)}L${f(px - 3)} ${f(py + 1)}" stroke="${c}" stroke-width="1.6"/><path d="M${f(px - 4)} ${f(py + 2)}l5 -1l-2.6 -3z" fill="${c}"/>`;
    const lx = Math.min(xMax, px + 20);
    return `<path d="M${f(lx - 2)} ${f(py - 9)}L${f(px + 3)} ${f(py - 1.5)}" stroke="#fff" stroke-width="3"/><path d="M${f(lx - 2)} ${f(py - 9)}L${f(px + 3)} ${f(py - 1.5)}" stroke="${c}" stroke-width="1.4"/><path d="M${f(px)} ${f(py)}l6.5 -1.2l-3.4 -4z" fill="${c}" stroke="#fff" stroke-width="0.5"/>`;
  }
  const s = legend ? 4.5 : 5.5, cy = legend ? py - 4 : kind === 'triDown' ? py - s - 3 : py;
  if (kind === 'triDown') return `<path d="M${f(px - s)} ${f(cy - s)}H${f(px + s)}L${f(px)} ${f(cy + s)}z" fill="${c}" ${halo}/>`;
  if (kind === 'tri') return `<path d="M${f(px - s)} ${f(cy + s)}H${f(px + s)}L${f(px)} ${f(cy - s)}z" fill="${c}" ${halo}/>`;
  if (kind === 'square') return `<rect x="${f(px - s * 0.8)}" y="${f(cy - s * 0.8)}" width="${f(s * 1.6)}" height="${f(s * 1.6)}" fill="${c}" ${halo}/>`;
  if (kind === 'cross') return `<path d="M${f(px - s)} ${f(cy - s)}L${f(px + s)} ${f(cy + s)}M${f(px + s)} ${f(cy - s)}L${f(px - s)} ${f(cy + s)}" stroke="#fff" stroke-width="3.4"/><path d="M${f(px - s)} ${f(cy - s)}L${f(px + s)} ${f(cy + s)}M${f(px + s)} ${f(cy - s)}L${f(px - s)} ${f(cy + s)}" stroke="${c}" stroke-width="1.8"/>`;
  if (kind === 'star') { const p = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? s * 0.45 : s * 1.1, a = (Math.PI / 5) * i - Math.PI / 2; return `${f(px + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`; }); return `<path d="M${p.join('L')}z" fill="${c}" ${halo}/>`; }
  return `<circle cx="${f(px)}" cy="${f(cy)}" r="${f(s * 0.8)}" fill="${c}" ${halo}/>`;
}
/** V0.5–V0.23: markers (and abbreviations) of identified traces over an image panel at x X, width W; y(depth) → px. */
export function arrowMarksSVG(tr, X, W, y) {
  const F = S.fig, out = [], ms = F.markStyle || 'arrowLabel', ov = F.overlap || 'keep', labels = ms === 'arrowLabel';
  const pts = tr.map((q) => ({ q, px: X + Math.min(1, Math.max(0, q.xf)) * W, py: y(q.d) })).sort((a, b) => a.py - b.py);
  for (const t0 of pts) out.push(figSymbol(ms === 'arrowLabel' ? 'arrow' : ms, t0.px, t0.py, t0.q.color, X + W - 4, false, t0.q.k || 1));
  if (labels) {
    const fs = +F.labelSize || 10, kk = +F.markScale || 1;
    const lab = pts.map((t0) => ({ ...t0, lx: Math.min(X + W - 4, t0.px + 20 * kk * (t0.q.k || 1)), ly: t0.py - 10 * kk * (t0.q.k || 1), txt: t0.q.abbr }));
    const out2 = [];
    for (const l of lab) {
      const prev = out2[out2.length - 1], near = prev && l.ly - prev.ly < fs + 1;
      if (!near || ov === 'keep') out2.push(l);
      else if (ov === 'shift') { l.ly = prev.ly + fs + 1; out2.push(l); }
      else if (ov === 'merge') { if (!prev.txt.split(', ').includes(l.txt)) prev.txt += ', ' + l.txt; }
      /* 'hide': the arrow stays, its label is left out */
    }
    const halo = F.labelHalo === false ? '' : ' stroke="#fff" stroke-width="2.6" paint-order="stroke"';
    for (const l of out2) out.push(`<text x="${l.lx}" y="${l.ly.toFixed(1)}" font-weight="700" font-size="${fs}" fill="${F.labelColor || '#1c2422'}"${halo}>${esc(l.txt)}</text>`);
  }
  return out.join('');
}
function sectionsSVG() {
  const INK = figInk();
  if (!S.sections.length) return null;
  const F = S.fig, D0 = compositeData(), D = { ...D0, axis: 'depth' };
  const { from, to } = secFigRange(D);
  const panels = FIG_PANELS.filter((p) => F.panels.includes(p)); if (!panels.length) return null;
  const { W, H } = secFigSize(D), gap = 16, x0 = 62, top = 44, tr = figTraces(D, from, to);
  const legend = S.classes.filter((c) => c.id !== 'artifact' && (tr.some((q) => q.name === c.name) || S.sections.some((s) => [...s.objects.values()].some((o) => effClassId(o) === c.id))));
  const ab = clsAbbr(), perRow = Math.max(1, Math.floor((x0 + panels.length * (W + gap)) / 190)), legH = legend.length ? Math.ceil(legend.length / perRow) * 16 + 18 : 0;
  const Wt = Math.max(x0 + panels.length * (W + gap) + 8, 360), Ht = top + H + 30 + legH, y = (v) => +(top + ((v - from) / (to - from)) * H).toFixed(2);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Wt}" height="${Ht}" viewBox="0 0 ${Wt} ${Ht}" font-family="IBM Plex Sans, Arial, Helvetica, sans-serif" font-size="10"><rect width="${Wt}" height="${Ht}" fill="${INK.bg}"/>`];
  out.push(`<text transform="translate(14,${top + H / 2}) rotate(-90)" text-anchor="middle" font-weight="600" fill="${INK.text}">${esc(logStyleOf(D).label)}</text>`);
  out.push(`<line x1="${x0 - 8}" y1="${top}" x2="${x0 - 8}" y2="${top + H}" stroke="${INK.text}" stroke-width="0.8"/>`);
  const LS = logStyleOf(D);
  out.push(`<defs>${noDataDefs(LS.style)}</defs>`);   // V0.68: pattern used by the no-data rectangles
  for (const e of extraTicks(from, to, H, LS.style)) out.push(`<line x1="${x0 - 8 - e.len}" y1="${y(e.v)}" x2="${x0 - 8}" y2="${y(e.v)}" stroke="${INK.text}" stroke-width="0.6"/>`);   // V0.22
  const lblLen = +LS.style.yLabelLen > 0 ? +LS.style.yLabelLen : 5;
  for (const v of verticalTicks(from, to, H, LS.style)) out.push(`<line x1="${x0 - 8 - lblLen}" y1="${y(v)}" x2="${x0 - 8}" y2="${y(v)}" stroke="${INK.text}" stroke-width="0.8"/><text x="${x0 - 10 - lblLen}" y="${y(v) + 3}" text-anchor="end" fill="${INK.text}">${+(v * LS.style.yFactor).toPrecision(6)}</text>`);
  panels.forEach((p, i) => {
    const X = x0 + i * (W + gap), href = panelDataURL(D, from, to, H, W, p);
    out.push(`<text x="${X}" y="${top - 10}" font-weight="700" fill="${INK.text}">${String.fromCharCode(97 + i)}</text><text x="${X + 12}" y="${top - 10}" fill="${INK.text}">${esc(t('fig.p.' + p))}</text>`);
    out.push(`<image x="${X}" y="${top}" width="${W}" height="${H}" preserveAspectRatio="none" href="${href}" xlink:href="${href}"/><rect x="${X}" y="${top}" width="${W}" height="${H}" fill="none" stroke="${INK.sub}" stroke-width="0.6"/>`);
    if (p === 'arrows') out.push(arrowMarksSVG(tr, X, W, y));
    if (LS.style.ndImage) for (const g of noDataGaps(D.rows.filter((r) => r.a1 > from && r.a0 < to))) out.push(noDataRect(LS.style, X, W, y(Math.max(g.a0, from)), y(Math.min(g.a1, to)) - y(Math.max(g.a0, from)), t('log.noData')));   // V0.23
  });
  out.push(`<text x="${x0}" y="${top + H + 18}" fill="${INK.sub}">${esc(curCore()?.name || S.name)} · ${+from.toPrecision(6)}–${+to.toPrecision(6)} ${esc(D.base)}</text>`);
  legend.forEach((c, i) => {
    const lx = 8 + (i % perRow) * 190, ly = top + H + 30 + Math.floor(i / perRow) * 16;
    const symOnly = F.panels.includes('arrows') && (F.markStyle || 'arrowLabel') !== 'arrowLabel';
    out.push(`${symOnly ? figSymbol(F.markStyle, lx + 5, ly + 9, c.color, 1e9, true) : `<rect x="${lx}" y="${ly}" width="10" height="10" fill="${c.color}"/>`}<text x="${lx + 14}" y="${ly + 9}" fill="${INK.text}">${symOnly ? '' : `<tspan font-weight="700">${esc(ab.get(c.name))}</tspan> `}<tspan font-style="${c.plain ? 'normal' : 'italic'}">${esc(c.name)}</tspan></text>`);
  });
  out.push('</svg>');
  return out.join('');
}
/**
 * V0.32: positions of identified ichnotaxa for the distribution figure, on the figure axis (depth or age).
 * src: 'objects' = traces identified on the image (centroid of each object), 'marks' = identification marks placed by
 * hand, 'all' = both. Each point: { a, index (class), kind: 'obj' | 'mark' }.
 */
function figPoints(D, src = 'all') {
  const out = [], idx = new Map(S.classes.map((c, i) => [c.id, i]));
  const put = (s, y, cid, kind) => {
    const c = clsById(cid); if (!c || c.id === 'artifact' || y < s.roi.y0 || y >= s.roi.y1) return;
    const d = depthAtRow(s, y) * D.f(s), a = D.axis === 'age' ? interpAge(D.model, d) : d;
    if (a != null) out.push({ a, index: idx.get(c.id), kind });
  };
  for (const s of D.secs) {
    if (src !== 'marks') for (const o of s.objects.values()) { const cid = effClassId(o); if (cid && o.stats?.n) put(s, o.stats.sy / o.stats.n, cid, 'obj'); }
    if (src !== 'objects') for (const m of s.marks || []) put(s, m.y, m.cls, 'mark');
  }
  return out.sort((p, q) => p.a - q.a);
}
function rangeSVG() {
  if (!S.sections.length) return null;
  const F = S.fig, D = compositeData(F.rangeAxis || S.logView.axis), [from, to] = figAxisWin(D);
  const classes = S.classes.map((c, i) => ({ name: c.name, color: c.color, symbol: c.symbol || 'triDown', index: i, plain: !!c.plain })).filter((c) => S.classes[c.index].id !== 'artifact');
  const points = figPoints(D, F.rangeSrc || 'all');
  const res = buildRangeSVG({ title: curCore()?.name || S.name, subtitle: t({ bars: 'fig.rangeSub', both: 'fig.rangeSubBoth', kite: 'fig.rangeSubKite', kiteSymbols: 'fig.rangeSubKiteSym' }[F.rangeDisplay] || 'fig.rangeSubPts'), colW: F.rangeColW || 30, axisLabel: logStyleOf(D).label, style: logStyleOf(D).style,
    from, to, height: F.rangeH, rows: D.rows, classes, points, markHollow: F.rangeSrc === 'all' && F.rangeHollow !== false, display: F.rangeDisplay || 'symbols', total: F.rangeTotal, totalLabel: t('log.total') });
  setTimeout(() => syncColOrder('range', res.columns), 0);   // V0.33 (after the form exists)
  return res.svg;
}

/** Adds title and caption around any figure SVG. */
function wrapFigure(svg, title, caption) {
  const INK = figInk();
  const w = +(/width="([\d.]+)"/.exec(svg)?.[1] || 800), h = +(/height="([\d.]+)"/.exec(svg)?.[1] || 600);
  const lines = []; let cur = '';
  for (const word of String(caption || '').split(/\s+/).filter(Boolean)) { if ((cur + ' ' + word).length * 6.2 > w - 20) { lines.push(cur); cur = word; } else cur = cur ? cur + ' ' + word : word; }
  if (cur) lines.push(cur);
  const top = title ? 34 : 0, H = top + h + (lines.length ? lines.length * 15 + 16 : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" font-family="IBM Plex Sans, Arial, sans-serif"><rect width="${w}" height="${H}" fill="${INK.bg}"/>${title ? `<text x="10" y="23" font-size="16" font-weight="600" fill="${INK.text}">${esc(title)}</text>` : ''}${svg.replace('<svg ', `<svg x="0" y="${top}" `)}${lines.map((l, i) => `<text x="10" y="${top + h + 18 + i * 15}" font-size="12" fill="${INK.text}">${esc(l)}</text>`).join('')}</svg>`;
}

/** V0.2: depth window fields shared by all figures (empty = whole core). */
function figWinHTML() {
  const F = S.fig, base = [...S.sections].sort((a, b) => a.top * UNIT_TO_CM[a.units] - b.top * UNIT_TO_CM[b.units])[0]?.units || S.cores.find((c) => c.id === S.curCore)?.units || 'm';
  return `<div class="grid2"><label class="f"><span>${t('fig.from')} (${esc(base)})</span><input type="number" id="figSecFrom" step="any" value="${F.secFrom ?? ''}" placeholder="${t('fig.auto2')}"></label>
    <label class="f"><span>${t('fig.to')} (${esc(base)})</span><input type="number" id="figSecTo" step="any" value="${F.secTo ?? ''}" placeholder="${t('fig.auto2')}"></label></div>`;
}
/** Show in the core-figure form the size actually used (with «keep proportion» the height follows the image width). */
function syncCoreFigSize() {
  if (!$('figCoreImgW')) return;
  const F = S.fig, z = coreFigSize(figLightD());
  if (F.keepRatio && z.r) { F.coreImgW = z.W; F.coreH = z.H; $('figCoreImgW').value = z.W; $('figCoreH').value = z.H; $('figRatioNote').textContent = t('fig.ratioNote', { r: fmt(z.r, 3) }); }
  else $('figRatioNote').textContent = '';
  $('figCoreH').disabled = !!(F.keepRatio && z.r);
}
export function verticalStyleHTML(st = S.logView.style || {}, nd = true) {
  return `${nd ? ndFormHTML(st) : ''}<div class="grid2"><label class="f"><span>${t('st.yUnit')}</span><select data-st="yUnit">${['', 'mm', 'cm', 'm'].map((u) => `<option value="${u}" ${(st.yUnit || '') === u ? 'selected' : ''}>${u || t('st.native')}</option>`).join('')}</select></label>${tickFieldsHTML(st)}</div>`;
}
/** V0.72: orientation of each figure type (F.orients); projects saved before keep their single F.orient as the fallback. */
const orientOf = (F) => F.orients?.[F.type] ?? F.orient ?? 'v';
export function renderFigPanel() {
  const F = S.fig, box = $('figOpts');
  renderFigTabs();
  $('figType').value = F.type; $('figTitle').value = F.title; $('figCaption').value = F.caption;
  $('figOrient').value = orientOf(F) === 'h' ? 'h' : 'v'; $('figOrientBox').hidden = ['map', 'locmap'].includes(F.type);   // V0.51
  if (F.type === 'traces') {
    const cls = S.classes.filter((c) => classTraces(c.id).length);
    box.innerHTML = `${figWinHTML()}<div class="grid2"><label class="f"><span>${t('fig.n')}</span><input type="number" id="figN" min="1" max="20" value="${F.n}"></label>
      <label class="f"><span>${t('fig.pick')}</span><select id="figPick">${['largest', 'typical', 'spread'].map((k) => `<option value="${k}" ${k === F.pick ? 'selected' : ''}>${t('fig.pick.' + k)}</option>`).join('')}</select></label>
      <label class="f"><span>${t('fig.tile')}</span><input type="number" id="figTile" min="60" max="400" step="10" value="${F.tile}"></label>
      <label class="f"><span>${t('log.imgMode')}</span><select id="figImg"><option value="enh" ${F.img === 'enh' ? 'selected' : ''}>${t('log.enh')}</option><option value="orig" ${F.img === 'orig' ? 'selected' : ''}>${t('log.orig')}</option></select></label></div>
      <label class="chk"><input type="checkbox" id="figOutline" ${F.outline ? 'checked' : ''}><span>${t('fig.outline')}</span></label>
      <div class="f"><span>${t('fig.tviews')}</span><div class="chk2">${Object.keys(TRACE_VIEWS).map((v) => `<label class="chk"><input type="checkbox" data-tview="${v}" ${traceViews(F).includes(v) ? 'checked' : ''}><span>${t('fig.tv.' + v)}</span></label>`).join('')}</div></div>
      <div class="grid2"><label class="f"><span>${t('fig.sc.style')}</span><select id="figScStyle">${['bar', 'ticks', 'line', 'none'].map((v) => `<option value="${v}" ${(F.scale?.style || 'bar') === v ? 'selected' : ''}>${t('fig.sc.' + v)}</option>`).join('')}</select></label>
      <label class="f"><span>${t('fig.sc.pos')}</span><select id="figScPos">${['bl', 'br', 'tl', 'tr'].map((v) => `<option value="${v}" ${(F.scale?.pos || 'bl') === v ? 'selected' : ''}>${t('fig.sc.p.' + v)}</option>`).join('')}</select></label>
      <label class="f"><span>${t('fig.sc.len')}</span><input type="number" id="figScLen" min="0" step="any" value="${F.scale?.len ?? ''}" placeholder="${t('fig.auto2')}"></label>
      <label class="f"><span>${t('fig.sc.div')}</span><input type="number" id="figScDiv" min="2" max="10" step="1" value="${F.scale?.div ?? 4}"></label>
      <label class="f"><span>${t('fig.sc.colors')}</span><span class="row"><input type="color" id="figScColor" value="${F.scale?.color || '#ffffff'}"><input type="color" id="figScInk" value="${F.scale?.ink || '#000000'}"></span></label>
      <label class="chk" style="align-self:end"><input type="checkbox" id="figScAll" ${F.scale?.all ? 'checked' : ''}><span>${t('fig.sc.all')}</span></label></div>
      <button class="btn small" id="figAuto">${t('fig.auto')}</button>
      ${cls.map((c) => { const list = classTraces(c.id).sort((a, b) => b.o.area - a.o.area).slice(0, 60), sel = new Set(F.picks[c.id] || []);
        return `<div class="figcls"><b><span class="swatch" style="background:${c.color}"></span>${esc(c.name)}</b><span class="note">${t('fig.chosen', { n: sel.size, m: classTraces(c.id).length })}</span>
          <div class="thumbs" data-cls="${c.id}">${list.map((x) => `<label title="${esc(x.s.name)} · ${fmt(depthAtRow(x.s, x.o.bbox[1]), 3)} ${x.s.units}"><input type="checkbox" data-key="${x.key}" ${sel.has(x.key) ? 'checked' : ''}><canvas data-thumb="${x.key}" width="56" height="56"></canvas></label>`).join('')}</div></div>`; }).join('') || `<p class="note">${t('fig.noTraces')}</p>`}`;
    for (const cv of box.querySelectorAll('canvas[data-thumb]')) {
      const [sid, oid] = cv.dataset.thumb.split(':'), s = S.sections.find((q) => q.id === sid), o = s?.objects.get(+oid); if (!o) continue;
      const tc = traceCanvas(s, o, 56, F.img, false); const ctx = cv.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 56, 56); ctx.drawImage(tc.canvas, (56 - tc.canvas.width) / 2, (56 - tc.canvas.height) / 2);
    }
  } else if (F.type === 'sections') {
    const D = compositeData(), base = D.base;
    box.innerHTML = `${figWinHTML()}<div class="grid2"><label class="f"><span>${t('fig.panelW')}</span><input type="number" id="figPanelW" min="10" max="600" step="10" value="${F.panelW}"></label>
      <label class="f"><span>${t('fig.panelH')}</span><input type="number" id="figPanelH" min="50" max="4000" step="50" value="${F.panelH}"></label></div>
      <label class="chk"><input type="checkbox" id="figKeepRatio" ${F.keepRatio ? 'checked' : ''}><span>${t('fig.keepRatio')}</span></label><p class="note" id="figRatioNote"></p>
      <div class="f"><span>${t('fig.panels')}</span><div class="chk2">${FIG_PANELS.map((p) => `<label class="chk"><input type="checkbox" data-panel="${p}" ${F.panels.includes(p) ? 'checked' : ''}><span>${t('fig.p.' + p)}</span></label>`).join('')}</div></div>
      <div class="grid2"><label class="f"><span>${t('fig.markStyle')}</span><select id="figMarkStyle">${['arrowLabel', 'arrow', 'triDown', 'tri', 'circle', 'square', 'star', 'cross'].map((v) => `<option value="${v}" ${(F.markStyle || 'arrowLabel') === v ? 'selected' : ''}>${t('fig.ms.' + v)}</option>`).join('')}</select></label>
      <label class="f"><span>${t('fig.overlap')}</span><select id="figOverlap" ${(F.markStyle || 'arrowLabel') !== 'arrowLabel' ? 'disabled' : ''}>${['keep', 'shift', 'merge', 'hide'].map((v) => `<option value="${v}" ${(F.overlap || 'keep') === v ? 'selected' : ''}>${t('fig.ov.' + v)}</option>`).join('')}</select></label></div>
      <label class="f"><span>${t('fig.alpha')}</span><input type="range" id="figAlpha" min="0.1" max="0.9" step="0.05" value="${F.alpha}"></label>
      <label class="f" title="${esc(t('fig.minAreaTip'))}"><span>${t('fig.minArea')}</span><input type="number" id="figMinArea" min="0" step="10" value="${F.minArea}"></label>
      <label class="chk"><input type="checkbox" id="figHideExcl" ${F.hideExcl ? 'checked' : ''}><span>${t('log.hideExcl')}</span></label>
      <details class="mini"><summary>${t('ar.title')}</summary>${arrowFormHTML()}</details>
      <p class="note">${t('fig.secNote')}</p>`;
    syncSecFigSize();
  } else if (F.type === 'range') {
    box.innerHTML = `${figWinHTML()}<label class="f"><span>${t('log.height')}</span><input type="number" id="figRangeH" min="300" max="6000" step="50" value="${F.rangeH}"></label>
      <div class="grid2"><label class="f"><span>${t('fig.axisFig')}</span><select id="figRangeAxis"><option value="depth" ${(F.rangeAxis || S.logView.axis) !== 'age' ? 'selected' : ''}>${t('log.depth')}</option><option value="age" ${(F.rangeAxis || S.logView.axis) === 'age' ? 'selected' : ''} ${S.age.model ? '' : 'disabled'}>${t('log.age')}</option></select></label>
      <label class="f"><span>${t('fig.ptsSrc')}</span><select id="figRangeSrc">${['all', 'objects', 'marks'].map((v) => `<option value="${v}" ${(F.rangeSrc || 'all') === v ? 'selected' : ''}>${t('fig.ptsSrc.' + v)}</option>`).join('')}</select></label></div>
      ${(F.rangeSrc || 'all') === 'all' ? `<label class="chk"><input type="checkbox" id="figRangeHollow" ${F.rangeHollow !== false ? 'checked' : ''}><span>${t('fig.ptsHollow')}</span></label>` : ''}
      <label class="f"><span>${t('fig.rangeDisplay')}</span><select id="figRangeDisplay">${['symbols', 'bars', 'both', 'kite', 'kiteSymbols'].map((v) => `<option value="${v}" ${(F.rangeDisplay || 'symbols') === v ? 'selected' : ''}>${t('fig.rangeDisplay.' + v)}</option>`).join('')}</select></label>
      <details class="mini"><summary>${t('fig.taxonSymbols')}</summary>${S.classes.filter((c) => c.id !== 'artifact').map((c) => `<label class="f"><span>${esc(c.name)}</span><select data-taxon-symbol="${esc(c.id)}">${['triDown','tri','circle','square','diamond','star','cross'].map((v) => `<option value="${v}" ${(c.symbol || 'triDown') === v ? 'selected' : ''}>${t('fig.ms.' + v)}</option>`).join('')}</select></label>`).join('')}</details>
      <label class="f"><span>${t('fig.rangeColW')}</span><input type="number" id="figRangeColW" min="16" max="200" step="2" value="${F.rangeColW || 30}"></label>
      <div class="f"><span>${t('fig.rangeTaxa')}</span><div class="chk2">${S.classes.filter((c) => c.id !== 'artifact').map((c) => `<label class="chk"><input type="checkbox" data-range-taxon="${esc(c.name)}" ${(colView('range').style?.colHide || []).includes('sp:' + c.name) ? '' : 'checked'}><span>${esc(c.name)}</span></label>`).join('')}</div>
      <div class="row"><button class="btn small" type="button" data-range-all="1">${t('mp.all')}</button><button class="btn small" type="button" data-range-all="0">${t('mp.none')}</button></div></div>
      <label class="chk"><input type="checkbox" id="figRangeTotal" ${F.rangeTotal ? 'checked' : ''}><span>${t('log.total')}</span></label><p class="note">${t('fig.rangeNote')}</p>`;   // V0.51: taxa shown and column width
  } else if (F.type === 'core') {
    const tr = F.tracks || S.logView.tracks, names = [...new Set(S.records.flatMap((r) => r.series.map((x) => x.name)))], shown = F.recs || S.records.flatMap((r) => r.series.filter((x) => x.show).map((x) => x.name));
    const trLab = { image: t('log.image'), total: t('log.total'), species: t('log.species'), BI: 'BI', ii: 'ii', manual: t('log.manual'), marks: t('color.marks') };
    box.innerHTML = `${figWinHTML()}
      <div class="f"><span>${t('fig.tracks')}</span><div class="chk2">${Object.keys(trLab).map((k) => `<label class="chk"><input type="checkbox" data-ftrack="${k}" ${(k === 'marks' ? tr[k] !== false : tr[k]) ? 'checked' : ''}><span>${esc(trLab[k])}</span></label>`).join('')}</div></div>
      ${names.length ? `<div class="f"><span>${t('fig.recs')}</span><div class="chk2">${names.map((n) => `<label class="chk"><input type="checkbox" data-frec="${esc(n)}" ${shown.includes(n) ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div></div>` : ''}
      <div class="grid2"><label class="f"><span>${t('fig.coreImgW')}</span><input type="number" id="figCoreImgW" min="10" max="600" step="10" value="${F.coreImgW || 70}"></label>
      <label class="f"><span>${t('log.height')}</span><input type="number" id="figCoreH" min="200" max="6000" step="100" value="${F.coreH}"></label></div>
      <label class="chk"><input type="checkbox" id="figKeepRatio" ${F.keepRatio ? 'checked' : ''}><span>${t('fig.keepRatio')}</span></label><p class="note" id="figRatioNote"></p>
      <div class="f"><span>${t('log.panels')}</span><div class="chk2">${FIG_PANELS.map((q) => `<label class="chk"><input type="checkbox" data-corep="${q}" ${(F.corePanels || []).includes(q) ? 'checked' : ''}><span>${t('fig.p.' + q)}</span></label>`).join('')}</div></div>
      <label class="chk"><input type="checkbox" id="figCoreHideExcl" ${F.coreHideExcl ? 'checked' : ''}><span>${t('log.hideExcl')}</span></label>
      <details class="mini"><summary>${t('st.title')}</summary><div id="figStyle">${styleFormHTML()}</div></details>
      <p class="note">${t('fig.coreNote')}</p>`;
    syncCoreFigSize();
  } else if (F.type === 'geolog') {
    box.innerHTML = `<label class="f"><span>${t('geo.core')}</span><select id="figGeoCore">${S.cores.map((c) => `<option value="${c.id}" ${c.id === S.geo.view.core ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><p class="note">${t('fig.geoNote')}</p>`;
  } else if (F.type === 'locmap') box.innerHTML = locmapPanelHTML();
  else box.innerHTML = `<p class="note">${t(F.type === 'map' ? 'fig.mapNote' : 'fig.logNote')}</p>`;
  if (F.type === 'log' || F.type === 'geolog') box.insertAdjacentHTML('afterbegin', `<label class="chk"><input type="checkbox" id="figLogHideExcl" ${S.logView.hideExcl ? 'checked' : ''}><span>${t('log.hideExcl')}</span></label>`);   // V0.51: every figure with the core
  if (['sections', 'range', 'log'].includes(F.type)) box.insertAdjacentHTML('beforeend', `<details class="mini"><summary>${t('st.title')}</summary>${F.type === 'log' ? styleFormHTML() : verticalStyleHTML() + (F.type === 'range' ? colOrderHTML('range') + colorsFormHTML(S.logView.style || {}, 'range') + speciesFormHTML(S.logView.style || {}) + axesFormHTML(['total', 'species']) : '')}</details>`);
}

/** Editable SVG labels. Keys include source text and occurrence; offsets use the parent SVG coordinates. */
export function editSVGLabels(box, edits, save) {
  const svg = box.querySelector('svg'); if (!svg) return;
  const old = box.parentElement.querySelector('[data-label-editor]'); old?.remove();
  const seen = new Map(), nodes = [...svg.querySelectorAll('text')].map((node) => {
    const source = node.textContent, n = seen.get(source) || 0; seen.set(source, n + 1);
    return { node, key: JSON.stringify([source, n]), source, html: node.innerHTML, transform: node.getAttribute('transform') || '' };
  });
  const apply = (q) => {
    const v = edits[q.key] || {};
    q.node.innerHTML = q.html;
    if (v.text != null) q.node.textContent = v.text;
    q.node.setAttribute('transform', `translate(${v.x || 0} ${v.y || 0}) ${q.transform}`);
  };
  nodes.forEach(apply);
  const ui = document.createElement('details'); ui.dataset.labelEditor = '1'; ui.className = 'mini';
  ui.innerHTML = `<summary>${t('edit.labels')}</summary><p class="note">${t('edit.hint')}</p><label class="f"><span>${t('edit.label')}</span><select data-label-select>${nodes.map((q, i) => `<option value="${i}">${esc(q.source.slice(0, 90) || '—')} (${i + 1})</option>`).join('')}</select></label><label class="f"><span>${t('edit.text')}</span><input data-label-text type="text"></label><div class="grid2"><label class="f"><span>Δ X (px)</span><input data-label-x type="number" step="any"></label><label class="f"><span>Δ Y (px)</span><input data-label-y type="number" step="any"></label></div><button class="btn small" data-label-reset>${t('edit.reset')}</button>`;
  box.before(ui);
  const pick = ui.querySelector('[data-label-select]'), text = ui.querySelector('[data-label-text]'), x = ui.querySelector('[data-label-x]'), y = ui.querySelector('[data-label-y]');
  const refresh = () => { const q = nodes[+pick.value]; if (!q) return; const v = edits[q.key] || {}; text.value = v.text ?? q.source; x.value = v.x || 0; y.value = v.y || 0; };
  const persist = () => { markDirty(); save(svg.outerHTML); };
  pick.onchange = refresh; refresh();
  for (const input of [text, x, y]) input.onchange = () => {
    const q = nodes[+pick.value]; if (!q) return;
    edits[q.key] = { text: text.value, x: Number(x.value) || 0, y: Number(y.value) || 0 }; apply(q); persist();
  };
  ui.querySelector('[data-label-reset]').onclick = () => { const q = nodes[+pick.value]; if (!q) return; delete edits[q.key]; apply(q); refresh(); persist(); };
  nodes.forEach((q, i) => {
    q.node.addEventListener('pointerdown', (e) => {
      if (!ui.open || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); pick.value = i; refresh();
      const matrix = q.node.parentNode.getScreenCTM()?.inverse(); if (!matrix) return;
      const start = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix), v = { ...(edits[q.key] || {}) };
      q.node.setPointerCapture(e.pointerId);
      const move = (ev) => { const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(matrix); edits[q.key] = { ...v, x: +( (v.x || 0) + p.x - start.x).toFixed(2), y: +((v.y || 0) + p.y - start.y).toFixed(2) }; apply(q); refresh(); };
      const end = () => { q.node.removeEventListener('pointermove', move); q.node.removeEventListener('pointerup', end); q.node.removeEventListener('pointercancel', end); persist(); };
      q.node.addEventListener('pointermove', move); q.node.addEventListener('pointerup', end); q.node.addEventListener('pointercancel', end);
    });
  });
  save(svg.outerHTML);
}

/* ───────────── V0.43: core location map (figure) ───────────── */
const LM_BASES = {
  blank: null, vector: null,
  satellite: { svc: 'World_Imagery', attr: 'Esri, Maxar, Earthstar Geographics, GIS User Community' },
  topo: { svc: 'World_Topo_Map', attr: 'Esri and contributors (World Topographic Map)' },
  relief: { svc: 'World_Shaded_Relief', attr: 'Esri (World Shaded Relief)' },
  physical: { svc: 'World_Physical_Map', attr: 'Esri, U.S. National Park Service (World Physical Map)' },
  streets: { svc: 'World_Street_Map', attr: 'Esri, HERE, Garmin, OpenStreetMap contributors (World Street Map)' },
  ocean: { svc: 'Ocean/World_Ocean_Base', attr: 'Esri, Garmin, GEBCO, NOAA NGDC (World Ocean Base)' },
};
const lmSet = () => { const F = S.fig; F.loc = { ...LOCMAP_DEFAULTS, ...(F.loc || {}), labels: { ...LOCMAP_DEFAULTS.labels, ...(F.loc?.labels || {}) } }; return F.loc; };
const lmPoints = () => S.cores.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon)).map((c) => ({ name: c.name, lat: c.lat, lon: c.lon }));
const lmBgCache = new Map();
/** Raster base of exactly the frame, asked to Esri in the map CRS (EPSG:4326, 3857 or 326xx/327xx), as a data URL. */
function locmapBackground(st, r) {
  const def = LM_BASES[st.base]; if (!def) return null;
  const fr = r.frame, k = Math.min(2, 4096 / Math.max(fr.W, fr.H)), w = Math.round(fr.W * k), h = Math.round(fr.H * k);
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/${def.svc}/MapServer/export?bbox=${[fr.X0, fr.Y0, fr.X1, fr.Y1].map((v) => v.toFixed(r.crs.geographic ? 6 : 1)).join(',')}&bboxSR=${r.crs.epsg}&imageSR=${r.crs.epsg}&size=${w},${h}&format=jpg&f=image`;
  const hit = lmBgCache.get(url);
  if (hit && hit !== 'pending') return hit === 'fail' ? null : hit;
  if (!hit && mapNetConsent()) {
    lmBgCache.set(url, 'pending');
    fetchImage(url).then((href) => { lmBgCache.set(url, { href, attribution: def.attr }); scheduleFigure(); })
      .catch(() => { lmBgCache.set(url, 'fail'); toast(t('ms.bgFail')); scheduleFigure(); });
  }
  return null;
}
function locmapSVG() {
  const st = lmSet(), pts = lmPoints();
  const o = { settings: st, points: pts, land: geoLand, labelsText: { crs: t('lm.crs') } };
  let r = buildLocMapSVG(o);
  if (LM_BASES[st.base]) { const bg = locmapBackground(st, r); if (bg) r = buildLocMapSVG({ ...o, bg }); }
  lastLocmap = r;
  if (!pts.length) $('lmNote') && ($('lmNote').textContent = t('lm.noCores'));
  return r.svg;
}
let lastLocmap = null;
function locmapPanelHTML() {
  const st = lmSet(), b = st.bbox || lmFitBBox(lmPoints(), st.margin), auto = lmUtmZone((b[0] + b[2]) / 2);
  const opt = (k, vals, lab) => `<select data-lm="${k}">${vals.map((v) => `<option value="${v}" ${String(st[k]) === String(v) ? 'selected' : ''}>${lab(v)}</option>`).join('')}</select>`;
  const chk = (k, path = k) => `<label class="chk"><input type="checkbox" data-lm="${path}" ${(path.startsWith('labels.') ? st.labels[path.slice(7)] : st[k]) ? 'checked' : ''}><span>${t('lm.' + k)}</span></label>`;
  const num = (k, min, max, stp) => `<label class="f"><span>${t('lm.' + k)}</span><input type="number" data-lm="${k}" min="${min}" max="${max}" step="${stp}" value="${st[k] ?? ''}" placeholder="${t('fig.auto2')}"></label>`;
  const pos = (k) => opt(k, ['tl', 'tr', 'bl', 'br'], (v) => t('lm.pos.' + v));
  return `<p class="note" id="lmNote">${t('lm.intro', { n: lmPoints().length })}</p>
    <details class="mini" open><summary>${t('lm.view')}</summary>
      <label class="f"><span>${t('lm.base')}</span>${opt('base', Object.keys(LM_BASES), (v) => t('lm.b.' + v))}</label>
      <label class="f"><span>${t('lm.baseOpacity')}</span><input type="range" data-lm="baseOpacity" min="0.2" max="1" step="0.05" value="${st.baseOpacity}"></label>
      <div class="grid2">${['W', 'S', 'E', 'N'].map((q, i) => `<label class="f"><span>${t('lm.bb.' + q)}</span><input type="number" data-lm="bbox.${i}" step="any" value="${+b[i].toFixed(4)}"></label>`).join('')}</div>
      <div class="row" style="gap:4px;flex-wrap:wrap">${[['in', '＋'], ['out', '－'], ['w', '◀'], ['n', '▲'], ['s', '▼'], ['e', '▶']].map(([k, ic]) => `<button class="btn small" type="button" data-lmz="${k}" title="${t('lm.z.' + k)}" aria-label="${t('lm.z.' + k)}">${ic}</button>`).join('')}<button class="btn small" type="button" data-lmz="fit">${t('lm.z.fit')}</button></div>
      <div class="grid2"><label class="f"><span>${t('lm.width')}</span><input type="number" data-lm="width" min="300" max="3000" step="50" value="${st.width}"></label>
      <label class="f"><span>${t('lm.aspect')}</span>${opt('aspect', ['auto', '1:1', '4:3', '3:2', '16:9', 'A4', 'A4v'], (v) => (v === 'auto' ? t('lm.aspectAuto') : v === 'A4' ? 'A4 ↔' : v === 'A4v' ? 'A4 ↕' : v))}</label></div>
    </details>
    <details class="mini" open><summary>${t('lm.crsT')}</summary>
      <label class="f"><span>${t('lm.crs')}</span>${opt('crs', ['EPSG:4326', 'EPSG:3857', 'UTM'], (v) => t('lm.c.' + v.replace(':', '')))}</label>
      ${st.crs === 'UTM' ? `<div class="grid2"><label class="f"><span>${t('lm.zone')}</span><select data-lm="utmZone"><option value="">${t('lm.zoneAuto', { z: auto })}</option>${Array.from({ length: 60 }, (_, i) => `<option value="${i + 1}" ${st.utmZone === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
      <label class="f"><span>${t('lm.hemi')}</span><select data-lm="utmSouth"><option value="">${t('lm.hemiAuto')}</option><option value="0" ${st.utmSouth === false ? 'selected' : ''}>${t('lm.hN')}</option><option value="1" ${st.utmSouth === true ? 'selected' : ''}>${t('lm.hS')}</option></select></label></div>` : ''}
    </details>
    <details class="mini" open><summary>${t('lm.gridT')}</summary>
      ${chk('grid')}
      <div class="grid2"><label class="f"><span>${t('lm.gridType')}</span>${opt('gridType', st.crs === 'EPSG:4326' ? ['auto'] : ['auto', 'geo'], (v) => t('lm.g.' + v))}</label>
      <label class="f"><span>${t(st.crs === 'EPSG:4326' || st.gridType === 'geo' ? 'lm.stepDeg' : 'lm.stepM')}</span><input type="number" data-lm="gridStep" min="0" step="any" value="${st.gridStep ?? ''}" placeholder="${t('fig.auto2')}"></label></div>
      <div class="f"><span>${t('lm.sides')}</span><div class="chk2">${['top', 'bottom', 'left', 'right'].map((q) => `<label class="chk"><input type="checkbox" data-lm="labels.${q}" ${st.labels[q] ? 'checked' : ''}><span>${t('lm.side.' + q)}</span></label>`).join('')}</div>
      <div class="row" style="gap:4px"><button class="btn small" type="button" data-lmz="allSides">${t('mp.all')}</button><button class="btn small" type="button" data-lmz="noSides">${t('mp.none')}</button></div></div>
      ${st.crs === 'EPSG:4326' || st.gridType === 'geo' ? `<label class="f"><span>${t('lm.fmt')}</span>${opt('coordFmt', ['dd', 'dms'], (v) => t('lm.f.' + v))}</label>` : `<label class="f"><span>${t('lm.unit')}</span>${opt('metricUnit', ['m', 'km'], (v) => v)}</label><p class="note">${t('lm.metricNote')}</p>`}
      <div class="grid2">${num('labelSize', 6, 24, 1)}<label class="f"><span>${t('lm.gridColor')}</span><input type="color" data-lm="gridColor" value="${st.gridColor}"></label></div>
      <div class="grid2">${['textColor', 'subColor', 'bgColor'].map((k) => `<label class="f"><span>${t('color.' + k)}</span><input type="color" data-lm="${k}" value="${esc(st[k] || LOCMAP_DEFAULTS[k])}"></label>`).join('')}</div>
      ${chk('ticks')}${chk('rotateSide')}${chk('gridDash')}
    </details>
    <details class="mini"><summary>${t('lm.elemT')}</summary>
      <div class="grid2">${chk('scaleBar')}<label class="f"><span>${t('lm.pos')}</span>${pos('scalePos')}</label>${chk('north')}<label class="f"><span>${t('lm.pos')}</span>${pos('northPos')}</label></div>
      ${num('northSize', 0.5, 3, 0.1)}
    </details>
    <details class="mini"><summary>${t('lm.coresT')}</summary>
      <div class="grid2"><label class="f"><span>${t('lm.symbol')}</span>${opt('symbol', ['circle', 'square', 'triangle', 'diamond', 'star'], (v) => t('lm.s.' + v))}</label>${num('pointSize', 2, 20, 1)}
      <label class="f"><span>${t('lm.pointColor')}</span><input type="color" data-lm="pointColor" value="${st.pointColor}"></label><label class="f"><span>${t('lm.land')}</span><input type="color" data-lm="land" value="${st.land}"></label>
      <label class="f"><span>${t('lm.sea')}</span><input type="color" data-lm="sea" value="${st.sea}"></label>${num('coreLabelSize', 6, 24, 1)}</div>
      ${chk('coreLabels')}${chk('coast')}
    </details>
    <details class="mini" open><summary>${t('lm.outT')}</summary>
      <div class="grid2"><label class="f"><span>${t('lm.fmtOut')}</span>${opt('fmt', ['svg', 'png', 'jpg'], (v) => v.toUpperCase())}</label>
      <label class="f"><span>${t('lm.scale')}</span>${opt('scale', [1, 2, 3, 4, 6], (v) => `×${v} (≈${Math.round(96 * v)} ppp)`)}</label></div>
      <button class="btn primary small" type="button" data-lmz="export">${t('lm.export')}</button>
    </details>`;
}
function onLocmapInput(el) {
  const st = lmSet(), k = el.dataset.lm, v = el.type === 'checkbox' ? el.checked : el.type === 'number' || el.type === 'range' ? (el.value === '' ? null : +el.value) : el.value;
  if (k.startsWith('labels.')) st.labels[k.slice(7)] = v;
  else if (k.startsWith('bbox.')) { const b = [...(st.bbox || lastLocmap?.bbox || lmFitBBox(lmPoints(), st.margin))]; if (v != null) b[+k.slice(5)] = v; if (b[2] > b[0] && b[3] > b[1]) st.bbox = b; }
  else if (k === 'utmZone') st.utmZone = v ? +v : null;
  else if (k === 'utmSouth') st.utmSouth = v === '' ? null : v === '1';
  else if (k === 'scale') st.scale = +v;
  else st[k] = v;
  if (k === 'crs' && v === 'EPSG:4326') st.gridType = 'auto';
  markDirty(); if (['crs', 'gridType', 'base'].includes(k)) renderFigPanel(); scheduleFigure();
}
async function exportLocmap() {
  const st = lmSet(); if (!figSvgCache) return;
  const name = `${safe(S.name)}_mapa_localizacion`;
  if (st.fmt === 'svg') { await saveFile(name + '.svg', figSvgCache, 'image/svg+xml'); return; }
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(figSvgCache); await img.decode();
  const k = st.scale || 3, c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  const type = st.fmt === 'jpg' ? 'image/jpeg' : 'image/png', blob = await new Promise((r) => c.toBlob(r, type, st.quality));
  if (blob) await saveFile(name + (st.fmt === 'jpg' ? '.jpg' : '.png'), blob, type);
}
$('figPanel').addEventListener('click', (e) => {   // V0.51: show all / no ichnotaxa in the distribution figure
  const b = e.target.closest('[data-range-all]'); if (!b) return;
  const st = (colView('range').style ||= {}), on = b.dataset.rangeAll === '1', h = new Set((st.colHide || []).filter((id) => !id.startsWith('sp:')));
  if (!on) for (const c of S.classes) if (c.id !== 'artifact') h.add('sp:' + c.name);
  st.colHide = [...h]; markDirty(); renderFigPanel(); scheduleLog(); scheduleFigure();
});
$('figPanel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lmz]'); if (!b) return;
  const st = lmSet(), z = b.dataset.lmz, cur = st.bbox || lastLocmap?.bbox || lmFitBBox(lmPoints(), st.margin);
  if (z === 'export') { busy(exportLocmap); return; }
  if (z === 'fit') st.bbox = null;
  else if (z === 'allSides' || z === 'noSides') for (const q of ['top', 'bottom', 'left', 'right']) st.labels[q] = z === 'allSides';
  else st.bbox = lmZoom(cur, z === 'in' ? 1.5 : z === 'out' ? 1 / 1.5 : 1, z === 'e' ? 0.25 : z === 'w' ? -0.25 : 0, z === 'n' ? 0.25 : z === 's' ? -0.25 : 0);
  markDirty(); renderFigPanel(); scheduleFigure();
});

/**
 * V0.51: horizontal version of a figure: the whole drawing is turned 90° anticlockwise (depth or age runs left → right,
 * the first column ends at the bottom; images turn with it) and every text is turned back so it keeps its reading
 * orientation; titles that were vertical (±90°) become horizontal. Tick labels left of an axis are centred under it,
 * labels of the top margin end at their anchor and those of the bottom margin start at it. The page is then fitted to
 * the drawn content (getBBox), so nothing is cut.
 */
function orientSVG(svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement;
  if (root.nodeName !== 'svg') return svg;
  const vb = (root.getAttribute('viewBox') || `0 0 ${root.getAttribute('width')} ${root.getAttribute('height')}`).split(/[\s,]+/).map(Number), [vx, vy, vw, vh] = vb;
  const NS = 'http://www.w3.org/2000/svg', g = doc.createElementNS(NS, 'g');
  // the heading (title and subtitle at the top left of the drawing) stays horizontal on top of the new page
  const head = [...root.children].filter((e) => e.nodeName === 'text' && !e.getAttribute('transform') && +e.getAttribute('y') < 40 && +(e.getAttribute('x') || 0) < 30);
  for (const e of head) e.remove();
  g.setAttribute('transform', 'rotate(-90)');
  while (root.firstChild) g.appendChild(root.firstChild);
  root.appendChild(g);
  for (const tx of [...g.querySelectorAll('text')]) {
    const m = tx.transform?.baseVal?.consolidate()?.matrix || { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const x = +(String(tx.getAttribute('x') || '0').split(/[\s,]+/)[0]) || 0, y = +(String(tx.getAttribute('y') || '0').split(/[\s,]+/)[0]) || 0;
    const ax = m.a * x + m.c * y + m.e, ay = m.b * x + m.d * y + m.f, own = (Math.atan2(m.b, m.a) * 180) / Math.PI;
    const vertical = Math.abs(Math.abs(own) - 90) < 1, want = vertical ? 0 : own, c = want + 90 - own;
    if (want === 0) {
      const an = tx.getAttribute('text-anchor') || 'start';
      if (!vertical && ay < vy + vh * 0.12) tx.setAttribute('text-anchor', 'end');
      else if (!vertical && ay > vy + vh * 0.88) tx.setAttribute('text-anchor', 'start');
      else if (an === 'end') tx.setAttribute('text-anchor', 'middle');
    }
    const w = doc.createElementNS(NS, 'g'); w.setAttribute('transform', `rotate(${+c.toFixed(3)} ${+ax.toFixed(2)} ${+ay.toFixed(2)})`);
    tx.parentNode.insertBefore(w, tx); w.appendChild(tx);
  }
  // page = what is actually drawn (measured in a hidden copy), with a small margin
  let box = { x: vy, y: -(vx + vw), width: vh, height: vw };
  const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden';
  host.innerHTML = new XMLSerializer().serializeToString(root); document.body.appendChild(host);
  try { const b = host.querySelector('svg').getBBox(); if (b.width > 0 && b.height > 0) box = b; } catch { /* keep the rotated page */ }   // root user space: includes the rotation
  host.remove();
  const hh = head.length ? Math.max(...head.map((e) => +e.getAttribute('y'))) + 10 : 0;
  const pad = 6, X = Math.floor(box.x - pad), Y = Math.floor(box.y - pad - hh), W = Math.ceil(box.width + 2 * pad), H = Math.ceil(box.height + 2 * pad + hh);
  root.setAttribute('viewBox', `${X} ${Y} ${W} ${H}`); root.setAttribute('width', W); root.setAttribute('height', H);
  // background of the whole new page
  const bg = doc.createElementNS(NS, 'rect'); for (const [k, v] of [['x', X], ['y', Y], ['width', W], ['height', H], ['fill', '#ffffff']]) bg.setAttribute(k, v);
  root.insertBefore(bg, g);
  for (const e of head) { e.setAttribute('x', X + (+e.getAttribute('x') || 0)); e.setAttribute('y', Y + +e.getAttribute('y')); root.appendChild(e); }
  return new XMLSerializer().serializeToString(root);
}

/** V0.13: message for a drawing error (translated when it is an invalid axis, the real message otherwise). */
export const axisErr = (e) => (/^Invalid horizontal axis/.test(e?.message || '') ? t('edit.invalidAxis') : e?.message || String(e));
export function renderFigure() {
  if (mode !== 'fig') return;
  $('figStage').querySelector('[data-label-editor]')?.remove();
  const F = S.fig; let svg = null;
  try {
    if (F.type === 'traces') svg = tracesSVG();
    else if (F.type === 'core') svg = coreSVG();
    else if (F.type === 'sections') svg = sectionsSVG();
    else if (F.type === 'range') svg = rangeSVG();
    else if (F.type === 'log') { renderLog(); svg = lastLog?.svg || null; }
    else if (F.type === 'geolog') { if (geoRT.dirty) geoComputeSamples(); renderGeoLogs(); svg = $('geoLogSvg').querySelector('svg')?.outerHTML || null; }
    else if (F.type === 'locmap') svg = locmapSVG();
    else { if (geoRT.dirty) geoComputeSamples(); svg = renderGeoMap() || null; }
    if (svg && orientOf(F) === 'h' && !['map', 'locmap'].includes(F.type)) svg = orientSVG(svg);   // V0.51
    if (svg) svg = scopeIds(svg);   // V0.70
  } catch (e) { console.error(e); $('figOut').innerHTML = `<p class="note" style="padding:20px">${esc(axisErr(e))}</p>`; return; }
  figSvgCache = svg ? wrapFigure(svg, F.title, F.caption) : '';
  // V0.27: an empty figure is a blank sheet with what to do next
  $('figOut').innerHTML = figSvgCache || `<div class="figempty"><p>${t(F.type === 'traces' ? 'fig.pickFirst' : 'fig.empty')}</p>${F.type === 'traces' ? `<button class="btn primary" type="button" data-figauto>${t('fig.auto')}</button>` : ''}</div>`;
  $('figOut').querySelector('[data-figauto]')?.addEventListener('click', () => $('figAuto')?.click());
  F.textEdits ||= {};
  editSVGLabels($('figOut'), (F.textEdits[F.type] ||= {}), (edited) => { figSvgCache = edited; });
}
/**
 * V0.70: the ids of a figure get a prefix. The same SVG (column view, geo logs) also exists, hidden, in another tab, and a
 * `url(#id)` that resolves to an element inside a hidden SVG paints nothing (the no-data hatching came out blank).
 */
export function scopeIds(svg) {
  const ids = [...new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))];
  if (!ids.length) return svg;
  const q = ids.map((i) => i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((x, y) => y.length - x.length).join('|');
  return svg.replace(new RegExp(`(\\sid="|url\\(#|href="#)(${q})(?=["')])`, 'g'), (m, a2, id) => `${a2}fig-${id}`);
}
let figTimer = 0;
export const scheduleFigure = () => { clearTimeout(figTimer); figTimer = setTimeout(renderFigure, 150); };
$('figPanel').addEventListener('change', (e) => {
  if (e.target.dataset.lm != null) { onLocmapInput(e.target); return; }   // V0.43
  if (e.target.dataset.st || e.target.dataset.sph != null || e.target.dataset.ax != null || e.target.dataset.axw != null) { onStyleInput(e); return; }   // V0.5–V0.6: column style
  const F = S.fig, el = e.target;
  if (el.id === 'figType') { F.type = el.value; renderFigPanel(); }
  else if (el.id === 'figTitle') F.title = el.value; else if (el.id === 'figCaption') F.caption = el.value;
  else if (el.id === 'figOrient') (F.orients ||= {})[F.type] = el.value;   // V0.51
  else if (el.id === 'figRangeColW') F.rangeColW = Math.max(16, Math.min(200, +el.value || 30));
  else if (el.dataset.rangeTaxon != null) { const st = (colView('range').style ||= {}), h = new Set(st.colHide || []), id = 'sp:' + el.dataset.rangeTaxon; if (el.checked) h.delete(id); else h.add(id); st.colHide = [...h]; scheduleLog(); }
  else if (el.id === 'figLogHideExcl') { S.logView.hideExcl = el.checked; if ($('logHideExcl')) $('logHideExcl').checked = el.checked; scheduleLog(); }
  else if (el.id === 'figN') F.n = Math.max(1, +el.value || 1); else if (el.id === 'figPick') F.pick = el.value;
  else if (el.id === 'figTile') F.tile = Math.max(60, +el.value || 150); else if (el.id === 'figImg') { F.img = el.value; renderFigPanel(); }
  else if (el.id === 'figOutline') F.outline = el.checked; else if (el.id === 'figCoreH') F.coreH = Math.max(200, +el.value || 1400);
  else if (el.id === 'figCoreImgW') F.coreImgW = Math.max(10, +el.value || 70);
  else if (el.dataset.corep) { const set = new Set(F.corePanels || []); if (el.checked) set.add(el.dataset.corep); else set.delete(el.dataset.corep); F.corePanels = FIG_PANELS.filter((q) => set.has(q)); }   // V0.25
  else if (el.id === 'figCoreHideExcl') F.coreHideExcl = el.checked;
  else if (el.dataset.ftrack) { F.tracks = { ...(F.tracks || S.logView.tracks), [el.dataset.ftrack]: el.checked }; }
  else if (el.dataset.frec != null) { const set = new Set(F.recs || S.records.flatMap((r) => r.series.filter((x) => x.show).map((x) => x.name))); if (el.checked) set.add(el.dataset.frec); else set.delete(el.dataset.frec); F.recs = [...set]; }
  else if (el.id === 'figGeoCore') S.geo.view.core = el.value;
  else if (el.id === 'figSecFrom') F.secFrom = el.value === '' ? null : +el.value; else if (el.id === 'figSecTo') F.secTo = el.value === '' ? null : +el.value;
  else if (el.id === 'figPanelW') F.panelW = Math.max(10, +el.value || 150);
  else if (el.id === 'figPanelH') { F.panelH = Math.max(50, +el.value || 700); const z = secFigSize(figLightD()); if (z.r) F.panelW = Math.max(10, Math.min(600, Math.round(F.panelH / z.r))); }
  else if (el.id === 'figKeepRatio') F.keepRatio = el.checked;
  else if (el.dataset.tview) { const set = new Set(traceViews(F)); if (el.checked) set.add(el.dataset.tview); else set.delete(el.dataset.tview); F.tviews = Object.keys(TRACE_VIEWS).filter((v) => set.has(v)); if (!F.tviews.length) F.tviews = ['enh']; }
  else if (/^figSc/.test(el.id)) { F.scale ||= {}; const k = { figScStyle: 'style', figScPos: 'pos', figScLen: 'len', figScDiv: 'div', figScColor: 'color', figScInk: 'ink', figScAll: 'all' }[el.id]; F.scale[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value; }
  else if (el.dataset.arex != null) { const ex = new Set(F.arrowExcl || []); if (el.checked) ex.add(el.dataset.arex); else ex.delete(el.dataset.arex); F.arrowExcl = [...ex]; }   // V0.23
  else if (el.id === 'figArrowSrc') F.arrowSrc = el.value; else if (el.id === 'figObjScale') F.objScale = Math.max(0.2, +el.value || 1); else if (el.id === 'figMarkScale') F.markScale = Math.max(0.2, +el.value || 1);
  else if (el.id === 'figMarkStroke') F.markStroke = el.value; else if (el.id === 'figMarkStrokeW') F.markStrokeW = Math.max(0, +el.value || 0); else if (el.id === 'figLabelSize') F.labelSize = Math.max(5, +el.value || 10);
  else if (el.id === 'figLabelColor') F.labelColor = el.value; else if (el.id === 'figLabelHalo') F.labelHalo = el.checked;
  else if (el.id === 'figMarkStyle') { F.markStyle = el.value; renderFigPanel(); } else if (el.id === 'figOverlap') F.overlap = el.value;
  else if (el.dataset.panel) { const set = new Set(F.panels); if (el.checked) set.add(el.dataset.panel); else set.delete(el.dataset.panel); F.panels = FIG_PANELS.filter((p) => set.has(p)); }
  else if (el.id === 'figAlpha') F.alpha = +el.value; else if (el.id === 'figMinArea') F.minArea = Math.max(0, +el.value || 0); else if (el.id === 'figHideExcl') F.hideExcl = el.checked;
  else if (el.id === 'figRangeDisplay') { F.rangeDisplay = el.value; renderFigPanel(); }
  else if (el.id === 'figRangeAxis') { F.rangeAxis = el.value; renderFigPanel(); }   // V0.32
  else if (el.id === 'figRangeSrc') { F.rangeSrc = el.value; renderFigPanel(); }
  else if (el.id === 'figRangeHollow') F.rangeHollow = el.checked;
  else if (el.dataset.taxonSymbol) { const c = clsById(el.dataset.taxonSymbol); if (c) c.symbol = el.value; requestRender(); scheduleLog(); }
  else if (el.id === 'figRangeH') F.rangeH = Math.max(300, +el.value || 900); else if (el.id === 'figRangeTotal') F.rangeTotal = el.checked;
  else if (el.dataset.key) {
    const cls = el.closest('.thumbs').dataset.cls, set = new Set(F.picks[cls] || []);
    if (el.checked) set.add(el.dataset.key); else set.delete(el.dataset.key);
    F.picks[cls] = [...set]; el.closest('.figcls').querySelector('.note').textContent = t('fig.chosen', { n: set.size, m: classTraces(cls).length });
  }
  if (S.fig.type === 'sections' && $('figPanelW')) syncSecFigSize();
  if (S.fig.type === 'core') syncCoreFigSize();
  if (S.fig.type === 'traces' && (el.id === 'figSecFrom' || el.id === 'figSecTo')) renderFigPanel();
  markDirty(); scheduleFigure();
});
$('figPanel').addEventListener('click', (e) => {
  if (e.target.id !== 'figAuto') return;
  const F = S.fig;
  for (const c of S.classes) { const list = classTraces(c.id); if (list.length) F.picks[c.id] = autoPick(list, F.n, F.pick); }
  renderFigPanel(); markDirty(); renderFigure();
});
const figName = () => `${safe(S.name)}_${S.fig.type}`;
$('figSvg').addEventListener('click', () => { if (figSvgCache) saveFile(figName() + '.svg', figSvgCache, 'image/svg+xml'); });
$('figPng').addEventListener('click', () => busy(async () => {
  if (!figSvgCache) return;
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(figSvgCache); await img.decode();
  const k = 2, c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png')); if (blob) await saveFile(figName() + '.png', blob, 'image/png');
}));