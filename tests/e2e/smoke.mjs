// V0.42: end-to-end check in a headless Chrome. Needs the repository served (python3 -m http.server 8765) and
// puppeteer-core (npm i --no-save puppeteer-core@23). CHROME = path of Chrome (default /usr/bin/google-chrome).
// Opens the IODP test core, detects, undoes, saves, reloads and compares; fails on any page error.
// V0.49: also compares the web analysis of the idealized core (browser JPEG decoder) with the V2.1 reference CSV.
import puppeteer from 'puppeteer-core';

const URL = process.env.APP_URL || 'http://localhost:8765/app/index.html';
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage(), errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource|simulated quota exceeded/.test(m.text())) errs.push(m.text()); });
p.on('dialog', (d) => d.accept());
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn)) return; await W(500); } throw new Error('timeout: ' + fn); };
const fail = (m) => { console.error('E2E FAIL:', m); process.exitCode = 1; };
try {
  await p.goto(URL, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.getElementById('openTest').click());
  await until(() => window.ichantool?.S.sections.length === 6 && window.ichantool.S.sections.every((s) => s.objects.size > 0));
  await until(() => document.getElementById('saveState').dataset.state === 'saved');
  // The column controls change only the drawing and can restore their defaults.
  const ui = await p.evaluate(async () => {
    const I = window.ichantool; I.setMode('log');
    const mark = document.querySelector('#logTracks [data-track="marks"]');
    const initial = mark.checked; mark.checked = false; mark.dispatchEvent(new Event('change', { bubbles: true }));
    const hidden = I.S.logView.tracks.marks === false;
    const color = document.querySelector('#logStyle [data-st="biColor"]');
    color.value = '#123456'; color.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const applied = document.querySelector('#logSvg svg')?.outerHTML.includes('#123456');
    document.querySelector('#logStyle [data-colreset="log"]').click();
    const reset = I.S.logView.style.biColor == null;
    document.querySelector('#logTracks [data-track="marks"]').click(); I.setMode('section');
    return { initial, hidden, applied, reset };
  });
  if (!Object.values(ui).every(Boolean)) fail(`column controls: ${JSON.stringify(ui)}`);
  const first = await p.evaluate(() => window.ichantool.S.sections[window.ichantool.S.cur].objects.size);
  await p.evaluate(() => window.ichantool.runDetection()); await W(3000);
  const again = await p.evaluate(() => window.ichantool.S.sections[window.ichantool.S.cur].objects.size);
  if (again !== first) fail(`detection is not repeatable: ${first} → ${again}`);
  // one undoable edit: delete a trace, then undo
  const del = await p.evaluate(() => { const I = window.ichantool, s = I.S.sections[I.S.cur], id = [...s.objects.keys()][0]; I.S.selected = id; document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); return [s.objects.size, s.objects.has(id), id]; });
  if (del[1]) fail('delete did not remove the trace');
  await p.evaluate(() => document.getElementById('undoBtn').click()); await W(500);
  const undone = await p.evaluate((id) => window.ichantool.S.sections[window.ichantool.S.cur].objects.has(id), del[2]);
  if (!undone) fail('undo did not restore the trace');
  await p.evaluate(() => window.ichantool.saveToDB()); await W(1500);
  const sig = () => window.ichantool.S.sections.map((s) => `${s.objects.size}:${s.labels.reduce((a, v) => a + (v ? 1 : 0), 0)}`).join(',');
  const before = await p.evaluate(sig);
  await p.reload({ waitUntil: 'networkidle0' });
  await until(() => window.ichantool?.S.sections.length === 6);
  await p.evaluate(async () => { for (const s of window.ichantool.S.sections) void s.labels; });
  const after = await p.evaluate(sig);
  if (before !== after) fail(`saved and reloaded project differs:\n${before}\n${after}`);
  // V0.49: web–V2 comparison with the browser's own JPEG decoder (L < 6, rowCounts, binRows of 150 px). The decoder
  // differs from Pillow's at the edges of the painted traces, so percentages may differ slightly; BI and ii must not.
  const v2 = await p.evaluate(async () => {
    const { rowCounts, binRows } = await import('./js/core.js'), { parseTable } = await import('./js/log.js');
    const img = new Image(); img.src = '../examples/data/idealized_core_0-500cm.jpg'; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, labels = new Int32Array(c.width * c.height);
    for (let i = 0; i < labels.length; i++) labels[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2] < 6 ? 1 : 0;
    const bins = binRows(rowCounts({ labels, width: c.width, roi: { x0: 0, x1: c.width, y0: 0, y1: c.height }, exclude: null, effClass: [-1, 0], nClasses: 1 }), { top: 0, bottom: 500, binPx: 150 });
    const t = parseTable(await (await fetch('../legacy/v2.1_console/example_output.csv')).text()), k = (n) => t.headers.indexOf(n);
    const dp = t.rows.map((r, i) => Math.abs(bins[i].pct - r[k('Bioturbation Percentage')]));
    return { n: t.rows.length, bi: t.rows.filter((r, i) => bins[i].BI === r[k('BI')]).length, ii: t.rows.filter((r, i) => bins[i].ii === r[k('II')]).length,
      depth: Math.max(...t.rows.map((r, i) => Math.abs(bins[i].depth - r[k('Depth')]))), max: Math.max(...dp), mean: dp.reduce((a, v) => a + v, 0) / dp.length };
  });
  if (v2.bi !== v2.n || v2.ii !== v2.n || v2.depth > 1e-9 || v2.max > 0.6) fail(`web–V2 in the browser: BI ${v2.bi}/${v2.n}, ii ${v2.ii}/${v2.n}, depth ${v2.depth}, max Δ% ${v2.max}`);
  console.log(`web–V2 in the browser: ${v2.n} intervals, BI and ii identical, max Δ ${v2.max.toFixed(2)} points, mean ${v2.mean.toFixed(2)}`);
  // Simulate a failed desktop save: the page must remain open with its changes pending.
  const failure = await p.evaluate(async () => {
    const I = window.ichantool; document.getElementById('projClose').click(); I.setMode('section');
    const s = I.S.sections[I.S.cur], id = s.objects.keys().next().value;
    I.S.selected = id; document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    if (s.objects.has(id)) throw new Error('failed to create an unsaved edit');
    const tx = IDBDatabase.prototype.transaction, close = window.close, desktop = window.corantoolDesktop, logError = console.error;
    console.error = (error) => { if (error?.message !== 'simulated quota exceeded') logError(error); };
    let closed = false; window.close = () => { closed = true; }; window.corantoolDesktop = {};
    IDBDatabase.prototype.transaction = function (stores, mode, ...args) {
      if (mode === 'readwrite') throw new DOMException('simulated quota exceeded', 'QuotaExceededError');
      return tx.call(this, stores, mode, ...args);
    };
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const result = { closed, state: document.getElementById('saveState').dataset.state };
    IDBDatabase.prototype.transaction = tx; window.close = close; window.corantoolDesktop = desktop; console.error = logError;
    return result;
  });
  if (failure.closed || failure.state !== 'error') fail(`failed save did not keep the window open: ${JSON.stringify(failure)}`);
  if (errs.length) fail('page errors: ' + errs.join(' | '));
  console.log(process.exitCode ? 'E2E finished with failures' : `E2E ok (${first} traces in the first section; reload identical)`);
} catch (e) { fail(e.message); } finally { await b.close(); }
