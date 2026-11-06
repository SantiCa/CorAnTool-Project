// Copies the web application into desktop/web (the folder packaged in the executable).
// V0.50: no sample data is packaged (no test core, example images, demos nor tutorial); the user brings the data. Only
// the public-domain coastline used by the maps (Natural Earth, examples/data/land-50m.json) is copied.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..'), WEB = path.resolve(__dirname, '..', 'web');
const EXAMPLES = ['data/land-50m.json'];
fs.rmSync(WEB, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'app'), path.join(WEB, 'app'), { recursive: true, filter: (p) => !/README\.md$/.test(p) });
for (const d of EXAMPLES) if (fs.existsSync(path.join(ROOT, 'examples', d))) { fs.mkdirSync(path.dirname(path.join(WEB, 'examples', d)), { recursive: true }); fs.cpSync(path.join(ROOT, 'examples', d), path.join(WEB, 'examples', d), { recursive: true }); }
// V0.15: ONNX Runtime Web for the U-Net (classic script + single-threaded SIMD WebAssembly), so it works offline.
const ORT = path.resolve(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');
if (fs.existsSync(ORT)) {
  fs.mkdirSync(path.join(WEB, 'app', 'vendor', 'ort'), { recursive: true });
  for (const f of ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) fs.copyFileSync(path.join(ORT, f), path.join(WEB, 'app', 'vendor', 'ort', f));
} else console.warn('onnxruntime-web not installed: the U-Net will be loaded from the internet');
// V0.17: Python package source (installed by the training module on the user's computer)
const PY = path.resolve(__dirname, '..', 'python');
fs.rmSync(PY, { recursive: true, force: true }); fs.mkdirSync(PY, { recursive: true });
fs.cpSync(path.join(ROOT, 'src'), path.join(PY, 'src'), { recursive: true, filter: (p) => !/__pycache__|\.egg-info/.test(p) });
for (const f of ['pyproject.toml', 'README.md', 'LICENSE']) fs.copyFileSync(path.join(ROOT, f), path.join(PY, f));
const m = fs.readFileSync(path.join(ROOT, 'app', 'js', 'app.js'), 'utf8').match(/const DELIVERY = '(V\d+(?:\.\d+)*)'/);
fs.writeFileSync(path.join(WEB, 'DELIVERY'), m ? m[1] : 'V0');
console.log('web ready:', WEB, m && m[1]);
