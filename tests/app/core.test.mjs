import test from 'node:test';
import assert from 'node:assert/strict';
import { BI, II, classify, rowCounts, binRows, parseAgeModel, parseAgeModelDetailed, interpAge, rleEncode, rleDecode, toCSV } from '../../app/js/core.js';

test('age models: conflicting depths rejected with a reason, bad ranges dropped, empty ages skipped', () => {
  assert.deepEqual(parseAgeModel('depth;age\n0;0\n10;\n20;200').age, [0, 200]);
  assert.deepEqual(parseAgeModel('depth,age,min,max\n0,0,0,1\n10,,0,1\n20,20,19,21').depth, [0, 20]);
  assert.equal(parseAgeModel('depth;age\n0;0\n0;100\n10;200'), null);
  assert.deepEqual(parseAgeModelDetailed('depth;age\n0;0\n0;100\n10;200').issue, { kind: 'dupDepth', depth: 0 });
  assert.deepEqual(parseAgeModel('depth;age\n0;0\n0;0\n10;200').depth, [0, 10]);   // repeated identical row merged
  const bad = parseAgeModel('depth;age;min;max\n0;50;60;100\n10;150;140;200');   // age outside its range in one row
  assert.deepEqual(bad.age, [50, 150]); assert.equal(bad.min, undefined); assert.equal(bad.rangeIgnored, 1);
  const gap = parseAgeModel('depth,age,min,max\n0,0,0,1\n10,10,,\n20,20,19,21');   // blank range cells
  assert.equal(gap.depth.length, 3); assert.equal(gap.min, undefined); assert.equal(gap.rangeIgnored, 1);
});
import { components, detectMask, polygonPixels, regionGrow, objectStats, features, rotate90, applyFilters, DEFAULT_FILTERS } from '../../app/js/imageproc.js';
import { Classifier } from '../../app/js/learn.js';

test('index tiers match the Python package', () => {
  const p = [0, 0.5, 3, 20, 50, 80, 95, 100];
  assert.deepEqual(p.map((v) => classify(BI, v)), [0, 0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(p.map((v) => classify(II, v)), [1, 1, 2, 3, 4, 5, 5, 6]);
});

test('row counts and bins (same case as tests/test_core.py)', () => {
  const w = 10, h = 10, labels = new Int32Array(w * h);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) labels[y * w + x] = 1;
  const counts = rowCounts({ labels, width: w, roi: { x0: 0, x1: 10, y0: 0, y1: 10 }, exclude: null, effClass: Int16Array.from([-1, 0]), nClasses: 1 });
  const bins = binRows(counts, { top: 0, bottom: 10, binPx: 5 });
  assert.deepEqual(bins.map((b) => b.pct), [40, 0]);
  assert.deepEqual(bins.map((b) => b.depth), [2.5, 7.5]);
  assert.deepEqual(bins.map((b) => b.BI), [3, 0]);
  assert.equal(binRows(counts, { top: 0, bottom: 10, binPx: 3 }).length, 4); // partial bin kept
});

test('excluded pixels leave the denominator', () => {
  const w = 4, labels = Int32Array.from([1, 0, 0, 0]), exclude = Uint8Array.from([0, 1, 1, 0]);
  const c = rowCounts({ labels, width: w, roi: { x0: 0, x1: 4, y0: 0, y1: 1 }, exclude, effClass: Int16Array.from([-1, 0]), nClasses: 1 });
  assert.equal(binRows(c, { top: 0, bottom: 1, binPx: 1 })[0].pct, 50);
});

test('age model', () => {
  const m = parseAgeModel('depth,age\n0,0\n10,100\n');
  assert.equal(interpAge(m, 5), 50);
  assert.equal(interpAge(m, 20), null);
});

test('rle and csv', () => {
  const a = Int32Array.from([0, 0, 3, 3, 3, 0]);
  assert.deepEqual(Array.from(rleDecode(rleEncode(a), 6)), Array.from(a));
  assert.equal(toCSV([['a', 'b,c'], [1.5, null]]), 'a,"b,c"\n1.5,\n');
});

test('detection, components and shape features', () => {
  const w = 40, h = 40, rgba = new Uint8ClampedArray(w * h * 4).fill(200);
  for (let y = 10; y < 30; y++) for (let x = 18; x < 22; x++) { const j = (y * w + x) * 4; rgba[j] = rgba[j + 1] = rgba[j + 2] = 20; }
  const roi = { x0: 0, y0: 0, x1: w, y1: h };
  const m = detectMask(rgba, w, h, roi, null, { method: 'adaptive', polarity: 'dark', offset: 20, radius: 10, minArea: 5, smooth: 1 });
  const { labels, count } = components(m, w, h, 5);
  assert.equal(count, 1);
  const f = features(objectStats(labels, w, h, rgba).get(1), 10);
  assert.ok(f.vert > 0.9, 'vertical burrow');
  assert.ok(f.elong > 3);
  assert.ok(f.contrast < -100);
});

test('wand, polygon, rotation, filters', () => {
  const w = 5, h = 5, rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  const roi = { x0: 0, y0: 0, x1: w, y1: h };
  assert.equal(regionGrow(rgba, w, h, 12, 10, roi, null).length, 25);
  assert.equal(polygonPixels([[0, 0], [5, 0], [5, 5], [0, 5]], w, roi).length, 25);
  const r = rotate90(Uint8Array.from([1, 2, 3, 4, 5, 6]), 3, 2, 1, 1); // 3x2 -> 2x3
  assert.deepEqual(Array.from(r), [4, 1, 5, 2, 6, 3]);
  assert.equal(applyFilters(rgba, w, h, { ...DEFAULT_FILTERS, invert: true })[0], 0);
});

test('classifier learns, estimates accuracy and flags novelties', () => {
  const ex = [];
  for (let i = 0; i < 6; i++) ex.push({ y: 'A', x: [0 + i * 0.01, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0] });
  for (let i = 0; i < 6; i++) ex.push({ y: 'B', x: [1 + i * 0.01, 1, 1, 5, 1, 1, 1, 1, 1, 1, 1, 1] });
  const c = new Classifier().fit(ex);
  assert.equal(c.accuracy, 1);
  assert.equal(c.predict([0.02, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]).y, 'A');
  assert.equal(c.predict([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50]).y, null);
});

test('V33: fractional rows per bin (interval in cm) keep boundaries without drift', () => {
  const n = 100, counts = { nRows: n, valid: new Float64Array(n).fill(10), bio: new Float64Array(n).fill(5), cls: new Float64Array(0), nClasses: 0 };
  const b = binRows(counts, { top: 0, bottom: 10, binPx: 12.5 });
  assert.deepEqual(b.map((x) => [x.r0, x.r1]), [[0, 13], [13, 25], [25, 38], [38, 50], [50, 63], [63, 75], [75, 88], [88, 100]]);
  assert.equal(b[3].dBottom, 5);
  const i = binRows(counts, { top: 0, bottom: 10, binPx: 30 });   // integer: classic bins, partial kept
  assert.deepEqual(i.map((x) => [x.r0, x.r1]), [[0, 30], [30, 60], [60, 90], [90, 100]]);
});

test('V0.3: intervals with too few valid pixels are no data (null), not 0', () => {
  const n = 20, valid = new Uint32Array(n).fill(10); valid.fill(1, 10);   // second half: 1 valid pixel of 10 per row
  const counts = { nRows: n, valid, bio: new Uint32Array(n), cls: new Uint32Array(0), nClasses: 0, nCols: 10 };
  const b = binRows(counts, { top: 0, bottom: 2, binPx: 10, minValid: 0.2 });
  assert.equal(b[0].pct, 0); assert.equal(b[1].pct, null); assert.equal(b[1].noData, true);
  assert.equal(binRows(counts, { top: 0, bottom: 2, binPx: 10 })[1].pct, 0);   // without threshold: 0 %
});

test('V0.28: age model with range and Bacon table', async () => {
  const { parseAgeModel, interpAgeRange, baconToAgeText } = await import('../../app/js/core.js');
  const m = parseAgeModel('0, 0, 0, 1\n10, 10, 8, 13');
  assert.deepEqual(interpAgeRange(m, 5), { min: 4, max: 7 });
  assert.equal(interpAgeRange(parseAgeModel('0,0\n1,1'), 0.5), null);
  const bac = 'depth\tmin\tmax\tmedian\tmean\n0\t100\t300\t200\t210\n100\t9000\t11000\t10000\t10100\n';
  assert.deepEqual(baconToAgeText(bac, { depthUnit: 'm', ageDiv: 1000 }), ['0, 0.2, 0.1, 0.3', '1, 10, 9, 11']);
  assert.deepEqual(baconToAgeText(bac, { center: 'mean', depthUnit: 'cm', ageDiv: 1 })[1], '100, 10100, 9000, 11000');
  assert.equal(baconToAgeText('a,b\n1,2'), null);
});

test('V0.36: RLE validation', async () => {
  const { rleValid, rleEncode } = await import('../../app/js/core.js');
  assert.ok(rleValid(rleEncode(new Int32Array([0, 0, 3, 3, 3])), 5));
  assert.ok(!rleValid([0, 4], 5)); assert.ok(!rleValid([0, 2, 1], 3)); assert.ok(!rleValid([0, -1, 1, 6], 5)); assert.ok(!rleValid(null, 1));
});

test('V0.37: age model with decimal comma, header columns and Bacon flag', () => {
  const m = parseAgeModel('10,5;3,2\n20,5;6,4');
  assert.deepEqual(m.depth, [10.5, 20.5]); assert.deepEqual(m.age, [3.2, 6.4]);
  const s = parseAgeModel('0 0 0.3 1\n10 10 0.3 2');   // sigma and a code: not an age range
  assert.equal(s.min, undefined);
  const h = parseAgeModel('age;depth;max;min\n1;0;2;0,5\n3;10;4;2');
  assert.deepEqual(h.depth, [0, 10]); assert.deepEqual(h.age, [1, 3]); assert.deepEqual(h.min, [0.5, 2]);
  const b = parseAgeModel('depth min max median mean\n0 100 300 200 200\n100 9000 11000 10000 10100');
  assert.ok(b.bacon); assert.deepEqual(b.age, [200, 10000]); assert.deepEqual(b.max, [300, 11000]);
});
