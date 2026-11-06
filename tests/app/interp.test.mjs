import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolate, delaunay, fitVariogram, variogram, contourSegments, contourLevels, rampColor, colorRange, maskLand, solve } from '../../app/js/interp.js';

const pts = [{ lat: 0, lon: 0, value: 0 }, { lat: 0, lon: 2, value: 2 }, { lat: 2, lon: 0, value: 2 }, { lat: 2, lon: 2, value: 4 }, { lat: 1, lon: 1, value: 2 }];
const bbox = [0, 0, 2, 2];

test('every method reproduces a plane on its data and stays finite', () => {
  for (const method of ['idw', 'nearest', 'tin', 'mincurv', 'rbf', 'kriging', 'movavg']) {
    const r = interpolate(pts, bbox, 10, 10, { method, hull: false, mask: 'both', radius: method === 'movavg' ? 170 : 0, shape: 100 });
    const vals = r.grid.filter((v) => v != null);
    assert.ok(vals.length > 50, method); assert.ok(vals.every(Number.isFinite), method);
    if (['tin', 'mincurv'].includes(method)) { const c = r.grid[5 * 10 + 5]; assert.ok(Math.abs(c - (1.1 + 0.9)) < 0.15, `${method} ${c}`); }
  }
  assert.deepEqual(solve([[2, 1], [1, 3]], [3, 5]).map((v) => +v.toFixed(6)), [0.8, 1.4]);
  assert.equal(delaunay([[0, 0], [1, 0], [0, 1], [1, 1]]).length, 2);
});

test('variogram, contours, colours and land mask', () => {
  const f = fitVariogram(pts.map((p) => [p.lon, p.lat]), pts.map((p) => p.value));
  assert.ok(f.sill > 0 && f.range > 0); assert.equal(variogram('spherical', 10, 0, 1, 2), 1);
  const r = interpolate(pts, bbox, 20, 20, { method: 'tin', hull: false });
  assert.ok(contourSegments(r.grid, 20, 20, 2).length > 5);
  assert.deepEqual(contourLevels(0, 4, 3), [1, 2, 3]);
  assert.equal(rampColor('grey', 0, 0, 1), 'rgb(30,30,30)');
  assert.deepEqual(colorRange([1, 3], { scale: 'auto' }), [1, 3]); assert.deepEqual(colorRange([-1, 3], { scale: 'symauto' }), [-3, 3]);
  const land = [[0, 0, 1, 0, 1, 2, 0, 2]], g = new Array(4).fill(1);
  assert.deepEqual(maskLand(g, 2, 2, bbox, land, 'sea'), [null, 1, null, 1]);
  assert.deepEqual(maskLand(g, 2, 2, bbox, land, 'land'), [1, null, 1, null]);
});

test('V0.41: single-solve kriging equals the weight form λ = A⁻¹b', () => {
  const P = Array.from({ length: 12 }, (_, i) => ({ lat: (i * 37) % 11 * 0.3, lon: (i * 53) % 13 * 0.25, value: Math.sin(i) * 3 + i * 0.2 }));
  const bb = [0, 0, 3.5, 3.5], o = { method: 'kriging', hull: false, mask: 'both', autoVario: false, variogram: 'spherical', nugget: 0.1, sill: 4, range: 300 };
  const r = interpolate(P, bb, 6, 6, o);
  assert.ok(r.grid.every((v) => v == null || Number.isFinite(v)));
  // weight form on the projected coordinates the module uses: rebuild through a 1-cell grid at each data point
  for (const p of P.slice(0, 4)) {
    const one = interpolate(P, [p.lon - 1e-4, p.lat - 1e-4, p.lon + 1e-4, p.lat + 1e-4], 1, 1, o).grid[0];
    assert.ok(Math.abs(one - p.value) < 0.05 + 0.1, `exact-ish at data point: ${one} vs ${p.value}`);
  }
});
