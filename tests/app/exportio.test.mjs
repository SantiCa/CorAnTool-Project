import test from 'node:test';
import assert from 'node:assert/strict';
import { provenanceLines, withProvenance, ageModelText, bioturbationTable, objectsTable, recordSeries } from '../../app/js/exportio.js';
import { parseTable } from '../../app/js/log.js';

test('V0.44: provenance header and age-model text', () => {
  const l = provenanceLines({ delivery: 'V0.44', format: 5, date: 'D', project: 'a"b', settings: { binCm: 1, minValid: 20, includePred: true, predThr: 0.7, countCandidates: false }, detection: 'adaptive', age: 'none' });
  assert.equal(l[0], `# CorAnTool V0.44 (format 5); exported D; project "a'b"`);
  assert.match(l[1], /binCm=1; minValid=20%; includePred=true; predThr=0.7; countCandidates=false; detection=adaptive; age model=none/);
  assert.equal(withProvenance('x\n', { delivery: 'V', format: 5, date: 'D', project: 'p' }).split('\n')[2], 'x');
  assert.equal(ageModelText({ min: [1] }, { bacon: 'x', units: 'ka' }), 'Bacon median with range, ka');
  assert.equal(ageModelText(null), 'none');
});

test('V0.44: bioturbation and object tables', () => {
  const bins = [{ dTop: 0, dBottom: 1, depth: 0.5, age: 2, ageMin: 1, ageMax: 3, valid: 100, pct: 40, classPct: [10, 30], BI: 3, ii: 4, BIm: null, iim: 5 }];
  const t = bioturbationTable([{ name: 's1', units: 'cm', bins }], { counted: [['Zoo', 1]], range: true, ageUnits: 'ka' });
  assert.deepEqual(t[0].slice(5, 9), ['age', 'age_min', 'age_max', 'age_units']); assert.ok(t[0].includes('Zoo_pct'));
  assert.deepEqual(t[1], ['s1', 0, 1, 0.5, 'cm', 2, 1, 3, 'ka', 100, 40, 30, 3, 4, null, 5]);
  const o = objectsTable([{ section: 's1', units: 'cm', o: { id: 7, bbox: [0, 10, 5, 19], conf: 0.8, feat: { cy: 14, areaCm2: 2 } }, status: 'candidate', counted: true, depth: (r) => r / 10 },
    { section: 's1', o: { id: 8 }, depth: () => 0 }]);
  assert.equal(o.length, 2); assert.deepEqual(o[1].slice(0, 11), ['s1', 7, '', 'candidate', '', 0.8, 1, 2, 1.45, 'cm', 2]); assert.equal(o[1].at(-1), 1);
});

test('V0.44: record series from a table', () => {
  const tab = parseTable('depth;Ba;Ti\n2;5;\n1;4;7\n3;n.d.;8');
  const s = recordSeries(tab, 0, [1, 2], ['#a', '#b', '#c'], 2);
  assert.deepEqual(s.map((x) => [x.name, x.x, x.y, x.color]), [['Ba', [1, 2], [4, 5], '#c'], ['Ti', [1, 3], [7, 8], '#a']]);
  assert.deepEqual(recordSeries(tab, 0, [], ['#a']), []);
});
