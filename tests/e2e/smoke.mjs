// V0.42: end-to-end check in a headless Chrome. Needs the repository served (python3 -m http.server 8765) and
// puppeteer-core (npm i --no-save puppeteer-core@23). CHROME = path of Chrome (default /usr/bin/google-chrome).
// Opens the IODP test core, detects, undoes, saves, reloads and compares; fails on any page error.
import puppeteer from 'puppeteer-core';

const URL = process.env.APP_URL || 'http://localhost:8765/app/index.html';
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 900 } });
const p = await b.newPage(), errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
p.on('dialog', (d) => d.accept());
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn)) return; await W(500); } throw new Error('timeout: ' + fn); };
const fail = (m) => { console.error('E2E FAIL:', m); process.exitCode = 1; };
try {
  await p.goto(URL, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.getElementById('openTest').click());
  await until(() => window.ichantool?.S.sections.length === 6 && window.ichantool.S.sections.every((s) => s.objects.size > 0));
  await until(() => document.getElementById('saveState').dataset.state === 'saved');
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
  if (errs.length) fail('page errors: ' + errs.join(' | '));
  console.log(process.exitCode ? 'E2E finished with failures' : `E2E ok (${first} traces in the first section; reload identical)`);
} catch (e) { fail(e.message); } finally { await b.close(); }
