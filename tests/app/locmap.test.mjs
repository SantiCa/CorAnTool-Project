import test from 'node:test';
import assert from 'node:assert/strict';
import { lmCRS, lmUtmZone, lmFrame, lmFormatDeg, lmFormatMetric, lmDegStep, lmMetricStep, lmScaleBar, lmMetresPerPx, lmNorthAngle, buildLocMapSVG, lmFitBBox } from '../../app/js/locmap.js';

test('V0.43: UTM (WGS 84) against reference values and round trip', () => {
  const u = lmCRS('UTM', { zone: 30 });
  assert.equal(u.epsg, 32630); assert.equal(lmUtmZone(-3.7), 30); assert.equal(lmUtmZone(-10.1), 29); assert.equal(lmUtmZone(179.9), 60);
  const [E, N] = u.fwd(-3, 0); assert.ok(Math.abs(E - 500000) < 1e-6 && Math.abs(N) < 1e-6);
  const [, N45] = u.fwd(-3, 45); assert.ok(Math.abs(N45 - 4982950.4) < 0.5, String(N45));   // k0 × meridian arc to 45° (4 984 944.38 m)
  for (const [lo, la] of [[-3.7038, 40.4168], [-0.5, 37.2], [-5.9, 43.5], [1.9, 36.1]]) { const [x, y] = u.fwd(lo, la), [lo2, la2] = u.inv(x, y); assert.ok(Math.abs(lo2 - lo) < 1e-9 && Math.abs(la2 - la) < 1e-9); }
  const s = lmCRS('UTM', { zone: 19, south: true }); assert.equal(s.epsg, 32719); assert.ok(Math.abs(s.fwd(-69, 0)[1] - 1e7) < 1e-6);
});

test('V0.43: Web Mercator and geographic', () => {
  const m = lmCRS('EPSG:3857'), [x, y] = m.fwd(180, 0); assert.ok(Math.abs(x - 20037508.34) < 0.01 && Math.abs(y) < 1e-6);
  const [lo, la] = m.inv(...m.fwd(-10.126, 37.571)); assert.ok(Math.abs(lo + 10.126) < 1e-9 && Math.abs(la - 37.571) < 1e-9);
  assert.deepEqual(lmCRS('EPSG:4326').fwd(3, 4), [3, 4]);
});

test('V0.43: label formats and grid steps', () => {
  assert.equal(lmFormatDeg(37.5, 'lat', 'dd', 0.5), '37.5°N');
  assert.equal(lmFormatDeg(-10.25, 'lon', 'dd', 0.25), '10.25°W');
  assert.equal(lmFormatDeg(37.5, 'lat', 'dms', 0.5), '37°30′N');
  assert.equal(lmFormatDeg(-9.0125, 'lon', 'dms', 15 / 3600), '9°00′45″W');
  assert.equal(lmFormatDeg(2, 'lon', 'dms', 1), '2°E');
  assert.equal(lmFormatMetric(4480000, 'm'), '4 480 000');
  assert.equal(lmFormatMetric(4480000, 'km', 10000), '4 480 km');
  assert.equal(lmDegStep(2.4, 5), 0.5); assert.equal(lmDegStep(0.5, 5), 10 / 60); assert.equal(lmMetricStep(23000, 5), 5000);
  assert.deepEqual(lmScaleBar(100, 160), { m: 10000, px: 100, label: '10 km' });
});

test('V0.43: frame, scale, north convergence and SVG with labels on chosen sides', () => {
  const pts = [{ name: 'U1385', lat: 37.571, lon: -10.126 }, { name: 'MD01', lat: 37.8, lon: -10.17 }];
  const bb = lmFitBBox(pts, 0.25); assert.ok(bb[0] < -10.17 && bb[2] > -10.126);
  const g = lmCRS('EPSG:4326'), f = lmFrame(g, [-11, 37, -9, 38], 800);
  assert.equal(f.W, 800); assert.equal(f.H, 400);
  const mpp = lmMetresPerPx(f, 400, 200); assert.ok(Math.abs(mpp - (111195 * Math.cos(37.5 * Math.PI / 180) * 2) / 800) / mpp < 0.01);
  assert.ok(Math.abs(lmNorthAngle(f, 400, 200)) < 1e-6);
  const u = lmFrame(lmCRS('UTM', { zone: 30 }), [-10, 37, -9, 38], 800);   // 6° west of the central meridian: north leans
  assert.ok(lmNorthAngle(u, 400, 200) > 2);   // meridians lean towards the central meridian (east here)
  const r = buildLocMapSVG({ settings: { crs: 'UTM', labels: { top: true, bottom: false, left: false, right: true }, coordFmt: 'dms' }, points: pts, title: 'T' });
  assert.ok(r.svg.startsWith('<svg') && r.svg.includes('U1385') && r.svg.includes('EPSG:32629'));
  assert.match(r.svg, /\d \d{3} \d{3}/);   // metric labels in UTM
  const d = buildLocMapSVG({ settings: { coordFmt: 'dms', gridType: 'geo', crs: 'EPSG:3857' }, points: pts });
  assert.match(d.svg, /°\d\d′[NSEW]?/);
});

test('location map uses its text and background colours', () => {
  const r = buildLocMapSVG({ settings: { textColor: '#123456', bgColor: '#fefefe' }, points: [{ name: 'A', lon: -4, lat: 36 }, { name: 'B', lon: -3, lat: 37 }], title: 'T' });
  assert.match(r.svg ?? r, /fill="#fefefe"/);
  assert.match(r.svg ?? r, /<text[^>]*fill="#123456"[^>]*>T</);
});
