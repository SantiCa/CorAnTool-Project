// V0.42: editing algorithms (edit.js) with synthetic overlapping masks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPieces, mergeKeeper, sameTaxonGroups, undoPixels, idsInLabels, upgradeProject } from '../../app/js/edit.js';
import { codeFor, stackIndex, renameId } from '../../app/js/core.js';

// 10 × 6 image: trace 1 is a horizontal bar (rows 2–3, x 1–8); trace 2 a vertical bar (x 4–5, rows 0–5) that overlaps it
function scene() {
  const w = 10, h = 6, L = new Int32Array(w * h), stacks = [null], ix = stackIndex(stacks);
  for (let y = 2; y <= 3; y++) for (let x = 1; x <= 8; x++) L[y * w + x] = 1;
  for (let y = 0; y <= 5; y++) for (let x = 4; x <= 5; x++) { const i = y * w + x; L[i] = L[i] ? codeFor([1, 2], stacks, ix) : 2; }
  return { w, h, L, stacks, ix };
}

test('V0.42: scissors split an overlapped trace into pieces; the largest keeps the id', () => {
  const { w, L, stacks } = scene();
  const cut = new Set([2 * w + 3, 3 * w + 3]);   // cut column x = 3 through trace 1
  const r = splitPieces(L, w, stacks, [1, 2, 8, 3], 1, cut);
  assert.equal(r.n, 2);
  const sizes = [1, 2].map((k) => [...r.comp].filter((v) => v === k).length);
  assert.equal(sizes.reduce((a, b) => a + b), 16);   // every pixel of trace 1 (cut ones included) is in a piece
  assert.equal(r.main, sizes[0] > sizes[1] ? 1 : 2);
  assert.equal(splitPieces(L, w, stacks, [1, 2, 8, 3], 1, new Set()).n, 1);   // no cut: one piece
});

test('V0.42: same-ichnotaxon overlaps are grouped; different ichnotaxa stay apart', () => {
  const { w, L, stacks } = scene();
  const objs = (c1, c2) => new Map([[1, { id: 1, bbox: [1, 2, 8, 3], cls: c1, area: 16 }], [2, { id: 2, bbox: [4, 0, 5, 5], cls: c2, area: 12 }]]);
  assert.deepEqual(sameTaxonGroups(L, w, stacks, objs('zoo', 'zoo'), [1]), [[1, 2]]);
  assert.deepEqual(sameTaxonGroups(L, w, stacks, objs('zoo', 'pla'), [1]), []);
  assert.equal(mergeKeeper([...objs('zoo', null).values()]).id, 1);
  assert.equal(mergeKeeper([...objs(null, 'pla').values()]).id, 2);   // a class given by hand wins over size
});

test('V0.42: merge by renaming, then undo restores every pixel', () => {
  const { w, L, stacks, ix } = scene(), before = L.slice(), ex = new Uint8Array(L.length), lm = [], exl = [];
  for (let i = 0; i < L.length; i++) if (L[i]) { const v = renameId(L[i], 2, 1, stacks, ix); if (v !== L[i]) { lm.push(i, L[i]); L[i] = v; } }
  assert.deepEqual([...idsInLabels(L, stacks)], [1]);
  ex[5] = 1; exl.push(5, 0);
  undoPixels(L, ex, lm, exl);
  assert.deepEqual([...L], [...before]); assert.equal(ex[5], 0);
});

test('V0.42: v2 project files are upgraded to cores', () => {
  const v2 = { version: 2, name: 'P', sections: [{ name: 's', units: 'cm' }], records: [{ id: 'r' }], age: { text: '0,0\n1,1', units: 'ka' },
    geo: { cores: [{ id: 'main', name: 'Main · x', lat: 1, lon: 2 }, { id: 'g1', name: 'G1', depth: [0, 1], proxies: { Ca: [1, 2] }, ageText: '0,0' }], layers: [] } };
  const p = upgradeProject(v2);
  assert.equal(p.version, 3); assert.equal(p.cores.length, 2); assert.equal(p.cores[0].name, 'Main'); assert.equal(p.cores[0].units, 'cm');
  assert.deepEqual(p.cores[1].imp.proxies, { Ca: [1, 2] }); assert.equal(p.geo.cores, undefined); assert.equal(p.curCore, 'main');
  assert.equal(upgradeProject(p), p);
});
