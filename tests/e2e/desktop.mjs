// V0.48: actual Electron, app://, worker, preload IPC and save-on-close across process restarts.
// Needs desktop/npm ci + prepare-web and puppeteer-core at the repository root.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { default: puppeteer } = await import(process.env.PUPPETEER_MODULE || 'puppeteer-core');
const root = fileURLToPath(new URL('../../', import.meta.url));
const requireDesktop = createRequire(path.join(root, 'desktop/package.json'));
const executable = requireDesktop('electron');
const profile = mkdtempSync(path.join(tmpdir(), 'sedcoretool-desktop-test-'));
const errors = [];
const signature = () => window.ichantool.S.sections.map((s) => `${s.objects.size}:${s.labels.reduce((a, v) => a + !!v, 0)}`).join(',');

async function start() {
  const env = { ...process.env, SEDCORETOOL_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [path.join(root, 'tests/e2e/desktop-bootstrap.cjs'), '--headless', '--no-sandbox', '--remote-debugging-port=0'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Electron startup timed out: ' + log.slice(-1500))), 60000);
    child.once('error', reject);
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Electron exited (${code}): ${log.slice(-1500)}`)); });
    child.stderr.on('data', (bytes) => {
      log += bytes;
      const hit = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (hit) { clearTimeout(timeout); resolve(hit[1]); }
    });
    child.stdout.on('data', (bytes) => { log += bytes; });
  }).catch((error) => { child.kill(); throw error; });
  const browser = await puppeteer.connect({ browserWSEndpoint: endpoint, defaultViewport: null });
  const target = await browser.waitForTarget((t) => t.url().startsWith('app://corantool/app/index.html'), { timeout: 60000 });
  const page = await target.page();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (dialog) => dialog.accept().catch((e) => {
    // Electron may finish its deferred save and close before CDP can accept beforeunload.
    if (dialog.type() !== 'beforeunload') errors.push(e.message);
  }));
  await page.waitForFunction(() => !!window.ichantool, { timeout: 60000 });
  return { child, exited, browser, page };
}

async function close(run) {
  // Close the real BrowserWindow. beforeunload must finish pending saves before the process exits.
  await run.page.close({ runBeforeUnload: true });
  let timer;
  try {
    const code = await Promise.race([run.exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Electron did not finish saving and close')), 30000); })]);
    assert.equal(code, 0, 'Electron exit code');
  } finally { clearTimeout(timer); run.browser.disconnect(); }
}

let run;
try {
  run = await start();
  const p = run.page;
  const desktop = await p.evaluate(async () => ({
    origin: location.origin,
    trainer: await window.corantoolDesktop.trainer.status(),
    ort: (await fetch('vendor/ort/ort.wasm.min.js')).ok,
    csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
  }));
  assert.equal(desktop.origin, 'app://corantool');
  assert.ok(!desktop.trainer.busy, 'trainer is idle');
  assert.ok(desktop.ort, 'bundled ONNX runtime');
  assert.ok(desktop.csp, 'CSP present');
  // Optional real-model/network checks use a local pinned ONNX file and a fixed public map extent.
  // CI remains independent of external services and a large model download.
  if (process.env.SEDCORETOOL_VISION_MODEL) {
    await p.addScriptTag({ url: 'app://corantool/app/vendor/ort/ort.wasm.min.js' });
    await p.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'smokeModel'; document.body.append(input); });
    await (await p.$('#smokeModel')).uploadFile(process.env.SEDCORETOOL_VISION_MODEL);
    const vision = await p.evaluate(async () => {
      const m = await import('app://corantool/app/js/vision.js');
      const bytes = await document.getElementById('smokeModel').files[0].arrayBuffer();
      const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) => v.toString(16).padStart(2, '0')).join('');
      if (sha !== m.VISION_MODEL.sha256) throw new Error('DINOv2 SHA-256 mismatch');
      window.ort.env.wasm.wasmPaths = 'app://corantool/app/vendor/ort/'; window.ort.env.wasm.numThreads = 1;
      const session = await window.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
      const rgba = new Uint8ClampedArray(32 * 32 * 4);
      for (let i = 0; i < rgba.length; i++) rgba[i] = i % 4 === 3 ? 255 : (i * 17) % 256;
      const input = m.traceInput(rgba, 32, 32, m.traceWindow([3, 4, 25, 27]));
      const output = await session.run({ [session.inputNames[0]]: new window.ort.Tensor('float32', input, [1, 3, 224, 224]) });
      const embedding = m.pickEmbedding(output, session.outputNames);
      await session.release();
      return { sha, dim: embedding.length, finite: embedding.every(Number.isFinite), norm: Math.hypot(...embedding) };
    });
    assert.equal(vision.dim, 384); assert.ok(vision.finite); assert.ok(Math.abs(vision.norm - 1) < 0.001);
    console.log('DINOv2 real-model smoke ok:', JSON.stringify(vision));
  }
  if (process.env.SEDCORETOOL_NETWORK_SMOKE === '1') {
    const maps = await p.evaluate(async () => {
      const services = ['World_Imagery', 'World_Topo_Map', 'World_Shaded_Relief', 'World_Physical_Map', 'World_Street_Map', 'Ocean/World_Ocean_Base'];
      return Promise.all(services.map(async (service) => {
        const url = `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/export?bbox=0,35,5,40&bboxSR=4326&imageSR=4326&size=256,256&format=jpg&f=image`;
        const response = await fetch(url); if (!response.ok) throw new Error(service + ': HTTP ' + response.status);
        const image = await createImageBitmap(await response.blob());
        return { service, width: image.width, height: image.height };
      }));
    });
    for (const map of maps) { assert.equal(map.width, 256); assert.equal(map.height, 256); }
    console.log('Esri network smoke ok:', JSON.stringify(maps));
  }
  await p.evaluate(() => document.getElementById('openTest').click());
  await p.waitForFunction(() => window.ichantool.S.sections.length === 6 && window.ichantool.S.sections.every((s) => s.objects.size > 0), { timeout: 90000 });
  await p.waitForFunction(() => document.getElementById('saveState').dataset.state === 'saved', { timeout: 30000 });
  const before = await p.evaluate(signature);
  // An edit immediately followed by close exercises the desktop's deferred beforeunload save.
  const deleted = await p.evaluate(() => {
    const I = window.ichantool, s = I.S.sections[I.S.cur], id = s.objects.keys().next().value;
    I.S.selected = id;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    return !s.objects.has(id);
  });
  assert.ok(deleted, 'trace deleted before closing');
  const edited = await p.evaluate(signature);
  assert.notEqual(edited, before);
  await close(run); run = null;
  run = await start();
  await run.page.waitForFunction(() => window.ichantool.S.sections.length === 6, { timeout: 60000 });
  assert.equal(await run.page.evaluate(signature), edited, 'pending edit survived a full process restart');
  assert.deepEqual(errors, [], 'renderer errors');
  await close(run); run = null;
  console.log('Desktop E2E ok: app://, CSP, bundled ORT, trainer IPC, detection and pending save across restart');
} finally {
  if (run) { run.browser.disconnect(); run.child.kill(); }
  // Profiles contain only public example data and remain in the temporary directory for diagnosis.
}
