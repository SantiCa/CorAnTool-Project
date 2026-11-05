import test from 'node:test';
import assert from 'node:assert/strict';
import { clahe, autoLevels, kmeansThreshold, fillHoles, applyFilters, detectMask, DEFAULT_FILTERS, FILTER_PRESETS } from '../../app/js/imageproc.js';

test('CLAHE stays in range and stretches a low-contrast image', () => {
  const w = 64, h = 64, L = new Float32Array(w * h);
  for (let i = 0; i < L.length; i++) L[i] = 100 + (i % 7);
  const out = clahe(L, w, h, 32, 3);
  const mn = Math.min(...out), mx = Math.max(...out);
  assert.ok(mn >= 0 && mx <= 255);
  assert.ok(mx - mn > 6, 'output range wider than input range');
});

test('auto levels picks percentiles inside the ROI', () => {
  const w = 10, h = 10, rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let i = 0; i < w * h; i++) { const v = 50 + i; rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v; }
  const r = autoLevels(rgba, w, h, null, 0, 1);
  assert.deepEqual(r, { blackPoint: 50, whitePoint: 149, median: 99 });
});

test('k-means threshold separates a bimodal image', () => {
  const w = 20, L = new Float32Array(400).map((_, i) => (i < 100 ? 30 : 200));
  const t = kmeansThreshold(L, w, { x0: 0, y0: 0, x1: 20, y1: 20 }, null);
  assert.ok(t > 30 && t < 200);
  assert.equal(Math.round(t), 115);
});

test('fill holes closes a ring', () => {
  const w = 7, h = 7, m = new Uint8Array(w * h);
  for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) m[y * w + x] = (x === 1 || x === 5 || y === 1 || y === 5) ? 1 : 0;
  const f = fillHoles(m, w, h, { x0: 0, y0: 0, x1: w, y1: h });
  assert.equal(f[3 * w + 3], 1);
  assert.equal(f[0], 0);
});

test('vibrance 0 changes nothing; presets are complete', () => {
  const rgba = new Uint8ClampedArray([200, 100, 50, 255]);
  assert.deepEqual(Array.from(applyFilters(rgba, 1, 1, DEFAULT_FILTERS)), [200, 100, 50, 255]);
  for (const [k, p] of Object.entries(FILTER_PRESETS)) for (const key of Object.keys(DEFAULT_FILTERS)) assert.ok(key in p, `${k}.${key}`);
});

test('k-means detection finds a dark burrow', () => {
  const w = 30, h = 30, rgba = new Uint8ClampedArray(w * h * 4).fill(180);
  for (let y = 5; y < 25; y++) for (let x = 12; x < 17; x++) { const j = (y * w + x) * 4; rgba[j] = rgba[j + 1] = rgba[j + 2] = 40; }
  const m = detectMask(rgba, w, h, { x0: 0, y0: 0, x1: w, y1: h }, null, { method: 'kmeans', polarity: 'dark', smooth: 0, fillHoles: true });
  assert.equal(m.reduce((a, b) => a + b, 0), 100);
});

test('automatic gamma maps the median to mid-grey within the published range', async () => {
  const { gammaForMedian } = await import('../../app/js/imageproc.js');
  assert.equal(+gammaForMedian(0.5 * 255, 0, 255).toFixed(3), 1);
  const g = gammaForMedian(106, 65, 114);
  assert.ok(g >= 0.19 && g < 0.5);
  assert.equal(gammaForMedian(250, 0, 255), 0.19);
});

test('separability (Otsu η) ranks a bimodal image above a uniform ramp', async () => {
  const { separability } = await import('../../app/js/imageproc.js');
  const w = 64, h = 64, two = new Uint8ClampedArray(w * h * 4), ramp = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = i % w < 32 ? 40 : 200, r = (i % w) * 4; two.set([v, v, v, 255], i * 4); ramp.set([r, r, r, 255], i * 4); }
  const a = separability(two, w, h), b = separability(ramp, w, h);
  assert.ok(a.eta > 0.99 && a.threshold >= 40 && a.threshold < 200);
  assert.ok(b.eta > 0.7 && b.eta < 0.8);   // uniform distribution: η = 0.75
});

test('V0.28: trace separation and local separability', async () => {
  const { traceSeparation, localSeparability } = await import('../../app/js/imageproc.js');
  const w = 40, h = 40, rgba = new Uint8ClampedArray(w * h * 4), cls = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { const x = i % w, tr = x >= 15 && x < 25; const v = tr ? 60 : 180; rgba.set([v, v, v, 255], i * 4); cls[i] = tr ? 1 : 2; }
  const roi = { x0: 0, y0: 0, x1: w, y1: h };
  assert.equal(traceSeparation(rgba, w, h, roi, cls, { local: false, polarity: 'dark' }).score, 1);
  assert.equal(traceSeparation(rgba, w, h, roi, cls, { local: false, polarity: 'light' }).score, 0);
  assert.ok(localSeparability(rgba, w, h, roi, 20) > 0.9);
});
