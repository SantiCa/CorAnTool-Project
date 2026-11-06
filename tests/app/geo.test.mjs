import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTable } from '../../app/js/log.js';
import { coresFromLongTable, applyCatalogue, buildSamples, labelSamples, ruleMatches, resample, coreConvert,
  fitModel, predictLabel, crossValidate, kmeansFit, mapSummary, idwGrid, buildMapSVG, mapBBox, seededRandom, crossValidateSteps, fitModelSteps, fitBBoxAspect, mapGeometry } from '../../app/js/geo.js';

const tab = parseTable(readFileSync(new URL('../../examples/geochem_demo/demo_long.csv', import.meta.url), 'utf8'));
const H = tab.headers, col = (n) => H.indexOf(n);
const proxies = ['Ti/Al', 'Zr/Rb', 'Ba/Al', 'Mn/Al', 'Ca_pct', 'TOC_pct'];
const cores = coresFromLongTable(tab, { core: col('core'), lat: col('lat'), lon: col('lon'), depth: col('depth_m'), age: col('age_ka'), proxies: proxies.map(col) });
cores.forEach((c, i) => (c.id = c.name));
const truth = new Map(); tab.text.forEach((r) => truth.set(`${r[0]}|${(+r[col('age_ka')]).toFixed(2)}`, r[col('event_true')]));
const cfg = { axis: 'age', step: 0.5, features: proxies, ratios: [], logs: proxies, scaling: 'global' };
const samples = buildSamples(cores, cfg);
const truthOf = (s) => truth.get(`${s.core}|${s.age.toFixed(2)}`);

test('import: 15 cores with coordinates, catalogue matching, depth↔age conversion', () => {
  assert.equal(cores.length, 15);
  assert.ok(cores.every((c) => c.lat != null && c.lon != null && c.depth.length === 301));
  const cat = parseTable('core,lat,lon,water_depth_m\ndemo-01,1,2,300\n');
  const copy = [{ name: 'DEMO-01' }];
  assert.equal(applyCatalogue(copy, cat, { core: 0, lat: 1, lon: 2, wd: 3 }), 1);
  assert.deepEqual([copy[0].lat, copy[0].lon, copy[0].waterDepth], [1, 2, 300]);
  const c = cores[0]; assert.ok(Math.abs(coreConvert(c, coreConvert(c, 50, 'age', 'depth'), 'depth', 'age') - 50) < 1e-6);
});

test('resample and samples', () => {
  assert.deepEqual(resample([0, 2], [0, 4], [0, 1, 2, 3]), [0, 2, 4, null]);
  assert.deepEqual(resample([0, 1, 5], [0, 1, 5], [3], 2), [null]);
  assert.equal(samples.length, 15 * 301);
  assert.ok(samples.every((s) => s.f.length === 6 && s.zc.length === 6));
});

test('rules use per-core z-scores', () => {
  const rule = { label: 'lowO2', conds: [{ feature: 'Ba/Al', op: 'z>', value: 1 }, { feature: 'Mn/Al', op: 'z<', value: -0.5 }] };
  const hits = samples.filter((s) => ruleMatches(rule, s, proxies));
  const precision = hits.filter((s) => truthOf(s) === 'low_oxygenation').length / hits.length;
  assert.ok(hits.length > 100 && precision > 0.8, `rule precision ${precision}`);
});

test('random forest trained on 3 cores classifies the other 12 (synthetic truth)', () => {
  const trainCores = new Set(['DEMO-02', 'DEMO-09', 'DEMO-13']);
  const intervals = [];
  for (const s of samples) if (trainCores.has(s.core)) intervals.push({ core: s.core, axis: 'age', from: s.x - 0.25, to: s.x + 0.25, label: truthOf(s) });
  const lab = labelSamples(samples, { intervals, rules: [], features: proxies, axis: 'age', cores });
  const tr = samples.map((s, i) => i).filter((i) => lab[i].label);
  for (const method of ['rf', 'knn', 'nb']) {
    const m = fitModel(method, tr.map((i) => samples[i].f), tr.map((i) => lab[i].label), method === 'rf' ? { trees: 40 } : {}, 7);
    const test = samples.filter((s) => !trainCores.has(s.core));
    const acc = test.filter((s) => predictLabel(m, s.f).label === truthOf(s)).length / test.length;
    assert.ok(acc > 0.8, `${method} accuracy ${acc.toFixed(3)}`);
  }
  const cv = crossValidate(samples, lab.map((l) => l.label), 'nb', {}, 1);
  assert.equal(cv.scheme, 'leave-one-core-out'); assert.equal(cv.folds, 3); assert.ok(cv.accuracy > 0.7);
});

test('k-means and seeded reproducibility', () => {
  const X = samples.slice(0, 600).map((s) => s.f);
  const a = kmeansFit(X, { k: 3, restarts: 2, maxIter: 50 }, 5), b = kmeansFit(X, { k: 3, restarts: 2, maxIter: 50 }, 5);
  assert.deepEqual(a.centers, b.centers);
  const r1 = seededRandom(3), r2 = seededRandom(3); assert.equal(r1(), r2());
});

test('map summary, IDW and SVG', () => {
  const preds = samples.map((s) => ({ label: truthOf(s) }));
  const pts = mapSummary(samples, preds, cores, { a0: 6, a1: 10, mode: 'class' });
  const east = pts.find((p) => p.name === 'DEMO-15'), west = pts.find((p) => p.name === 'DEMO-01');
  assert.equal(east.dominant, 'low_oxygenation'); assert.equal(west.dominant, 'background');
  const vals = mapSummary(samples, preds, cores, { a0: 6, a1: 10, mode: 'value', feature: 2 });
  const grid = idwGrid(vals, mapBBox(vals), 20, 10, 2);
  assert.equal(grid.length, 200); assert.ok(grid.every((v) => v != null));
  const svg = buildMapSVG({ land: [[0, 35, 10, 35, 10, 40, 0, 40]], bbox: mapBBox(vals), points: pts, mode: 'class', colors: { low_oxygenation: '#000' }, title: 'T' });
  assert.ok(svg.startsWith('<svg') && svg.includes('DEMO-15'));
});

test('labels: interval beats rule, intervals convert between axes; ratios and per-core scaling', async () => {
  const { featureSeries } = await import('../../app/js/geo.js');
  const c = { id: 'X', name: 'X', depth: [0, 1, 2, 3, 4], age: [0, 10, 20, 30, 40], proxies: { A: [1, 2, 3, 4, 50], B: [1, 1, 1, 2, 0] } };
  assert.deepEqual(featureSeries(c, 'A/B', [{ a: 'A', b: 'B' }]), [1, 2, 3, 2, null]);
  const smp = buildSamples([c], { axis: 'age', step: 10, features: ['A'], ratios: [], logs: [], scaling: 'core' });
  assert.deepEqual(smp.map((s) => s.f[0]), smp.map((s) => s.zc[0]));
  const rule = { label: 'R', conds: [{ feature: 'A', op: '>', value: 0 }] };
  const iv = [{ core: 'X', axis: 'depth', from: 1, to: 2, label: 'I' }];   // depth 1–2 = age 10–20
  const lab = labelSamples(smp, { intervals: iv, rules: [rule], features: ['A'], axis: 'age', cores: [c] });
  assert.deepEqual(lab.map((l) => l.label), ['R', 'I', 'R', 'R', 'R']);
  assert.equal(lab[1].source, 'interval');
  const noRules = labelSamples(smp, { intervals: iv, rules: [rule], useRules: false, features: ['A'], axis: 'age', cores: [c] });
  assert.deepEqual(noRules.map((l) => l.label), [null, 'I', null, null, null]);
});

test('interval layers: import, 0/1 features, target layer, nesting check', async () => {
  const { intervalsFromTable, layerFeatureNames, orphanIntervals } = await import('../../app/js/geo.js');
  const t1 = parseTable('core,top,bottom,Lithology,Turbidite\nX,0,2,clay,\nX,2,4,marl,yes\nX,4,5,marl,\n');
  const recs = intervalsFromTable(t1, { core: 0, from: 1, to: 2, layer: -1, values: [3, 4] });
  assert.equal(recs.length, 4); assert.deepEqual(recs[2], { core: 'X', layer: 'Turbidite', value: 'yes', from: 2, to: 4 });
  const t2 = parseTable('top;bottom;layer;value\n1;3;Metals;front\n');
  assert.deepEqual(intervalsFromTable(t2, { core: -1, from: 0, to: 1, layer: 2, values: [3] }, 'Y'), [{ core: 'Y', layer: 'Metals', value: 'front', from: 1, to: 3 }]);
  const c = { id: 'X', name: 'X', depth: [0, 1, 2, 3, 4, 5], age: [0, 10, 20, 30, 40, 50], proxies: { A: [1, 2, 3, 4, 5, 6] } };
  const layers = [{ id: 'lit', name: 'Lith', parent: null, cats: [{ id: 'clay', name: 'clay' }, { id: 'marl', name: 'marl' }] }, { id: 'tb', name: 'Turb', parent: 'lit', cats: [{ id: 'y', name: 'yes' }] }];
  const iv = [{ id: 1, core: 'X', layer: 'lit', axis: 'depth', from: 0, to: 2, cat: 'clay' }, { id: 2, core: 'X', layer: 'lit', axis: 'depth', from: 2, to: 5, cat: 'marl' },
    { id: 3, core: 'X', layer: 'tb', axis: 'age', from: 25, to: 35, cat: 'y' }, { id: 4, core: 'X', layer: 'tb', axis: 'depth', from: 1.5, to: 2.5, cat: 'y' }];
  assert.deepEqual(layerFeatureNames(layers), ['Lith: clay', 'Lith: marl', 'Turb: yes']);
  const smp = buildSamples([c], { axis: 'depth', step: 1, features: ['A'], ratios: [], logs: [], scaling: 'global', layers, intervals: iv });
  assert.deepEqual(smp.map((s) => s.f.slice(1)), [[1, 0, 0], [1, 0, 0], [0, 1, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]);
  const lab = labelSamples(smp, { intervals: iv, rules: [{ layer: 'other', cat: 'z', conds: [{ feature: 'A', op: '>', value: 0 }] }], features: ['A'], axis: 'depth', cores: [c], layer: 'tb' });
  assert.deepEqual(lab.map((l) => l.label), [null, null, 'y', 'y', null, null]);
  assert.deepEqual(orphanIntervals(iv, layers, [c]), [4]);
  const { intervalsOnAxis } = await import('../../app/js/geo.js');
  assert.deepEqual(intervalsOnAxis([{ core: 'X', axis: 'depth', from: -1, to: 2 }], 'age', c).map((q) => [q.from, q.to]), [[0, 20]]);   // clamped end
  assert.equal(intervalsOnAxis([{ core: 'X', axis: 'depth', from: 7, to: 9 }], 'age', c).length, 0);                                  // fully outside
});

test('V15 map style: symbols, labels, background image, zoom', async () => {
  const { symbolSVG, MAP_SYMBOLS, zoomBBox, mapGeometry } = await import('../../app/js/geo.js');
  for (const k of MAP_SYMBOLS) assert.match(symbolSVG(k, 10, 10, 5, 'fill="red"'), /fill="red"/);
  const pts = [{ name: 'A', lat: 37, lon: -10, n: 3, value: 1 }, { name: 'B', lat: 36, lon: -9, n: 0 }];
  const bbox = [-12, 34, -6, 39];
  const svg = buildMapSVG({ land: [[-8, 36, -6, 36, -6, 38, -8, 38]], bbox, points: pts, mode: 'value',
    style: { symbol: 'star', size: 2, labels: false, sea: '#123456', scaleBar: true }, bg: { href: 'data:image/jpeg;base64,AAAA', href2: 'data:image/jpeg;base64,BBBB', attribution: 'Fuente X' } });
  assert.match(svg, /<polygon/); assert.ok(!/>A /.test(svg) && !/>A</.test(svg));
  assert.match(svg, /fill="#123456"/); assert.match(svg, /href="data:image\/jpeg;base64,AAAA"/);
  assert.match(svg, /clip-path="url\(#landclip\)"/); assert.match(svg, /Fuente X/); assert.match(svg, / km</);
  const z = zoomBBox(bbox, 2, -9, 36.5); assert.deepEqual(z, [-10.5, 35.25, -7.5, 37.75]);
  const zo = zoomBBox([-170, -80, 170, 80], 0.5); assert.deepEqual([zo[0], zo[2], zo[1], zo[3]], [-180, 180, -85, 85]);
  assert.equal(mapGeometry(bbox).W, 900);
});

test('V22: map values use only real samples; rule labels are not scored', async () => {
  const { mapSummary, crossValidate, autoGap } = await import('../../app/js/geo.js');
  const samples = [{ core: 'a', age: 1, t: [null], zc: [0] }, { core: 'b', age: 1, t: [2], zc: [1.5] }];
  const pts = mapSummary(samples, [], [{ id: 'a', name: 'a', lat: 0, lon: 0 }, { id: 'b', name: 'b', lat: 1, lon: 1 }], { a0: 0, a1: 2, mode: 'value', feature: 0 });
  assert.equal(pts[0].n, 0); assert.equal(pts[0].value, undefined); assert.equal(pts[1].value, 1.5);
  const S = [], L = [];
  for (const c of ['x', 'y']) for (let i = 0; i < 20; i++) { S.push({ core: c, x: i, f: [i < 10 ? 0 : 5] }); L.push(i < 10 ? 'lo' : 'hi'); }
  const cv = crossValidate(S, L, 'knn', { k: 3 }, 42, { scored: (i) => i % 2 === 0, minProb: 0.5 });
  assert.equal(cv.nScored, 20); assert.ok(cv.coverage.share > 0);
  assert.equal(autoGap([0, 1, 2, 10], [1, 1, 1, 1]), 3);
});

test('fitBBoxAspect widens the extent to the requested plot-area ratio and never narrows it (V23)', () => {
  const b = [-6, 35, 20, 42];
  for (const kind of ['plate', 'mercator', 'laea']) {
    for (const r of kind === 'laea' ? [0.8] : [0.8, 0.15]) {
      const f = fitBBoxAspect(b, r, kind), g = mapGeometry(f, kind);
      assert.ok(Math.abs(g.H / g.W / r - 1) < 0.05, `${kind} ${r}: ${g.H / g.W}`);
      assert.ok(f[0] <= b[0] && f[1] <= b[1] && f[2] >= b[2] && f[3] >= b[3]);
    }
  }
  const w = mapGeometry(fitBBoxAspect(b, 0.15, 'laea'), 'laea'), w0 = mapGeometry(b, 'laea');
  assert.ok(w.H / w.W <= w0.H / w0.W);   // Lambert: gets as close as the curvature allows, never worse
  assert.deepEqual(fitBBoxAspect(b, 0), b);
});

test('neural network (MLP) learns a non-linear boundary, is deterministic and validates like the other models (V26)', () => {
  const r = seededRandom(3), X = [], y = [];
  for (let i = 0; i < 240; i++) { const a = r() * 4 - 2, b = r() * 4 - 2; X.push([a, b]); y.push(a * a + b * b < 1.5 ? 'in' : 'out'); }
  const m = fitModel('mlp', X, y, { epochs: 150 }, 5), m2 = fitModel('mlp', X, y, { epochs: 150 }, 5);
  assert.deepEqual(m.W, m2.W);
  const acc = X.filter((x, i) => predictLabel(m, x).label === y[i]).length / X.length;
  assert.ok(acc > 0.9, `accuracy ${acc}`);
  const S = X.map((x, i) => ({ core: i < 120 ? 'a' : 'b', x: i, f: x }));
  const cv = crossValidate(S, y, 'mlp', { epochs: 80 }, 5);
  assert.equal(cv.scheme, 'leave-one-core-out'); assert.ok(cv.balancedAccuracy > 0.8, `cv ${cv.balancedAccuracy}`);
});

test('training steps: validation yields once per fold, the neural network once per epoch, same result as the plain call (V27)', () => {
  const r = seededRandom(9), X = [], y = [];
  for (let i = 0; i < 90; i++) { const a = r(); X.push([a, r()]); y.push(a > 0.5 ? 'p' : 'q'); }
  const S = X.map((x, i) => ({ core: ['a', 'b', 'c'][i % 3], x: i, f: x }));
  const it = crossValidateSteps(S, y, 'knn', {}, 1); let n = 0, res;
  for (let s = it.next(); ; s = it.next()) { if (s.done) { res = s.value; break; } n++; }
  assert.equal(n, 3); assert.equal(res.balancedAccuracy, crossValidate(S, y, 'knn', {}, 1).balancedAccuracy);
  const g = fitModelSteps('mlp', X, y, { epochs: 12, patience: 100 }, 2); let e = 0, m;
  for (let s = g.next(); ; s = g.next()) { if (s.done) { m = s.value; break; } e++; }
  assert.equal(e, 12); assert.deepEqual(m.W, fitModel('mlp', X, y, { epochs: 12, patience: 100 }, 2).W);
});

test('V0.34: intervals of a family do not overlap and equal neighbours merge', async () => {
  const { tidyIntervals } = await import('../../app/js/geo.js');
  const base = { core: 'c', layer: 'L', axis: 'depth' };
  let n = 0; const newId = () => 'n' + (++n);
  // new interval B (priority) inside A splits A; same-class neighbour C touching A's right part merges with it
  const r = tidyIntervals([{ ...base, id: 'A', from: 0, to: 10, cat: 'x' }, { ...base, id: 'B', from: 4, to: 6, cat: 'y' }, { ...base, id: 'C', from: 10, to: 12, cat: 'x' }], { priority: 'B', newId });
  assert.deepEqual(r.list.map((q) => [q.from, q.to, q.cat]), [[0, 4, 'x'], [4, 6, 'y'], [6, 12, 'x']]);
  assert.ok(r.changed);
  // other families and cores are independent
  const r2 = tidyIntervals([{ ...base, id: 'A', from: 0, to: 10, cat: 'x' }, { ...base, layer: 'M', id: 'D', from: 2, to: 5, cat: 'x' }]);
  assert.equal(r2.list.length, 2); assert.ok(!r2.changed);
});
