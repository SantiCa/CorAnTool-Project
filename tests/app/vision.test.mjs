// V0.17: vision-model descriptors for ichnotaxa (window, input, embedding) and classifier with any vector length.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VISION_MODEL, visionFeatureId, traceWindow, traceInput, pickEmbedding } from '../../app/js/vision.js';
import { Classifier, TaxonModel, FEATURES } from '../../app/js/learn.js';

test('square window around the trace with context, centred', () => {
  assert.deepEqual(traceWindow([10, 20, 19, 59], 0.25), { x: -15, y: 10, side: 60 });   // 10 × 40 box → side 40·1.5
  assert.equal(traceWindow([5, 5, 5, 5], 0.25, 16).side, 16);                          // minimum size
});

test('network input: size, channel order and ImageNet normalisation', () => {
  const w = 4, h = 4, rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = 255; rgba[i * 4 + 1] = 0; rgba[i * 4 + 2] = 128; rgba[i * 4 + 3] = 255; }
  const m = { ...VISION_MODEL, size: 8 }, x = traceInput(rgba, w, h, { x: -2, y: -2, side: 8 }, m), n = 64;
  assert.equal(x.length, 3 * n);
  assert.ok(Math.abs(x[0] - (1 - 0.485) / 0.229) < 1e-5);
  assert.ok(Math.abs(x[n] - (0 - 0.456) / 0.224) < 1e-5);
  assert.ok(Math.abs(x[2 * n + 63] - (128 / 255 - 0.406) / 0.225) < 1e-5);   // edge padding outside the image
});

test('embedding: pooler output preferred, else class token; unit length', () => {
  const tokens = { data: new Float32Array([3, 4, 9, 9, 9, 9]), dims: [1, 3, 2] };
  assert.deepEqual(pickEmbedding({ last_hidden_state: tokens }, ['last_hidden_state']), [0.6, 0.8]);
  assert.deepEqual(pickEmbedding({ last_hidden_state: tokens, pooler_output: { data: new Float32Array([0, 2]), dims: [1, 2] } }, ['last_hidden_state', 'pooler_output']), [0, 1]);
});

test('classifier learns from vision vectors and keeps feature sets apart', () => {
  const D = 384, ex = [];
  for (let i = 0; i < 20; i++) { const x = new Array(D).fill(0); x[i % 2 ? 0 : 1] = 1; x[5 + (i % 7)] = 0.1; ex.push({ y: i % 2 ? 'A' : 'B', x }); }
  const m = new TaxonModel({ features: visionFeatureId() }).fit(ex);
  const q = new Array(D).fill(0); q[0] = 1; q[6] = 0.1;
  assert.equal(m.predict(q).y, 'A');
  const j = m.toJSON(); assert.deepEqual(j.features, visionFeatureId());
  assert.equal(Classifier.fromJSON(j).n, 0);                          // shape model expected: not loaded
  assert.equal(Classifier.fromJSON(j, visionFeatureId()).n, 20);
  assert.equal(new Classifier().features, FEATURES);
});
