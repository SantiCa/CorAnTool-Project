import test from 'node:test';
import assert from 'node:assert/strict';
import { evalColumn, evalCells, parseFormula, cellName } from '../../app/js/sheet.js';

test('column formulas: names with symbols, functions, missing values', () => {
  const cols = { 'XRF Ba/Ti': [2, 4, null, 8], TOC_pct: [1, 2, 2, 0], depth: [0, 1, 2, 3] };
  assert.deepEqual(evalColumn('[XRF Ba/Ti] / TOC_pct', cols, 4), [2, 2, null, null]);
  assert.deepEqual(evalColumn('=log10([XRF Ba/Ti]) * 0 + depth ^ 2', cols, 4), [0, 1, null, 9]);
  assert.deepEqual(evalColumn('if(TOC_pct > 1, 1, 0)', cols, 4), [0, 1, 1, 0]);
  const z = evalColumn('zscore(depth)', cols, 4); assert.ok(Math.abs(z[0] + 1.1619) < 1e-3 && Math.abs(z[3] - 1.1619) < 1e-3);
  assert.deepEqual(evalColumn('movavg(depth, 3)', cols, 4), [0.5, 1, 2, 2.5]);
  assert.deepEqual(evalColumn('5', cols, 4), [5, 5, 5, 5]);
  assert.throws(() => evalColumn('nope + 1', cols, 4), /no existe/);
  assert.throws(() => parseFormula('(1 + 2'), /\)/);
});

test('cells: references, ranges, aggregates, columns, cycles', () => {
  const r = evalCells({ A1: '2', A2: '3', A3: '=SUM(A1:A2)*2', B1: '=MEAN(COL("x"))', B2: '=CORR(COL("x"), COL("y"))', C1: '=C2', C2: '=C1', D1: 'texto' },
    (name) => ({ x: [1, 2, 3], y: [2, 4, 6] })[name]);
  assert.equal(r.A3, 10); assert.equal(r.B1, 2); assert.ok(Math.abs(r.B2 - 1) < 1e-12);
  assert.ok(r.C1.error); assert.equal(r.D1, 'texto');
  assert.equal(cellName(0, 0), 'A1'); assert.equal(cellName(27, 4), 'AB5');
});

test('V0.35: formula references and linear filling', async () => {
  const { formulaRefs, fillLinear } = await import('../../app/js/sheet.js');
  assert.deepEqual(formulaRefs('[reflectance_L*] / a + log(b)').sort(), ['a', 'b', 'reflectance_L*']);
  assert.deepEqual(fillLinear([0, 1, 2, 3, 4], [null, 10, null, 30, null]), [null, 10, 20, 30, null]);
  assert.deepEqual(fillLinear([0, 1, 5], [0, null, 10], 2), [0, null, 10]);
});
