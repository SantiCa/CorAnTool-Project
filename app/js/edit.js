// SedCoreTool web — V0.42: pure editing algorithms (no DOM, no global state), taken out of app.js so they can be tested
// with synthetic masks. Labels: Int32Array, > 0 one object id, 0 matrix, < 0 stack −v in `stacks` (core.js).
import { hasId, idsAt } from './core.js';

/**
 * Scissors: pieces of object `id` inside its bbox [x0, y0, x1, y1] once the pixels in `cut` (Set of indices) are
 * removed. Pieces are 4-connected; cut pixels then join a neighbouring piece. Returns {comp, bw, n, main} with comp[j]
 * = piece (1…n) of bbox pixel j (0 = not the object) and main = the largest piece (it keeps the id).
 */
export function splitPieces(L, w, stacks, bbox, id, cut) {
  const [x0, y0, x1, y1] = bbox, bw = x1 - x0 + 1, bh = y1 - y0 + 1, comp = new Int32Array(bw * bh);   // −1 cut, 0 outside, k ≥ 1 piece
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * w + x; if (hasId(L[i], id, stacks)) comp[(y - y0) * bw + x - x0] = cut.has(i) ? -1 : -2; }
  let n = 0; const size = [0];
  for (let j = 0; j < comp.length; j++) {
    if (comp[j] !== -2) continue;
    n++; size.push(0); const q = [j]; comp[j] = n;
    while (q.length) {
      const c = q.pop(), x = c % bw; size[n]++;
      for (const d of [x > 0 ? c - 1 : -1, x < bw - 1 ? c + 1 : -1, c - bw, c + bw]) if (d >= 0 && d < comp.length && comp[d] === -2) { comp[d] = n; q.push(d); }
    }
  }
  for (let changed = true; changed && n;) {   // cut pixels go to the neighbouring piece
    changed = false;
    for (let j = 0; j < comp.length; j++) {
      if (comp[j] !== -1) continue; const x = j % bw;
      for (const d of [x > 0 ? j - 1 : -1, x < bw - 1 ? j + 1 : -1, j - bw, j + bw]) if (d >= 0 && d < comp.length && comp[d] > 0) { comp[j] = comp[d]; changed = true; break; }
    }
  }
  return { comp, bw, n, size, main: n ? size.indexOf(Math.max(...size.slice(1))) : 0 };
}

/** Which object keeps its id and class when merging: the largest with a class given by hand, else the largest. */
export const mergeKeeper = (objs) => [...objs].sort((a, b) => (!!b.cls - !!a.cls) || b.area - a.area)[0];

/**
 * V0.30: groups of overlapping traces of the same ichnotaxon to be merged. objects: Map id → {bbox, cls}; ids: the
 * traces whose class changed. Returns arrays [id, …partners].
 */
export function sameTaxonGroups(L, w, stacks, objects, ids) {
  const groups = [], cls = (id) => objects.get(id)?.cls ?? null;
  for (const id of ids) {
    const o = objects.get(id); if (!o?.bbox) continue;
    const c = cls(id), partners = new Set(), [x0, y0, x1, y1] = o.bbox;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const v = L[y * w + x]; if (v >= 0) continue;
      const st = stacks[-v]; if (!st.includes(id)) continue;
      for (const q of st) if (q !== id && cls(q) === c) partners.add(q);
    }
    if (partners.size) groups.push([id, ...partners]);
  }
  return groups;
}

/** Undo the pixel changes of one step: lm/ex = [index, previous value, …] in the order they were made. */
export function undoPixels(labels, exclude, lm, ex) {
  for (let k = lm.length - 2; k >= 0; k -= 2) labels[lm[k]] = lm[k + 1];
  for (let k = ex.length - 2; k >= 0; k -= 2) exclude[ex[k]] = ex[k + 1];
}

/** Ids present in a label array (for checks): every object id seen in any pixel, overlaps included. */
export function idsInLabels(L, stacks) { const out = new Set(); for (const v of L) if (v) for (const id of idsAt(v, stacks)) out.add(id); return out; }

/** v1/v2 project files → v3 structure: the images become one core; the geochemistry cores become further cores. */
export function upgradeProject(p) {
  if (p.version >= 3) return p;
  const geo = p.geo || {}, old = geo.cores || [], main = old.find((c) => c.id === 'main');
  const cores = [];
  if ((p.sections || []).length || (p.records || []).length || !old.length) {
    cores.push({ id: 'main', name: main?.name?.split(' · ')[0] || p.name || 'Sondeo', lat: main?.lat ?? null, lon: main?.lon ?? null, units: p.sections?.[0]?.units || 'm',
      imp: null, records: p.records || [], logView: p.logView, age: p.age || { text: '', units: 'ka' }, sections: p.sections || [] });
  }
  for (const c of old) if (c.id !== 'main') cores.push({ id: c.id, name: c.name, lat: c.lat, lon: c.lon, waterDepth: c.waterDepth, units: c.units || 'm', source: c.source,
    imp: { depth: c.depth, age: c.age, proxies: c.proxies }, records: [], age: { text: c.ageText || '', units: 'ka' }, sections: [] });
  const { cores: _o, ...g } = geo;
  return { ...p, version: 3, geo: g, cores, curCore: cores[0]?.id };
}
