/* Composite log of a core: column view, records and the order and visibility of chart columns. */
import { $, S, fmt, hex, uid } from './state.js';
import { analyze, armed, busy, compositeMarks, effClassArray, esc, geoOverlay, idListOf, idMode, legendOf, loadLand, logInteract, markDirty, needPixels, readTableFile, renderGeo, renderGeoLogs, requestRender, resizeCanvases, rowAtDepth, safe, saveFile, toast, updateTip, withProv } from './app.js';
import { applyPanels } from './panels.js';
import { renderData } from './datatab.js';
import { FIG_PANELS, arrowMarksSVG, axisErr, coreRatio, editSVGLabels, figTraces, panelDataURL, renderFigPanel, renderFigure, scheduleFigure } from './figures.js';
import { UNIT_TO_CM, interpAge, topAt } from './core.js';
import { LOG_STYLE, ND_STYLE, buildLogSVG, compositeRows, guessAxisColumn, invertModel, orderCols, rowsRange, toAxis, windowCSV } from './log.js';
import { t } from './i18n.js';
import { recordSeries } from './exportio.js';

/* ───────────── composite log ───────────── */

export function defaultLogView() {
  return { axis: 'depth', from: null, to: null, height: 900, imgMode: 'enh', overlay: true, hideExcl: false,
    tracks: { image: true, total: true, species: true, BI: true, ii: true, manual: true } };
}
S.logView = defaultLogView();
export let mode = 'section', logTimer = 0, lastLog = null;

export function setMode(m) {
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
export function sectionCanvas(s) {
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
export function columnImages(D, from, to, H) {
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
export function renderLogPanel() {
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

export function addRecordFromTable(name, tab, xCol, axis, yCols) {
  const n0 = S.records.reduce((k, r) => k + r.series.length, 0);
  const series = recordSeries(tab, xCol, yCols, REC_COLORS, n0);   // V0.44: exportio.js
  if (!series.length) return false;
  S.records.push({ id: uid(), name, axis, series });
  renderRecList(); markDirty(); scheduleLog();
  return true;
}

export function renderRecList() {
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