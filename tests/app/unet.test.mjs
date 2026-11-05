// V0.15: U-Net tiling, blending, resampling and training masks; parity with src/ichantool/unet/tiling.py
// through tests/fixtures/unet_parity.json (written by tests/fixtures/make_unet_parity.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tileStarts, blendWindow, resampleBilinear, predictProb, trainingMask, objectClasses, IGNORE } from '../../app/js/unet.js';
import { detectMask, DEFAULT_DETECT } from '../../app/js/imageproc.js';

const REF = JSON.parse(readFileSync(new URL('../fixtures/unet_parity.json', import.meta.url)));
const { w: W, h: H } = REF, [rx0, ry0, rx1, ry1] = REF.roi, ROI = { x0: rx0, y0: ry0, x1: rx1, y1: ry1 };
function image() {
  const a = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const j = (y * W + x) * 4; a[j] = (x * 37 + y * 11) % 256; a[j + 1] = (x * 5 + y * 29) % 256; a[j + 2] = (x * y) % 256; a[j + 3] = 255; }
  return a;
}
const runner = (C) => async (inp, T) => {
  const n = T * T, out = new Float32Array(C * n);
  for (let i = 0; i < n; i++) { if (C === 1) out[i] = inp[i] - 0.5 * inp[2 * n + i]; else for (let c = 0; c < C; c++) out[c * n + i] = inp[c * n + i]; }
  return { data: out, channels: C };
};
const roiValues = (arr) => { const o = []; for (let y = ROI.y0; y < ROI.y1; y++) for (let x = ROI.x0; x < ROI.x1; x++) o.push(arr[y * W + x]); return o; };

test('tile starts and blending window match Python', () => {
  assert.deepEqual([[10, 16, 4], [16, 16, 4], [17, 16, 4], [100, 32, 8], [95, 32, 8]].map(([n, t, o]) => tileStarts(n, t, o)), REF.tileStarts);
  [...blendWindow(8, 3)].forEach((v, i) => assert.ok(Math.abs(v - REF.blend[i]) < 1e-6));
});

test('bilinear resampling matches Python exactly (uint8)', () => {
  const rgb = new Uint8ClampedArray(W * H * 3), a = image();
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = a[i * 4 + c];
  assert.deepEqual([...resampleBilinear(rgb, W, H, 3, 31, 23)], REF.resampled);
});

test('probability maps match Python (binary with rescaling; multi-class)', async () => {
  const p1 = await predictProb(runner(1), image(), W, H, ROI, { tile: REF.tile, overlap: REF.overlap }, 1.3);
  roiValues(p1.prob).forEach((v, i) => assert.ok(Math.abs(v - REF.prob1[i]) < 2e-4, `prob1[${i}] ${v} vs ${REF.prob1[i]}`));
  const p3 = await predictProb(runner(3), image(), W, H, ROI, { tile: REF.tile, overlap: REF.overlap }, 1);
  roiValues(p3.prob).forEach((v, i) => assert.ok(Math.abs(v - REF.prob3[i]) < 2e-4));
  assert.deepEqual(roiValues(p3.cls), REF.cls3);
  assert.equal(p1.prob[0], 0);   // outside the ROI
});

test('training mask: classes, matrix, ignored excluded pixels and unreviewed objects', () => {
  const w = 4, labels = new Int32Array([0, 1, 1, 2, 0, 3, 0, 0]), exclude = new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0]);
  const objLabel = new Int16Array([-1, 2, -1, 0]);   // object 1 class 2, object 2 unreviewed, object 3 artefact
  assert.deepEqual([...trainingMask(labels, w, { x0: 0, y0: 0, x1: 4, y1: 2 }, exclude, objLabel)], [0, 2, 2, IGNORE, IGNORE, 0, 0, 0]);
  assert.deepEqual([...trainingMask(labels, w, { x0: 1, y0: 0, x1: 3, y1: 2 }, null, objLabel)], [2, 2, 0, 0]);
});

test('unet detection thresholds the probability map inside the ROI and outside excluded zones', () => {
  const w = 3, h = 2, prob = new Float32Array([0.9, 0.4, 0.6, 0.9, 0.9, 0.2]), ex = new Uint8Array([0, 0, 0, 1, 0, 0]);
  const p = { ...DEFAULT_DETECT, method: 'unet', smooth: 0, pThr: 0.5 };
  assert.deepEqual([...detectMask(null, w, h, { x0: 0, y0: 0, x1: 3, y1: 2 }, ex, p, prob)], [1, 0, 1, 0, 1, 0]);
  assert.deepEqual([...detectMask(null, w, h, { x0: 0, y0: 0, x1: 2, y1: 2 }, ex, p, prob)], [1, 0, 0, 0, 1, 0]);
  assert.deepEqual([...detectMask(null, w, h, { x0: 0, y0: 0, x1: 3, y1: 2 }, ex, p, null)], [0, 0, 0, 0, 0, 0]);
});

test('objectClasses gives the majority U-Net class per object', () => {
  const r = objectClasses(new Int32Array([1, 1, 1, 2, 0]), new Uint8Array([2, 2, 1, 1, 2]), new Set([1, 2]));
  assert.deepEqual(r.get(1), { k: 2, frac: 2 / 3 }); assert.deepEqual(r.get(2), { k: 1, frac: 1 });
});
