import test from 'node:test';
import assert from 'node:assert/strict';
import { Classifier, FEATURES } from '../../app/js/learn.js';

const mk = (y, base, i) => ({ y, x: FEATURES.map((_, j) => base + ((i * 7 + j * 3) % 5) * 0.01) });

test('k-NN: class probabilities, novelty and stored model', () => {
  const ex = [];
  for (let i = 0; i < 10; i++) { ex.push(mk('Zoophycos', 0, i)); ex.push(mk('Chondrites', 1, i)); }
  const c = new Classifier({ k: 5, novelty: 3 }).fit(ex);
  const p = c.predict(FEATURES.map(() => 0.02));
  assert.equal(p.y, 'Zoophycos');
  assert.ok(Math.abs(Object.values(p.probs).reduce((s, v) => s + v, 0) - 1) < 1e-9);
  assert.ok(c.predict(FEATURES.map(() => 50)).novel);
  const back = Classifier.fromJSON(JSON.parse(JSON.stringify(c)));
  const q = back.predict(FEATURES.map(() => 0.98));
  assert.equal(q.y, 'Chondrites'); assert.equal(back.n, 20); assert.equal(back.accuracy, c.accuracy);
});

test('methods and scopes compared on the same test traces', async () => {
  const { TaxonModel, evaluateModels, stratifiedFolds } = await import('../../app/js/learn.js');
  const { fitModel, predictProba } = await import('../../app/js/geo.js');
  const ex = [];
  for (let i = 0; i < 20; i++) { ex.push({ key: 'a' + i, ...mk('Zoophycos', 0, i) }); ex.push({ key: 'b' + i, ...mk('Chondrites', 1, i) }); }
  const folds = stratifiedFolds(ex.map((e) => e.y), 5, 1);
  assert.equal(folds.flat().length, 40); assert.ok(folds.every((f) => f.filter((i) => ex[i].y === 'Zoophycos').length === 4));
  const opt = { k: 5, novelty: 3, fitFn: fitModel, probaFn: predictProba, rf: { trees: 20 } };
  const rf = new TaxonModel({ ...opt, method: 'rf' }).fit(ex);
  assert.equal(rf.predict(FEATURES.map(() => 0.99)).y, 'Chondrites');
  const r = evaluateModels({ test: ex.slice(0, 20), pools: { core: ex.slice(0, 20), project: ex }, methods: ['knn', 'nb', 'rf'], opt });
  for (const sc of ['core', 'project']) for (const m of ['knn', 'nb', 'rf']) assert.equal(r[sc][m].accuracy, 1);
});

test('V22: wrong predictions of a class absent from the test set count as errors; grouped folds', async () => {
  const { evaluateModels, groupedFolds } = await import('../../app/js/learn.js');
  const test = Array.from({ length: 10 }, (_, i) => ({ key: 't' + i, ...mk('A', 0, i) }));
  const pool = Array.from({ length: 10 }, (_, i) => ({ key: 'p' + i, ...mk('C', 0, i) })).concat(Array.from({ length: 10 }, (_, i) => ({ key: 'q' + i, ...mk('D', 5, i) })));
  const r = evaluateModels({ test, pools: { all: pool }, methods: ['knn'], opt: { k: 3 } });
  assert.equal(r.all.knn.accuracy, 0); assert.equal(r.all.knn.n, 10); assert.equal(r.all.knn.other[0], 10);
  const g = ['s1', 's1', 's2', 's2', 's3', 's3', 's4', 's4', 's5', 's5'], f = groupedFolds(test.map(() => 'A'), g, 5, 1);
  for (const fold of f) assert.equal(new Set(fold.map((i) => g[i])).size, 1);
});

test('V0.37: few groups give leave-one-group-out folds and the scheme is reported', async () => {
  const { evaluateModels, groupedFolds } = await import('../../app/js/learn.js');
  const f = groupedFolds(['A', 'B', 'A', 'B', 'A', 'B'], ['s1', 's1', 's2', 's2', 's3', 's3'], 5, 1);
  assert.equal(f.length, 3); assert.ok(f.every((q) => q.length === 2));
  const ex = Array.from({ length: 12 }, (_, i) => ({ key: 'k' + i, g: 'c' + (i % 3), y: i % 2 ? 'A' : 'B', x: [i % 2, (i * 7) % 5] }));
  const r = evaluateModels({ test: ex, pools: { all: ex }, methods: ['knn'], opt: { k: 1 } });
  assert.equal(r.all.knn.scheme, 'logo'); assert.equal(r.all.knn.nGroups, 3);
  const one = evaluateModels({ test: ex, pools: { all: ex }, methods: ['knn'], opt: { k: 1 }, group: () => 'x' });
  assert.equal(one.all.knn.scheme, 'examples');
});

test('V0.49: final-test metrics on reserved cores', async () => {
  const { finalTestMetrics } = await import('../../app/js/learn.js');
  const m = finalTestMetrics([{ y: 'A', p: 'A' }, { y: 'A', p: 'B' }, { y: 'A', p: 'A' }, { y: 'B', p: 'B' }, { y: 'B', p: null }]);
  assert.equal(m.n, 5); assert.equal(m.right, 3); assert.equal(m.accuracy, 0.6); assert.ok(Math.abs(m.balanced - (2 / 3 + 1 / 2) / 2) < 1e-12);
  assert.deepEqual(m.cm, { A: { A: 2, B: 1 }, B: { B: 1, '—': 1 } }); assert.equal(m.none, 1);
  assert.equal(finalTestMetrics([]).accuracy, null);
});
