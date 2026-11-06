// V0.49: automatic comparison of the web analysis with the published V2.1 output (Casanova-Arenillas et al. 2020),
// as the Python package already does (tests/test_core.py). Mask decoded once with Pillow (tools/make_v2_fixture.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rleDecode, rowCounts, binRows } from '../../app/js/core.js';
import { parseTable } from '../../app/js/log.js';

const R = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
test('V0.49: web binning and indices reproduce the published V2.1 CSV exactly', () => {
  const fx = JSON.parse(R('tests/app/fixtures/v2_idealized_masks.json'));
  const labels = rleDecode(fx.mask, fx.w * fx.h);
  const counts = rowCounts({ labels, width: fx.w, roi: { x0: 0, x1: fx.w, y0: 0, y1: fx.h }, exclude: null, effClass: [-1, 0], nClasses: 1 });
  const bins = binRows(counts, { top: fx.top, bottom: fx.bottom, binPx: fx.binPx });
  const v2 = parseTable(R('legacy/v2.1_console/example_output.csv'));
  const col = (n) => v2.headers.indexOf(n);
  assert.equal(v2.rows.length, 110); assert.ok(bins.length >= 110);   // V2 dropped the last, partial interval
  v2.rows.forEach((r, i) => {
    assert.ok(Math.abs(bins[i].depth - r[col('Depth')]) < 1e-9, `depth ${i}`);
    assert.ok(Math.abs(bins[i].pct - r[col('Bioturbation Percentage')]) < 1e-9, `pct ${i}: ${bins[i].pct} vs ${r[col('Bioturbation Percentage')]}`);
    assert.equal(bins[i].BI, r[col('BI')], `BI ${i}`); assert.equal(bins[i].ii, r[col('II')], `ii ${i}`);
  });
});
