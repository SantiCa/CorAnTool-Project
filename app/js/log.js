// CorAnTool web — composite core log (no DOM): table parsing, axis transforms, SVG and CSV of a window.
import { interpAge, toCSV } from './core.js';

/** Parse CSV / TXT tables: delimiter , ; tab | or spaces; optional header; decimal comma; '#' comments. */
export function parseTable(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  if (!lines.length) return { headers: [], rows: [], text: [] };
  const head = lines.slice(0, 6);
  const delim = ['\t', ';', ',', '|'].find((d) => head.every((l) => l.split(d).length > 1)) || /\s+/;
  const split = (l) => (delim instanceof RegExp ? l.trim().split(delim) : l.split(delim)).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const decimalComma = delim !== ',' && lines.slice(0, 30).some((l) => /\d,\d/.test(l));
  const num = (c) => {
    if (c == null || c === '') return null;
    const v = Number(decimalComma ? c.replace(',', '.') : c);
    return Number.isFinite(v) ? v : null;
  };
  const first = split(lines[0]);
  const hasHeader = first.some((c) => c !== '' && num(c) === null);
  const headers = hasHeader ? first : first.map((_, i) => `col${i + 1}`);
  const body = (hasHeader ? lines.slice(1) : lines).map(split);
  const rows = body.map((c) => headers.map((_, i) => num(c[i])));
  const cells = body.map((c) => headers.map((_, i) => c[i] ?? ''));
  return { headers, rows, text: cells };
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

/** Small downward triangle marking an identified trace (tip on the trace). */
const markTri = (x, y, color) => `<path d="M${f2(x)} ${f2(y)}l-4.5 -8h9z" fill="${color}" stroke="#ffffff" stroke-width="0.8"/>`;
const escXml = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const f2 = (v) => +(+v).toFixed(2);
const lbl = (v) => String(+(+v).toPrecision(6));

/** Split a track name into at most two lines of about w px (10 px font); the second line ends in … if cut. */
export function wrapTitle(text, w) {
  const max = Math.max(4, Math.floor((w - 4) / 5.6)), words = String(text ?? '').split(/\s+/).filter(Boolean), lines = [''];
  for (const wd of words) {
    const cur = lines[lines.length - 1], next = cur ? cur + ' ' + wd : wd;
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
export function buildLogSVG(o) {
  const L = { total: 'Bioturbation (%)', species: 'Ichnotaxa (%)', image: 'Core', ...(o.labels || {}) };
  const H = o.height, top = 84, from = o.from, to = o.to;
  const span = to - from || 1;
  const y = (v) => f2(top + ((v - from) / span) * H);
  const rows = o.rows.filter((r) => r.a1 > from && r.a0 < to);
  const cols = [];
  const t = o.tracks, cw = o.colWidths || {}, wOf = (id, d) => Math.max(30, Math.min(600, +cw[id] || d));
  cols.push({ key: 'axis', w: 64 });
  if (t.image && o.image) cols.push({ key: 'image', w: o.imageWidth || 60, title: L.image });
  if (t.total) cols.push({ key: 'total', id: 'total', w: wOf('total', 150), title: L.total });
  const presentClasses = o.classes.filter((c) => rows.some((r) => (r.classPct[c.index] || 0) > 0));
  if (t.species) cols.push({ key: 'species', id: 'species', w: wOf('species', 150), title: L.species });
  if (t.BI) cols.push({ key: 'BI', w: 46, title: 'BI' });
  if (t.ii) cols.push({ key: 'ii', w: 46, title: 'ii' });
  for (const b of o.bands || []) { const id = 'band:' + (b.key || b.full || b.title); cols.push({ key: 'band', id, w: wOf(id, b.w || 46), title: b.title, full: b.full, band: b }); }
  for (const r of o.records) { const id = 'rec:' + r.name; cols.push({ key: 'rec', id, w: wOf(id, o.recWidth || 120), title: r.name, rec: r }); }
  if (o.marks?.length && !(t.image && o.image)) cols.splice(1, 0, { key: 'marks', id: 'marks', w: wOf('marks', 40), title: L.marks || 'Traces' });
  if (o.idList) cols.push({ key: 'idlist', id: 'idlist', w: wOf('idlist', 150), title: L.idList || 'Identified ichnotaxa' });
  let x = 8;
  for (const c of cols) { c.x = x; x += c.w + 14; }
  const W = x;
  const seenL = new Set(), legendItems = [...(t.species ? presentClasses : []), ...(o.legendClasses || []), ...(o.bandLegend || [])].filter((k) => !seenL.has(k.name) && seenL.add(k.name));
  const perRow = Math.max(1, Math.floor((W - 16) / 170));
  const legendH = legendItems.length ? Math.ceil(legendItems.length / perRow) * 16 + 14 : 0;
  const Htot = top + H + 22 + legendH;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${Htot}" viewBox="0 0 ${W} ${Htot}" font-family="IBM Plex Sans, Arial, Helvetica, sans-serif" font-size="10">`);
  out.push(`<rect x="0" y="0" width="${W}" height="${Htot}" fill="#ffffff"/>`);
  out.push(`<defs><clipPath id="plot"><rect x="0" y="${top}" width="${W}" height="${H}"/></clipPath></defs>`);
  out.push(`<text x="8" y="16" font-size="13" font-weight="600" fill="#1c2422">${escXml(o.title || '')}</text>`);
  if (o.subtitle) out.push(`<text x="8" y="31" fill="#5b6763">${escXml(o.subtitle)}</text>`);

  const yTicks = niceTicks(from, to, Math.max(3, Math.round(H / 70)));
  const frame = (c) => out.push(`<rect x="${c.x}" y="${top}" width="${c.w}" height="${H}" fill="none" stroke="#9aa5a1" stroke-width="0.8"/>`);
  // track names: up to two lines that fit the column width (V25); the full name is in the returned layout
  const title = (c) => {
    const ls = wrapTitle(c.title, c.w);
    out.push(`<text x="${c.x + c.w / 2}" y="${ls.length > 1 ? 46 : 54}" text-anchor="middle" font-weight="600" fill="#1c2422">${ls.map((l, i) => `<tspan x="${c.x + c.w / 2}" dy="${i ? 12 : 0}">${escXml(l)}</tspan>`).join('')}</text>`);
  };
  const xScale = (c, lo, hi, reverse = false, ticks = null) => {
    const sx = (v) => f2(c.x + ((reverse ? hi - v : v - lo) / (hi - lo || 1)) * c.w);
    for (const tv of ticks || niceTicks(lo, hi, 3)) {
      const xx = sx(tv);
      out.push(`<line x1="${xx}" y1="${top}" x2="${xx}" y2="${top + H}" stroke="#e3e8e6" stroke-width="0.6"/>`);
      out.push(`<line x1="${xx}" y1="${top - 4}" x2="${xx}" y2="${top}" stroke="#5b6763" stroke-width="0.6"/>`);
      out.push(`<text x="${xx}" y="${top - 7}" text-anchor="middle" fill="#5b6763" font-size="9">${lbl(tv)}</text>`);
    }
    return sx;
  };

  for (const c of cols) {
    if (c.key === 'axis') {
      out.push(`<text transform="translate(${c.x + 10},${top + H / 2}) rotate(-90)" text-anchor="middle" fill="#1c2422" font-weight="600">${escXml(o.axisLabel)}</text>`);
      for (const v of yTicks) {
        const yy = y(v);
        out.push(`<line x1="${c.x + c.w - 6}" y1="${yy}" x2="${c.x + c.w}" y2="${yy}" stroke="#1c2422" stroke-width="0.8"/>`);
        out.push(`<text x="${c.x + c.w - 9}" y="${yy + 3}" text-anchor="end" fill="#1c2422">${lbl(v)}</text>`);
      }
      out.push(`<line x1="${c.x + c.w}" y1="${top}" x2="${c.x + c.w}" y2="${top + H}" stroke="#1c2422" stroke-width="0.8"/>`);
      continue;
    }
    title(c);
    out.push('<g clip-path="url(#plot)">');
    if (c.key === 'image') {
      out.push(`<image x="${c.x}" y="${top}" width="${c.w}" height="${H}" preserveAspectRatio="none" href="${o.image.href}" xlink:href="${o.image.href}"/>`);
      for (const m of o.marks || []) if (m.a >= from && m.a <= to) out.push(markTri(c.x + Math.min(1, Math.max(0, m.xf)) * c.w, y(m.a), m.color));
    } else if (c.key === 'total') {
      const sx = xScale(c, 0, 100, false, [0, 25, 50, 75, 100]);
      let d = '', prev = null;
      for (const r of rows) {
        if (r.pct == null) { prev = null; continue; }
        out.push(`<rect x="${c.x}" y="${y(r.a0)}" width="${f2(sx(r.pct) - c.x)}" height="${f2(Math.max(0.3, y(r.a1) - y(r.a0)))}" fill="#e7c9a5"/>`);
        d += prev && Math.abs(r.a0 - prev.a1) < 1e-9 ? `L${sx(r.pct)} ${y(r.a0)}` : `M${sx(r.pct)} ${y(r.a0)}`;
        d += `L${sx(r.pct)} ${y(r.a1)}`;
        prev = r;
      }
      if (d) out.push(`<path d="${d}" fill="none" stroke="#a85f1c" stroke-width="1.2"/>`);
    } else if (c.key === 'species') {
      const max = Math.max(1, ...rows.map((r) => presentClasses.reduce((s, k) => s + (r.classPct[k.index] || 0), 0)));
      const [, hi] = niceRange(0, max);
      const sx = xScale(c, 0, hi);
      for (const r of rows) {
        let acc = 0;
        for (const k of presentClasses) {
          const v = r.classPct[k.index] || 0; if (!v) continue;
          out.push(`<rect x="${f2(sx(acc))}" y="${y(r.a0)}" width="${f2(sx(acc + v) - sx(acc))}" height="${f2(Math.max(0.3, y(r.a1) - y(r.a0)))}" fill="${k.color}"/>`);
          acc += v;
        }
      }
    } else if (c.key === 'BI' || c.key === 'ii') {
      const lo = c.key === 'BI' ? 0 : 1;
      const sx = xScale(c, 0, 6, false, c.key === 'BI' ? [0, 3, 6] : [1, 3, 6]);
      for (const r of rows) {
        const v = r[c.key];
        if (v != null && v >= lo) out.push(`<rect x="${c.x}" y="${y(r.a0)}" width="${f2(sx(v) - c.x)}" height="${f2(Math.max(0.3, y(r.a1) - y(r.a0)))}" fill="#c98a4b"/>`);
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
      for (const m of o.marks) if (m.a >= from && m.a <= to) out.push(markTri(c.x + c.w / 2, y(m.a), m.color));
    } else if (c.key === 'rec') {
      const pts = c.rec.pts.filter((p) => p[0] != null && p[1] != null && p[0] >= from - span * 0.02 && p[0] <= to + span * 0.02);
      if (pts.length) {
        const [lo, hi] = niceRange(Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1])));
        const sx = xScale(c, lo, hi, c.rec.reverse);
        for (const g of o.shade || []) if (g.a1 > from && g.a0 < to) out.push(`<rect x="${c.x}" y="${y(Math.max(g.a0, from))}" width="${c.w}" height="${f2(Math.max(0.4, y(Math.min(g.a1, to)) - y(Math.max(g.a0, from))))}" fill="${g.color}" fill-opacity="0.22"/>`);
        out.push(`<polyline fill="none" stroke="${c.rec.color}" stroke-width="1.1" points="${pts.map((p) => `${sx(p[1])},${y(p[0])}`).join(' ')}"/>`);
      }
    }
    out.push('</g>');
    frame(c);
  }
  for (const b of o.boundaries || []) {
    if (b.a <= from || b.a >= to) continue;
    out.push(`<line x1="${cols[0].x + cols[0].w}" y1="${y(b.a)}" x2="${W - 14}" y2="${y(b.a)}" stroke="#5b6763" stroke-width="0.6" stroke-dasharray="3 3"/>`);
    if (b.label) out.push(`<text x="${W - 16}" y="${y(b.a) - 2}" text-anchor="end" fill="#5b6763" font-size="8">${escXml(b.label)}</text>`);
  }
  legendItems.forEach((k, i) => {
    const lx = 8 + (i % perRow) * 170, ly = top + H + 22 + Math.floor(i / perRow) * 16;
    out.push(`<rect x="${lx}" y="${ly}" width="10" height="10" fill="${k.color}"/><text x="${lx + 14}" y="${ly + 9}" fill="#1c2422">${escXml(k.name)}</text>`);
  });
  out.push('</svg>');
  return { svg: out.join(''), width: W, height: Htot, plotTop: top, plotHeight: H,
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
  const H = o.height, from = o.from, to = o.to, span = to - from || 1, colW = 30, x0 = 72;
  const longest = Math.max(8, ...o.classes.map((c) => String(c.name).length)), top = 46 + Math.min(150, longest * 5.2 * 0.87);   // room for names at 60°
  const y = (v) => f2(top + ((v - from) / span) * H);
  const rows = (o.rows || []).filter((r) => r.a1 > from && r.a0 < to);
  const cols = o.classes.filter((c) => rows.some((r) => (r.classPct?.[c.index] || 0) > 0) || (o.presence || []).some((p) => p.index === c.index));
  const totW = o.total ? 90 : 0, W = x0 + totW + (o.total ? 14 : 0) + cols.length * colW + 20 + Math.min(110, longest * 5.2 * 0.5), Htot = top + H + 26;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Htot}" viewBox="0 0 ${W} ${Htot}" font-family="IBM Plex Sans, Arial, Helvetica, sans-serif" font-size="10">`,
    `<rect width="${W}" height="${Htot}" fill="#ffffff"/>`, `<text x="8" y="16" font-size="13" font-weight="600" fill="#1c2422">${escXml(o.title || '')}</text>`];
  if (o.subtitle) out.push(`<text x="8" y="31" fill="#5b6763">${escXml(o.subtitle)}</text>`);
  for (const v of niceTicks(from, to, Math.max(3, Math.round(H / 70)))) {
    out.push(`<line x1="${x0 - 6}" y1="${y(v)}" x2="${x0}" y2="${y(v)}" stroke="#1c2422" stroke-width="0.8"/><text x="${x0 - 9}" y="${y(v) + 3}" text-anchor="end" fill="#1c2422">${lbl(v)}</text>`);
    out.push(`<line x1="${x0}" y1="${y(v)}" x2="${W - 14}" y2="${y(v)}" stroke="#eef1f0" stroke-width="0.6"/>`);
  }
  out.push(`<line x1="${x0}" y1="${top}" x2="${x0}" y2="${top + H}" stroke="#1c2422" stroke-width="0.8"/>`);
  out.push(`<text transform="translate(16,${top + H / 2}) rotate(-90)" text-anchor="middle" font-weight="600" fill="#1c2422">${escXml(o.axisLabel || '')}</text>`);
  let x = x0 + 10;
  if (o.total) {
    out.push(`<text x="${x + totW / 2}" y="${top - 8}" text-anchor="middle" font-weight="600" fill="#1c2422">${escXml(o.totalLabel || 'Bioturbation (%)')}</text>`);
    for (const r of rows) if (r.pct != null) out.push(`<rect x="${x}" y="${y(r.a0)}" width="${f2((r.pct / 100) * totW)}" height="${f2(Math.max(0.4, y(r.a1) - y(r.a0)))}" fill="#e7c9a5"/>`);
    out.push(`<rect x="${x}" y="${top}" width="${totW}" height="${H}" fill="none" stroke="#9aa5a1" stroke-width="0.8"/>`);
    x += totW + 14;
  }
  for (const c of cols) {
    const cx = x + colW / 2, max = Math.max(1e-9, ...rows.map((r) => r.classPct?.[c.index] || 0));
    out.push(`<text transform="translate(${cx + 3},${top - 6}) rotate(-60)" font-style="${c.plain ? 'normal' : 'italic'}" font-weight="600" fill="#1c2422">${escXml(c.name)}</text>`);
    out.push(`<line x1="${cx}" y1="${top}" x2="${cx}" y2="${top + H}" stroke="#d5dbd9" stroke-width="0.6"/>`);
    for (const r of rows) {
      const v = r.classPct?.[c.index] || 0; if (!v) continue;
      const w = Math.max(2, (v / max) * (colW - 6));
      out.push(`<rect x="${f2(cx - w / 2)}" y="${y(r.a0)}" width="${f2(w)}" height="${f2(Math.max(0.4, y(r.a1) - y(r.a0)))}" fill="${c.color}"/>`);
    }
    for (const p of (o.presence || []).filter((q) => q.index === c.index)) out.push(markTri(cx, y((p.a0 + p.a1) / 2) + 4, c.color));
    x += colW;
  }
  out.push('</svg>');
  return { svg: out.join(''), width: W, height: Htot };
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
