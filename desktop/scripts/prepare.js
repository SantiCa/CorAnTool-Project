// Copies the web application and the public examples into desktop/web (the folder packaged in the executable).
// Copies only the app and the public examples.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..'), WEB = path.resolve(__dirname, '..', 'web');
const EXAMPLES = ['data', 'tutorial', 'U1385I-1H', 'geochem_demo'];
fs.rmSync(WEB, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'app'), path.join(WEB, 'app'), { recursive: true, filter: (p) => !/README\.md$/.test(p) });
for (const d of EXAMPLES) if (fs.existsSync(path.join(ROOT, 'examples', d))) fs.cpSync(path.join(ROOT, 'examples', d), path.join(WEB, 'examples', d), { recursive: true });
// V0.15: ONNX Runtime Web for the U-Net (classic script + single-threaded SIMD WebAssembly), so it works offline.
const ORT = path.resolve(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');
if (fs.existsSync(ORT)) {
  fs.mkdirSync(path.join(WEB, 'app', 'vendor', 'ort'), { recursive: true });
  for (const f of ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) fs.copyFileSync(path.join(ORT, f), path.join(WEB, 'app', 'vendor', 'ort', f));
} else console.warn('onnxruntime-web not installed: the U-Net will be loaded from the internet');
const m = fs.readFileSync(path.join(ROOT, 'app', 'js', 'app.js'), 'utf8').match(/const DELIVERY = '(V\d+(?:\.\d+)*)'/);
fs.writeFileSync(path.join(WEB, 'DELIVERY'), m ? m[1] : 'V0');
console.log('web ready:', WEB, m && m[1]);
