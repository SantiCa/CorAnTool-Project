// V0.40: one version for the web app (DELIVERY), the Python package, CITATION.cff and the desktop program.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const R = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
test('V0.40: version is the same everywhere', () => {
  const d = R('app/js/app.js').match(/const DELIVERY = '(V\d+(?:\.\d+)*)'/)[1];
  const v = (d.match(/\d+/g).concat('0', '0')).slice(0, 3).map(Number).join('.');
  assert.equal(R('pyproject.toml').match(/^version = "([^"]+)"/m)[1], v, 'pyproject.toml (run tools/sync_version.py)');
  assert.equal(R('src/sedcoretool/__init__.py').match(/^__version__ = "([^"]+)"/m)[1], v, '__init__.py');
  assert.equal(R('CITATION.cff').match(/^version: (.+)$/m)[1].trim(), v, 'CITATION.cff');
  const pj = JSON.parse(R('desktop/package.json'));
  assert.equal(pj.version, v, 'desktop/package.json'); assert.equal(pj.license, 'GPL-3.0-or-later');
  assert.match(R('CITATION.cff'), /^title: "SedCoreTool"/m);
});
